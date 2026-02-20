import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";
import { normalizeHandle, redactedText } from "../../utils/normalize.js";
import { sha1 } from "../../utils/hash.js";
import { appleTimeToIso } from "../../utils/time.js";
import type { Store } from "../store.js";

interface MacMessageRow {
  msg_rowid: number;
  guid: string | null;
  message_date: number | null;
  message_text: string | null;
  is_from_me: number;
  handle_value: string | null;
  chat_rowid: number | null;
  chat_title: string | null;
  chat_identifier: string | null;
  has_attachment: number;
}

const query = `
SELECT
  m.ROWID AS msg_rowid,
  m.guid AS guid,
  m.date AS message_date,
  COALESCE(m.text, '') AS message_text,
  COALESCE(m.is_from_me, 0) AS is_from_me,
  h.id AS handle_value,
  c.ROWID AS chat_rowid,
  COALESCE(c.display_name, '') AS chat_title,
  COALESCE(c.chat_identifier, '') AS chat_identifier,
  COALESCE(m.cache_has_attachments, 0) AS has_attachment
FROM message m
LEFT JOIN handle h ON h.ROWID = m.handle_id
LEFT JOIN chat_message_join cmj ON cmj.message_id = m.ROWID
LEFT JOIN chat c ON c.ROWID = cmj.chat_id
WHERE m.ROWID > ?
ORDER BY m.ROWID ASC
LIMIT ?`;

export function macosChatDbPath(): string {
  return path.join(os.homedir(), "Library", "Messages", "chat.db");
}

export function canReadMacosChatDb(): { ok: boolean; path: string; hint?: string } {
  const dbPath = macosChatDbPath();
  try {
    fs.accessSync(dbPath, fs.constants.R_OK);
    return { ok: true, path: dbPath };
  } catch {
    return {
      ok: false,
      path: dbPath,
      hint: "Grant Full Disk Access to your terminal/app in macOS Privacy & Security settings.",
    };
  }
}

export function syncFromMacos(store: Store, sourceId: string, watermarkRowId: number): {
  insertedMessages: number;
  nextWatermark: number;
  scannedMessages: number;
} {
  const dbPath = macosChatDbPath();
  const macDb = new Database(dbPath, { readonly: true, create: false });

  const rows = macDb.query(query).all(watermarkRowId, 5000) as MacMessageRow[];
  let insertedMessages = 0;
  let nextWatermark = watermarkRowId;

  for (const row of rows) {
    const sentAt = appleTimeToIso(row.message_date);
    const handle = normalizeHandle(row.handle_value ?? "unknown");
    const isSelf = Boolean(row.is_from_me);
    const text = row.message_text ?? "";
    const sourceMsgKey = row.guid || String(row.msg_rowid);
    const conversationKey =
      normalizeHandle(row.chat_identifier || "") ||
      (row.chat_rowid ? `chat_${row.chat_rowid}` : `direct_${handle}`);

    const result = store.upsertMessage({
      sourceId,
      sourceMsgKey,
      sentAt,
      direction: isSelf ? "outbound" : "inbound",
      text,
      textRedacted: redactedText(text),
      hasAttachment: Boolean(row.has_attachment),
      dedupeHash: sha1(`${handle}:${sentAt.slice(0, 16)}:${text}`),
      participant: {
        displayName: isSelf ? "Me" : row.handle_value || "Unknown",
        handle,
        isSelf,
      },
      conversation: {
        key: conversationKey,
        title: row.chat_title || row.chat_identifier || row.handle_value || "Direct Chat",
        isGroup: Boolean(row.chat_title),
      },
    });

    if (result.inserted) {
      insertedMessages += 1;
    }
    if (row.msg_rowid > nextWatermark) {
      nextWatermark = row.msg_rowid;
    }
  }

  macDb.close();

  return {
    insertedMessages,
    nextWatermark,
    scannedMessages: rows.length,
  };
}
