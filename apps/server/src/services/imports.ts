import fs from "node:fs";
import path from "node:path";
import { redactedText } from "../utils/normalize.js";
import { sha1 } from "../utils/hash.js";
import type { Store } from "./store.js";
import { parseImazingCsv } from "./ingest/imazingCsv.js";
import { parseImazingTxt } from "./ingest/imazingTxt.js";

export interface ImportResult {
  importId: string;
  insertedMessages: number;
  totalParsedMessages: number;
  qualityScore: number;
}

export function importImazingFile(
  store: Store,
  payload: {
    sourceId: string;
    filePath: string;
    format: "imazing_csv" | "imazing_txt";
  }
): ImportResult {
  const parserResult =
    payload.format === "imazing_csv"
      ? parseImazingCsv(payload.filePath)
      : parseImazingTxt(payload.filePath);

  const importRecord = store.upsertImport({
    sourceId: payload.sourceId,
    format: payload.format,
    filePath: payload.filePath,
    qualityScore: parserResult.qualityScore,
  });

  for (const warning of parserResult.warnings) {
    store.addParseWarning(
      importRecord.id,
      warning.severity,
      warning.code,
      warning.details,
      warning.affectedRows
    );
  }

  let inserted = 0;

  for (const parsed of parserResult.messages) {
    const result = store.upsertMessage({
      sourceId: payload.sourceId,
      sourceMsgKey: parsed.sourceMsgKey,
      sentAt: parsed.sentAt,
      direction: parsed.direction,
      text: parsed.text,
      textRedacted: redactedText(parsed.text),
      hasAttachment: parsed.hasAttachment,
      dedupeHash: sha1(`${parsed.participantHandle}:${parsed.sentAt.slice(0, 16)}:${parsed.text}`),
      participant: {
        displayName: parsed.isSelf ? "Me" : parsed.participantName,
        handle: parsed.participantHandle,
        isSelf: parsed.isSelf,
      },
      conversation: {
        key: parsed.conversationKey,
        title: parsed.conversationTitle,
        isGroup: parsed.isGroup,
      },
      attachment: parsed.attachment,
    });
    if (result.inserted) {
      inserted += 1;
    }
  }

  store.setImportQuality(importRecord.id, parserResult.qualityScore);

  return {
    importId: importRecord.id,
    insertedMessages: inserted,
    totalParsedMessages: parserResult.messages.length,
    qualityScore: parserResult.qualityScore,
  };
}

export function ensureImportPath(baseDataDir: string, filename: string): string {
  const importsDir = path.resolve(baseDataDir, "imports");
  fs.mkdirSync(importsDir, { recursive: true });
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(importsDir, `${Date.now()}-${safeName}`);
}
