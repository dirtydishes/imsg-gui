import type { DatabaseClient } from "../db/types.js";
import { z } from "zod";
import type { NlpJobRequest } from "@imsg/shared";
import { createId } from "../utils/ids.js";
import { nowIso } from "../utils/time.js";

const selectionSchema = z
  .object({
    participantIds: z.array(z.string()).optional(),
    conversationIds: z.array(z.string()).optional(),
    dateStart: z.string().optional(),
    dateEnd: z.string().optional(),
    maxMessages: z.number().int().positive().max(10000).optional(),
  })
  .refine(
    (value) =>
      Boolean(
        value.participantIds?.length ||
          value.conversationIds?.length ||
          value.dateStart ||
          value.dateEnd
      ),
    "At least one selection filter is required"
  );

const requestSchema = z.object({
  analysisType: z.enum(["sentiment_trend", "topic_clusters", "tone_shift", "conversation_health"]),
  selection: selectionSchema,
  consent: z.object({
    approved: z.literal(true),
    approvedAt: z.string(),
  }),
});

export function createNlpJob(db: DatabaseClient, request: NlpJobRequest): {
  jobId: string;
  recordCount: number;
} {
  const parsed = requestSchema.parse(request);

  const filters: string[] = [];
  const values: string[] = [];

  if (parsed.selection.participantIds?.length) {
    filters.push(
      `participant_id IN (${parsed.selection.participantIds.map(() => "?").join(",")})`
    );
    values.push(...parsed.selection.participantIds);
  }
  if (parsed.selection.conversationIds?.length) {
    filters.push(
      `conversation_id IN (${parsed.selection.conversationIds.map(() => "?").join(",")})`
    );
    values.push(...parsed.selection.conversationIds);
  }
  if (parsed.selection.dateStart) {
    filters.push("sent_at >= ?");
    values.push(parsed.selection.dateStart);
  }
  if (parsed.selection.dateEnd) {
    filters.push("sent_at <= ?");
    values.push(parsed.selection.dateEnd);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const row = db
    .prepare(`SELECT COUNT(*) AS total FROM messages ${whereClause}`)
    .get(...values) as { total: number };

  const recordCount = parsed.selection.maxMessages
    ? Math.min(row.total, parsed.selection.maxMessages)
    : row.total;

  const jobId = createId("nlp");
  const now = nowIso();

  db.prepare(
    `INSERT INTO nlp_jobs (id, analysis_type, selection_json, record_count, status, created_at, completed_at)
     VALUES (?, ?, ?, ?, 'completed', ?, ?)`
  ).run(jobId, parsed.analysisType, JSON.stringify(parsed.selection), recordCount, now, now);

  db.prepare(
    `INSERT INTO audit_log (id, event_type, payload_json, created_at)
     VALUES (?, 'nlp_job_created', ?, ?)`
  ).run(
    createId("audit"),
    JSON.stringify({
      jobId,
      analysisType: parsed.analysisType,
      recordCount,
      selection: parsed.selection,
      consentApprovedAt: parsed.consent.approvedAt,
    }),
    now
  );

  db.prepare(
    `INSERT INTO insights (id, scope, scope_id, insight_type, value_json, confidence, source, created_at)
     VALUES (?, 'global', NULL, ?, ?, ?, 'gpt', ?)`
  ).run(
    createId("ins"),
    parsed.analysisType,
    JSON.stringify({
      summary:
        "GPT analysis scaffold complete. Hook Codex OAuth token exchange + model call in the nlp worker.",
      recordCount,
      selection: parsed.selection,
    }),
    0.62,
    now
  );

  return { jobId, recordCount };
}
