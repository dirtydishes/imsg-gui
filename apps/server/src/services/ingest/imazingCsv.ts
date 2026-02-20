import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { normalizeHandle } from "../../utils/normalize.js";
import { sha1 } from "../../utils/hash.js";
import { nowIso } from "../../utils/time.js";
import type { ParsedMessage, ParserWarning } from "./types.js";

function pick(row: Record<string, string>, keys: string[]): string {
  for (const key of keys) {
    const found = Object.entries(row).find(([column]) => column.trim().toLowerCase() === key);
    if (found) {
      return String(found[1] ?? "");
    }
  }
  return "";
}

function parseDate(value: string): string {
  const ts = Date.parse(value);
  return Number.isNaN(ts) ? nowIso() : new Date(ts).toISOString();
}

export function parseImazingCsv(filePath: string): {
  messages: ParsedMessage[];
  warnings: ParserWarning[];
  qualityScore: number;
} {
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as Array<Record<string, string>>;

  const messages: ParsedMessage[] = [];
  let fallbackTimestampCount = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index] ?? {};
    const dateValue = pick(row, ["date", "timestamp", "time"]);
    const parsedTs = Date.parse(dateValue);
    const parsed = Number.isNaN(parsedTs) ? nowIso() : new Date(parsedTs).toISOString();
    if (!dateValue || Number.isNaN(parsedTs)) {
      fallbackTimestampCount += 1;
    }

    const text = pick(row, ["text", "message", "content", "body"]);
    const sender = pick(row, ["sender", "from", "contact", "author"]) || "Unknown";
    const conversation =
      pick(row, ["conversation", "chat", "thread", "conversation name"]) || path.basename(filePath);
    const directionRaw = pick(row, ["direction", "type"]);
    const outgoing = /out|sent|me/i.test(directionRaw) || /me/i.test(sender);
    const participantHandle = normalizeHandle(
      pick(row, ["phone", "handle", "sender id", "email"]) || sender
    );
    const attachment = pick(row, ["attachment", "attachments", "media"]);

    messages.push({
      sourceMsgKey: sha1(`${filePath}:${index}:${dateValue}:${sender}:${text}`),
      sentAt: parsed,
      direction: outgoing ? "outbound" : "inbound",
      text,
      hasAttachment: Boolean(attachment),
      conversationKey: normalizeHandle(conversation) || `conversation_${index}`,
      conversationTitle: conversation,
      isGroup: /,|&|group/i.test(conversation),
      participantHandle,
      participantName: sender,
      isSelf: outgoing,
      attachment: attachment
        ? {
            sourceUri: attachment,
            fileExt: path.extname(attachment).replace(/^\./, "") || undefined,
          }
        : undefined,
    });
  }

  const warnings: ParserWarning[] = [];
  if (fallbackTimestampCount > 0) {
    warnings.push({
      severity: "warning",
      code: "csv_fallback_timestamp",
      details: { count: fallbackTimestampCount },
      affectedRows: fallbackTimestampCount,
    });
  }

  const qualityScore = rows.length === 0 ? 0 : Math.max(0, 100 - (fallbackTimestampCount / rows.length) * 35);

  return { messages, warnings, qualityScore };
}
