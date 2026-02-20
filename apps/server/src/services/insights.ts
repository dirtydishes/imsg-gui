import type { DatabaseClient } from "../db/types.js";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";
import type { InsightCard } from "@imsg/shared";

export function regenerateRuleInsights(db: DatabaseClient): void {
  db.prepare(`DELETE FROM insights WHERE source = 'rule'`).run();

  const topContact = db
    .prepare(
      `SELECT p.id, p.display_name, COUNT(m.id) AS total
       FROM participants p
       JOIN messages m ON m.participant_id = p.id
       WHERE p.is_self = 0
       GROUP BY p.id
       ORDER BY total DESC
       LIMIT 1`
    )
    .get() as { id: string; display_name: string; total: number } | undefined;

  if (topContact) {
    db.prepare(
      `INSERT INTO insights (id, scope, scope_id, insight_type, value_json, confidence, source, created_at)
       VALUES (?, 'global', NULL, 'top_contact', ?, ?, 'rule', ?)`
    ).run(
      createId("ins"),
      JSON.stringify({ participantId: topContact.id, name: topContact.display_name, totalMessages: topContact.total }),
      0.8,
      nowIso()
    );
  }

  const reciprocityRows = db
    .prepare(
      `SELECT
          p.id,
          p.display_name,
          SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END) AS inbound_count,
          SUM(CASE WHEN m.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound_count
       FROM participants p
       JOIN messages m ON m.participant_id = p.id
       WHERE p.is_self = 0
       GROUP BY p.id`
    )
    .all() as Array<{
    id: string;
    display_name: string;
    inbound_count: number;
    outbound_count: number;
  }>;

  const insert = db.prepare(
    `INSERT INTO insights (id, scope, scope_id, insight_type, value_json, confidence, source, created_at)
     VALUES (?, 'participant', ?, 'reciprocity', ?, ?, 'rule', ?)`
  );

  for (const row of reciprocityRows) {
    const total = row.inbound_count + row.outbound_count;
    if (total === 0) {
      continue;
    }

    const score = 1 - Math.abs(row.inbound_count - row.outbound_count) / total;
    insert.run(
      createId("ins"),
      row.id,
      JSON.stringify({
        participantId: row.id,
        name: row.display_name,
        score,
        inbound: row.inbound_count,
        outbound: row.outbound_count,
      }),
      score >= 0.7 ? 0.84 : 0.68,
      nowIso()
    );
  }
}

export function listInsights(db: DatabaseClient, scope?: string): InsightCard[] {
  const rows = scope
    ? (db
        .prepare(
          `SELECT id, scope, scope_id, insight_type, value_json, confidence, source, created_at
           FROM insights
           WHERE scope = ?
           ORDER BY created_at DESC`
        )
        .all(scope) as Array<{
        id: string;
        scope: "participant" | "conversation" | "global";
        scope_id: string | null;
        insight_type: string;
        value_json: string;
        confidence: number;
        source: "rule" | "gpt";
        created_at: string;
      }>)
    : (db
        .prepare(
          `SELECT id, scope, scope_id, insight_type, value_json, confidence, source, created_at
           FROM insights
           ORDER BY created_at DESC`
        )
        .all() as Array<{
        id: string;
        scope: "participant" | "conversation" | "global";
        scope_id: string | null;
        insight_type: string;
        value_json: string;
        confidence: number;
        source: "rule" | "gpt";
        created_at: string;
      }>);

  return rows.map((row) => ({
    id: row.id,
    scope: row.scope,
    scopeId: row.scope_id,
    insightType: row.insight_type,
    value: JSON.parse(row.value_json),
    confidence: row.confidence,
    source: row.source,
    createdAt: row.created_at,
  }));
}
