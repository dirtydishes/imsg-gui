import type { DatabaseClient } from "../db/types.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

export interface ImportRecord {
  id: string;
  sourceId: string;
  format: "imazing_csv" | "imazing_txt";
  filePath: string;
  ingestedAt: string;
  qualityScore: number;
}

export interface CanonicalMessageInput {
  sourceId: string;
  sourceMsgKey: string;
  sentAt: string;
  direction: "inbound" | "outbound";
  text: string;
  textRedacted: string;
  hasAttachment: boolean;
  dedupeHash: string;
  participant: {
    displayName: string;
    handle: string;
    isSelf: boolean;
  };
  conversation: {
    key: string;
    title: string;
    isGroup: boolean;
  };
  attachment?: {
    mimeType?: string;
    fileExt?: string;
    sizeBytes?: number;
    sourceUri?: string;
  };
}

export class Store {
  constructor(private readonly db: DatabaseClient) {}

  ensureDataSource(type: "macos_live" | "imazing_import", label: string): string {
    const row = this.db
      .prepare(
        `SELECT id FROM data_sources
         WHERE type = ? AND label = ?
         LIMIT 1`
      )
      .get(type, label) as { id: string } | undefined;

    if (row) {
      return row.id;
    }

    const id = createId("src");
    this.db
      .prepare(
        `INSERT INTO data_sources (id, type, label, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, type, label, nowIso());
    return id;
  }

  upsertImport(input: Omit<ImportRecord, "id" | "ingestedAt">): ImportRecord {
    const record: ImportRecord = {
      id: createId("imp"),
      sourceId: input.sourceId,
      format: input.format,
      filePath: input.filePath,
      ingestedAt: nowIso(),
      qualityScore: input.qualityScore,
    };

    this.db
      .prepare(
        `INSERT INTO imports (id, source_id, format, file_path, ingested_at, quality_score)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        record.id,
        record.sourceId,
        record.format,
        record.filePath,
        record.ingestedAt,
        record.qualityScore
      );

    return record;
  }

  setImportQuality(importId: string, qualityScore: number): void {
    this.db
      .prepare(`UPDATE imports SET quality_score = ? WHERE id = ?`)
      .run(qualityScore, importId);
  }

  addParseWarning(
    importId: string,
    severity: "info" | "warning" | "error",
    code: string,
    details: Record<string, unknown>,
    affectedRows: number
  ): void {
    this.db
      .prepare(
        `INSERT INTO parse_warnings (
            id, import_id, severity, code, details_json, affected_rows, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        createId("warn"),
        importId,
        severity,
        code,
        JSON.stringify(details),
        affectedRows,
        nowIso()
      );
  }

  private getOrCreateParticipant(displayName: string, handle: string, isSelf: boolean, seenAt: string): string {
    const row = this.db
      .prepare(
        `SELECT id, normalized_handles, first_seen, last_seen
         FROM participants
         WHERE id = ?`
      )
      .get(isSelf ? "participant_self" : `participant_${handle}`) as
      | { id: string; normalized_handles: string; first_seen: string; last_seen: string }
      | undefined;

    const participantId = isSelf ? "participant_self" : `participant_${handle}`;

    if (!row) {
      this.db
        .prepare(
          `INSERT INTO participants (id, display_name, normalized_handles, is_self, first_seen, last_seen)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(participantId, displayName, JSON.stringify([handle]), isSelf ? 1 : 0, seenAt, seenAt);
      return participantId;
    }

    const handles = new Set<string>(JSON.parse(row.normalized_handles));
    handles.add(handle);
    const firstSeen = seenAt < row.first_seen ? seenAt : row.first_seen;
    const lastSeen = seenAt > row.last_seen ? seenAt : row.last_seen;

    this.db
      .prepare(
        `UPDATE participants
         SET display_name = ?, normalized_handles = ?, first_seen = ?, last_seen = ?
         WHERE id = ?`
      )
      .run(displayName, JSON.stringify([...handles]), firstSeen, lastSeen, participantId);

    return participantId;
  }

  private getOrCreateConversation(key: string, title: string, isGroup: boolean, seenAt: string): string {
    const conversationId = `conversation_${key}`;
    const row = this.db
      .prepare(
        `SELECT id, source_conversation_keys, first_seen, last_seen
         FROM conversations
         WHERE id = ?`
      )
      .get(conversationId) as
      | { id: string; source_conversation_keys: string; first_seen: string; last_seen: string }
      | undefined;

    if (!row) {
      this.db
        .prepare(
          `INSERT INTO conversations (
             id, source_conversation_keys, chat_title, is_group, first_seen, last_seen
           ) VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(conversationId, JSON.stringify([key]), title, isGroup ? 1 : 0, seenAt, seenAt);
      return conversationId;
    }

    const keys = new Set<string>(JSON.parse(row.source_conversation_keys));
    keys.add(key);
    const firstSeen = seenAt < row.first_seen ? seenAt : row.first_seen;
    const lastSeen = seenAt > row.last_seen ? seenAt : row.last_seen;

    this.db
      .prepare(
        `UPDATE conversations
         SET source_conversation_keys = ?, chat_title = ?, is_group = ?, first_seen = ?, last_seen = ?
         WHERE id = ?`
      )
      .run(JSON.stringify([...keys]), title, isGroup ? 1 : 0, firstSeen, lastSeen, conversationId);

    return conversationId;
  }

  upsertMessage(input: CanonicalMessageInput): { inserted: boolean; messageId: string } {
    const participantId = this.getOrCreateParticipant(
      input.participant.displayName,
      input.participant.handle,
      input.participant.isSelf,
      input.sentAt
    );
    const conversationId = this.getOrCreateConversation(
      input.conversation.key,
      input.conversation.title,
      input.conversation.isGroup,
      input.sentAt
    );

    this.db
      .prepare(
        `INSERT OR IGNORE INTO conversation_participants (conversation_id, participant_id)
         VALUES (?, ?)`
      )
      .run(conversationId, participantId);

    const messageId = createId("msg");
    const result = this.db
      .prepare(
        `INSERT OR IGNORE INTO messages (
           id, conversation_id, participant_id, sent_at, direction,
           text, text_redacted, has_attachment,
           source_id, source_msg_key, dedupe_hash
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        messageId,
        conversationId,
        participantId,
        input.sentAt,
        input.direction,
        input.text,
        input.textRedacted,
        input.hasAttachment ? 1 : 0,
        input.sourceId,
        input.sourceMsgKey,
        input.dedupeHash
      );

    if (result.changes > 0 && input.attachment) {
      this.db
        .prepare(
          `INSERT INTO attachments (id, message_id, mime_type, file_ext, size_bytes, source_uri)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(
          createId("att"),
          messageId,
          input.attachment.mimeType ?? null,
          input.attachment.fileExt ?? null,
          input.attachment.sizeBytes ?? null,
          input.attachment.sourceUri ?? null
        );
    }

    return { inserted: result.changes > 0, messageId };
  }

  listParseWarnings(importId: string): Array<{
    id: string;
    importId: string;
    severity: "info" | "warning" | "error";
    code: string;
    details: Record<string, unknown>;
    affectedRows: number;
    createdAt: string;
  }> {
    const rows = this.db
      .prepare(
        `SELECT id, import_id, severity, code, details_json, affected_rows, created_at
         FROM parse_warnings
         WHERE import_id = ?
         ORDER BY created_at DESC`
      )
      .all(importId) as Array<{
      id: string;
      import_id: string;
      severity: "info" | "warning" | "error";
      code: string;
      details_json: string;
      affected_rows: number;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      importId: row.import_id,
      severity: row.severity,
      code: row.code,
      details: JSON.parse(row.details_json),
      affectedRows: row.affected_rows,
      createdAt: row.created_at,
    }));
  }
}
