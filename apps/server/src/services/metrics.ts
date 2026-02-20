import type { DatabaseClient } from "../db/types.js";
import type { ParticipantProfile } from "@imsg/shared";
import { createId } from "../utils/ids.js";
import { parseRangeToStart, nowIso } from "../utils/time.js";

export function recomputeDailyMetrics(db: DatabaseClient): void {
  db.prepare(`DELETE FROM metrics_daily`).run();

  const rows = db
    .prepare(
      `SELECT
         participant_id,
         date(sent_at) AS day,
         SUM(CASE WHEN direction = 'inbound' THEN 1 ELSE 0 END) AS inbound_count,
         SUM(CASE WHEN direction = 'outbound' THEN 1 ELSE 0 END) AS outbound_count,
         COUNT(*) AS total_messages,
         AVG(LENGTH(text)) AS avg_message_length
       FROM messages
       GROUP BY participant_id, date(sent_at)`
    )
    .all() as Array<{
    participant_id: string;
    day: string;
    inbound_count: number;
    outbound_count: number;
    total_messages: number;
    avg_message_length: number;
  }>;

  const insert = db.prepare(
    `INSERT INTO metrics_daily (
      id, scope_type, scope_id, day,
      inbound_count, outbound_count, total_messages,
      avg_message_length, avg_response_minutes, created_at
    ) VALUES (?, 'participant', ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const now = nowIso();
  const tx = db.transaction(() => {
    for (const row of rows) {
      insert.run(
        createId("md"),
        row.participant_id,
        row.day,
        row.inbound_count,
        row.outbound_count,
        row.total_messages,
        row.avg_message_length,
        null,
        now
      );
    }
  });
  tx();
}

function listResponseLatenciesForParticipant(db: DatabaseClient, participantId: string): number[] {
  const rows = db
    .prepare(
      `SELECT sent_at, participant_id, direction
       FROM messages
       WHERE participant_id IN (?, 'participant_self')
       ORDER BY sent_at ASC`
    )
    .all(participantId) as Array<{
    sent_at: string;
    participant_id: string;
    direction: "inbound" | "outbound";
  }>;

  const latencies: number[] = [];

  for (let i = 0; i < rows.length - 1; i += 1) {
    const current = rows[i];
    const next = rows[i + 1];
    if (!current || !next) {
      continue;
    }
    if (current.participant_id === participantId && current.direction === "inbound" && next.direction === "outbound") {
      const ms = Date.parse(next.sent_at) - Date.parse(current.sent_at);
      if (ms > 0 && ms <= 48 * 60 * 60 * 1000) {
        latencies.push(ms / 60000);
      }
    }
  }

  return latencies;
}

export function listPeople(db: DatabaseClient, range: string | undefined): ParticipantProfile[] {
  const start = parseRangeToStart(range);

  const rows = db
    .prepare(
      `SELECT
         p.id,
         p.display_name,
         p.normalized_handles,
         p.is_self,
         p.first_seen,
         p.last_seen,
         SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END) AS inbound_count,
         SUM(CASE WHEN m.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound_count,
         COUNT(m.id) AS total_messages,
         COUNT(DISTINCT date(m.sent_at)) AS active_days
       FROM participants p
       LEFT JOIN messages m ON m.participant_id = p.id
       WHERE p.is_self = 0
         AND (m.sent_at IS NULL OR m.sent_at >= ?)
       GROUP BY p.id
       ORDER BY total_messages DESC`
    )
    .all(start) as Array<{
    id: string;
    display_name: string;
    normalized_handles: string;
    is_self: number;
    first_seen: string;
    last_seen: string;
    inbound_count: number;
    outbound_count: number;
    total_messages: number;
    active_days: number;
  }>;

  return rows.map((row) => {
    const total = row.total_messages || 0;
    const inbound = row.inbound_count || 0;
    const outbound = row.outbound_count || 0;
    const reciprocityScore = total === 0 ? 0 : 1 - Math.abs(inbound - outbound) / total;
    const latencies = listResponseLatenciesForParticipant(db, row.id);
    const avgResponseMinutes = latencies.length
      ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length
      : null;

    return {
      id: row.id,
      displayName: row.display_name,
      normalizedHandles: JSON.parse(row.normalized_handles),
      isSelf: Boolean(row.is_self),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      totalMessages: total,
      inboundCount: inbound,
      outboundCount: outbound,
      reciprocityScore,
      avgResponseMinutes,
      activeDays: row.active_days || 0,
    };
  });
}

export function personMetrics(db: DatabaseClient, personId: string): {
  profile: ParticipantProfile | null;
  dailyTrend: Array<{ day: string; inbound: number; outbound: number }>;
  topConversations: Array<{ id: string; title: string; totalMessages: number }>;
} {
  const profile = listPeople(db, "all").find((item) => item.id === personId) ?? null;

  const dailyTrend = db
    .prepare(
      `SELECT day, inbound_count, outbound_count
       FROM metrics_daily
       WHERE scope_type = 'participant' AND scope_id = ?
       ORDER BY day ASC`
    )
    .all(personId) as Array<{ day: string; inbound_count: number; outbound_count: number }>;

  const topConversations = db
    .prepare(
      `SELECT
         c.id,
         c.chat_title,
         COUNT(m.id) AS total_messages
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE m.participant_id = ?
       GROUP BY c.id
       ORDER BY total_messages DESC
       LIMIT 5`
    )
    .all(personId) as Array<{ id: string; chat_title: string; total_messages: number }>;

  return {
    profile,
    dailyTrend: dailyTrend.map((row) => ({
      day: row.day,
      inbound: row.inbound_count,
      outbound: row.outbound_count,
    })),
    topConversations: topConversations.map((row) => ({
      id: row.id,
      title: row.chat_title,
      totalMessages: row.total_messages,
    })),
  };
}

export function conversationSummary(db: DatabaseClient): Array<{
  id: string;
  title: string;
  isGroup: boolean;
  participantCount: number;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  firstSeen: string;
  lastSeen: string;
}> {
  const rows = db
    .prepare(
      `SELECT
        c.id,
        c.chat_title,
        c.is_group,
        c.first_seen,
        c.last_seen,
        COUNT(DISTINCT cp.participant_id) AS participant_count,
        COUNT(m.id) AS total_messages,
        SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END) AS inbound_count,
        SUM(CASE WHEN m.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound_count
       FROM conversations c
       LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
       LEFT JOIN messages m ON m.conversation_id = c.id
       GROUP BY c.id
       ORDER BY total_messages DESC`
    )
    .all() as Array<{
    id: string;
    chat_title: string;
    is_group: number;
    participant_count: number;
    total_messages: number;
    inbound_count: number;
    outbound_count: number;
    first_seen: string;
    last_seen: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    title: row.chat_title,
    isGroup: Boolean(row.is_group),
    participantCount: row.participant_count || 0,
    totalMessages: row.total_messages || 0,
    inboundCount: row.inbound_count || 0,
    outboundCount: row.outbound_count || 0,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
  }));
}

export function timeline(db: DatabaseClient, range: string | undefined): Array<{ day: string; total: number }> {
  const start = parseRangeToStart(range);

  const rows = db
    .prepare(
      `SELECT date(sent_at) AS day, COUNT(*) AS total
       FROM messages
       WHERE sent_at >= ?
       GROUP BY date(sent_at)
       ORDER BY day ASC`
    )
    .all(start) as Array<{ day: string; total: number }>;

  return rows;
}
