import type { DatabaseClient } from "../db/types.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

function normName(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function suggestIdentityLinks(db: DatabaseClient): Array<{
  id: string;
  participantIdA: string;
  participantIdB: string;
  confidence: number;
  reason: string;
}> {
  const rows = db
    .prepare(
      `SELECT id, display_name, normalized_handles
       FROM participants
       WHERE is_self = 0
       ORDER BY display_name ASC`
    )
    .all() as Array<{ id: string; display_name: string; normalized_handles: string }>;

  const suggestions: Array<{
    id: string;
    participantIdA: string;
    participantIdB: string;
    confidence: number;
    reason: string;
  }> = [];

  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      const a = rows[i];
      const b = rows[j];
      if (!a || !b) {
        continue;
      }

      const aHandles = new Set<string>(JSON.parse(a.normalized_handles));
      const bHandles = new Set<string>(JSON.parse(b.normalized_handles));
      const sharedHandle = [...aHandles].some((handle) => bHandles.has(handle));
      const sameName = normName(a.display_name) === normName(b.display_name);

      let confidence = 0;
      let reason = "";
      if (sharedHandle) {
        confidence = 0.95;
        reason = "shared normalized handle";
      } else if (sameName) {
        confidence = 0.72;
        reason = "same normalized display name";
      }

      if (confidence > 0) {
        suggestions.push({
          id: `suggestion_${a.id}_${b.id}`,
          participantIdA: a.id,
          participantIdB: b.id,
          confidence,
          reason,
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 100);
}

export function resolveIdentityLink(
  db: DatabaseClient,
  input: {
    participantIdA: string;
    participantIdB: string;
    action: "approve" | "reject";
    method?: "auto" | "manual";
    confidence?: number;
  }
): { ok: true } {
  const id = createId("link");
  const now = nowIso();

  db.prepare(
    `INSERT INTO identity_links (
      id, participant_id_a, participant_id_b, method, confidence, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.participantIdA,
    input.participantIdB,
    input.method ?? "manual",
    input.confidence ?? 0.8,
    input.action === "approve" ? "approved" : "rejected",
    now,
    now
  );

  if (input.action === "approve") {
    db.prepare(
      `UPDATE messages SET participant_id = ? WHERE participant_id = ?`
    ).run(input.participantIdA, input.participantIdB);

    db.prepare(
      `DELETE FROM participants WHERE id = ?`
    ).run(input.participantIdB);
  }

  return { ok: true };
}
