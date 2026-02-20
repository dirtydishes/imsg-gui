import fs from "node:fs";
import path from "node:path";
import { normalizeHandle } from "../../utils/normalize.js";
import { sha1 } from "../../utils/hash.js";
import { nowIso } from "../../utils/time.js";
import type { ParsedMessage, ParserWarning } from "./types.js";

const patterns = [
  /^\[(?<date>[^\]]+)\]\s*(?<name>[^:]+):\s*(?<text>.*)$/,
  /^(?<date>\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s+-\s+(?<name>[^:]+):\s*(?<text>.*)$/i,
  /^(?<name>[^\[]+)\[(?<date>[^\]]+)\]:\s*(?<text>.*)$/,
];

function parseDate(value: string): string {
  const parsed = Date.parse(value.trim());
  if (Number.isNaN(parsed)) {
    return nowIso();
  }
  return new Date(parsed).toISOString();
}

export function parseImazingTxt(filePath: string): {
  messages: ParsedMessage[];
  warnings: ParserWarning[];
  qualityScore: number;
} {
  const raw = fs.readFileSync(filePath, "utf8");
  const lines = raw.split(/\r?\n/);

  const messages: ParsedMessage[] = [];
  let unmatched = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = (lines[i] ?? "").trim();
    if (!line) {
      continue;
    }

    let matched = false;

    for (const pattern of patterns) {
      const result = line.match(pattern);
      if (!result?.groups) {
        continue;
      }

      matched = true;
      const date = parseDate(result.groups.date ?? "");
      const name = (result.groups.name ?? "Unknown").trim();
      const text = (result.groups.text ?? "").trim();
      const isSelf = /me|myself/i.test(name);

      messages.push({
        sourceMsgKey: sha1(`${filePath}:${i}:${line}`),
        sentAt: date,
        direction: isSelf ? "outbound" : "inbound",
        text,
        hasAttachment: false,
        conversationKey: normalizeHandle(path.basename(filePath, path.extname(filePath))),
        conversationTitle: path.basename(filePath, path.extname(filePath)),
        isGroup: /group|,|&/.test(name),
        participantHandle: normalizeHandle(name) || "unknown",
        participantName: name,
        isSelf,
      });
      break;
    }

    if (!matched) {
      unmatched += 1;
    }
  }

  const warnings: ParserWarning[] = [];
  if (unmatched > 0) {
    warnings.push({
      severity: unmatched > 20 ? "error" : "warning",
      code: "txt_unmatched_lines",
      details: { unmatched },
      affectedRows: unmatched,
    });
  }

  const considered = messages.length + unmatched;
  const qualityScore = considered === 0 ? 0 : (messages.length / considered) * 100;

  return { messages, warnings, qualityScore };
}
