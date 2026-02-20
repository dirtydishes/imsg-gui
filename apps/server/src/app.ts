import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { openAppDb } from "./db/database.js";
import { Store } from "./services/store.js";
import { canReadMacosChatDb, syncFromMacos } from "./services/ingest/macos.js";
import { importImazingFile, ensureImportPath } from "./services/imports.js";
import { recomputeDailyMetrics, listPeople, personMetrics, conversationSummary, timeline } from "./services/metrics.js";
import { regenerateRuleInsights, listInsights } from "./services/insights.js";
import { resolveIdentityLink, suggestIdentityLinks } from "./services/identity.js";
import { createNlpJob } from "./services/nlp.js";
import { createReport, findReport, listReports } from "./services/reports.js";

const resolveSchema = z.object({
  participantIdA: z.string(),
  participantIdB: z.string(),
  action: z.enum(["approve", "reject"]),
  method: z.enum(["auto", "manual"]).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const reportSchema = z.object({
  format: z.enum(["csv", "pdf"]),
  range: z.enum(["90d", "12m", "all"]),
});

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(currentDir, "..");
const appDb = openAppDb(appDir);
const store = new Store(appDb);

function lastMacosWatermark(): number {
  const row = appDb
    .prepare(
      `SELECT payload_json
       FROM audit_log
       WHERE event_type = 'macos_sync'
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as { payload_json: string } | undefined;

  if (!row) {
    return 0;
  }

  try {
    const payload = JSON.parse(row.payload_json) as { nextWatermark?: number };
    return payload.nextWatermark ?? 0;
  } catch {
    return 0;
  }
}

function recordMacosSync(payload: Record<string, unknown>): void {
  appDb
    .prepare(
      `INSERT INTO audit_log (id, event_type, payload_json, created_at)
       VALUES (?, 'macos_sync', ?, datetime('now'))`
    )
    .run(`audit_${Date.now()}`, JSON.stringify(payload));
}

export function buildApp() {
  const app = Fastify({ logger: true });

  app.register(cors, { origin: true });
  app.register(multipart);

  app.get("/api/v1/health", async () => {
    const macosStatus = canReadMacosChatDb();
    return {
      ok: true,
      macosStatus,
      dbPath: path.resolve(appDir, "data/imsg.db"),
    };
  });

  app.post("/api/v1/sources/macos/sync", async (_request, reply) => {
    const access = canReadMacosChatDb();
    if (!access.ok) {
      return reply.status(403).send({
        error: "macos_permission_required",
        message: access.hint,
        path: access.path,
      });
    }

    const sourceId = store.ensureDataSource("macos_live", "Local macOS Messages");
    const watermark = lastMacosWatermark();
    const result = syncFromMacos(store, sourceId, watermark);

    recomputeDailyMetrics(appDb);
    regenerateRuleInsights(appDb);

    recordMacosSync({
      scannedMessages: result.scannedMessages,
      insertedMessages: result.insertedMessages,
      nextWatermark: result.nextWatermark,
      sourceId,
    });

    return {
      sourceId,
      ...result,
    };
  });

  app.post("/api/v1/imports/imazing", async (request, reply) => {
    const mp = await request.file();
    if (!mp) {
      return reply.status(400).send({ error: "missing_file", message: "Upload file is required" });
    }

    const formatField = (request.query as { format?: string }).format ?? "";
    const format = formatField === "txt" || mp.filename.toLowerCase().endsWith(".txt") ? "imazing_txt" : "imazing_csv";

    const sourceLabel = `Import ${new Date().toISOString()} (${format})`;
    const sourceId = store.ensureDataSource("imazing_import", sourceLabel);

    const destination = ensureImportPath(path.resolve(appDir, "data"), mp.filename);
    await pipeline(mp.file, fs.createWriteStream(destination));

    const imported = importImazingFile(store, {
      sourceId,
      filePath: destination,
      format,
    });

    recomputeDailyMetrics(appDb);
    regenerateRuleInsights(appDb);

    return {
      sourceId,
      ...imported,
    };
  });

  app.get("/api/v1/people", async (request) => {
    const query = request.query as { range?: string };
    return {
      people: listPeople(appDb, query.range ?? "12m"),
    };
  });

  app.get("/api/v1/people/:id/metrics", async (request, reply) => {
    const params = request.params as { id: string };
    const result = personMetrics(appDb, params.id);
    if (!result.profile) {
      return reply.status(404).send({ error: "not_found", message: "Participant not found" });
    }
    return result;
  });

  app.get("/api/v1/conversations", async () => {
    return { conversations: conversationSummary(appDb) };
  });

  app.get("/api/v1/conversations/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const row = appDb
      .prepare(
        `SELECT id, chat_title, is_group, first_seen, last_seen
         FROM conversations
         WHERE id = ?`
      )
      .get(params.id) as
      | {
          id: string;
          chat_title: string;
          is_group: number;
          first_seen: string;
          last_seen: string;
        }
      | undefined;

    if (!row) {
      return reply.status(404).send({ error: "not_found", message: "Conversation not found" });
    }

    const recentMessages = appDb
      .prepare(
        `SELECT m.id, m.sent_at, m.direction, m.text_redacted, p.display_name
         FROM messages m
         JOIN participants p ON p.id = m.participant_id
         WHERE m.conversation_id = ?
         ORDER BY m.sent_at DESC
         LIMIT 50`
      )
      .all(params.id) as Array<{
      id: string;
      sent_at: string;
      direction: "inbound" | "outbound";
      text_redacted: string;
      display_name: string;
    }>;

    return {
      id: row.id,
      title: row.chat_title,
      isGroup: Boolean(row.is_group),
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      recentMessages: recentMessages.map((item) => ({
        id: item.id,
        sentAt: item.sent_at,
        direction: item.direction,
        textPreview: item.text_redacted,
        author: item.display_name,
      })),
    };
  });

  app.get("/api/v1/timeline", async (request) => {
    const query = request.query as { range?: string };
    return {
      points: timeline(appDb, query.range ?? "12m"),
    };
  });

  app.get("/api/v1/insights", async (request) => {
    const query = request.query as { scope?: string };
    return {
      insights: listInsights(appDb, query.scope),
    };
  });

  app.get("/api/v1/identity-links/suggestions", async () => {
    return {
      suggestions: suggestIdentityLinks(appDb),
    };
  });

  app.post("/api/v1/identity-links/resolve", async (request, reply) => {
    const parsed = resolveSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: parsed.error.message });
    }

    return resolveIdentityLink(appDb, parsed.data);
  });

  app.post("/api/v1/nlp/jobs", async (request, reply) => {
    try {
      const result = createNlpJob(appDb, request.body as never);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid NLP request";
      return reply.status(400).send({ error: "invalid_nlp_request", message });
    }
  });

  app.get("/api/v1/imports/:id/warnings", async (request) => {
    const params = request.params as { id: string };
    return {
      warnings: store.listParseWarnings(params.id),
    };
  });

  app.get("/api/v1/imports", async () => {
    const rows = appDb
      .prepare(
        `SELECT id, source_id, format, file_path, ingested_at, quality_score
         FROM imports
         ORDER BY ingested_at DESC`
      )
      .all() as Array<{
      id: string;
      source_id: string;
      format: string;
      file_path: string;
      ingested_at: string;
      quality_score: number;
    }>;

    return {
      imports: rows.map((row) => ({
        id: row.id,
        sourceId: row.source_id,
        format: row.format,
        filePath: row.file_path,
        ingestedAt: row.ingested_at,
        qualityScore: row.quality_score,
      })),
    };
  });

  app.post("/api/v1/reports", async (request, reply) => {
    const parsed = reportSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "invalid_request", message: parsed.error.message });
    }

    return createReport(appDb, path.resolve(appDir, "data"), parsed.data.format, parsed.data.range);
  });

  app.get("/api/v1/reports", async () => ({ reports: listReports(appDb) }));

  app.get("/api/v1/reports/:id", async (request, reply) => {
    const params = request.params as { id: string };
    const report = findReport(appDb, params.id);
    if (!report) {
      return reply.status(404).send({ error: "not_found", message: "Report not found" });
    }

    const download = (request.query as { download?: string }).download;
    if (download === "1") {
      const contentType = report.format === "pdf" ? "application/pdf" : "text/csv";
      return reply.type(contentType).send(fs.createReadStream(report.filePath));
    }

    return {
      id: report.id,
      format: report.format,
      range: report.range,
      createdAt: report.createdAt,
      downloadUrl: `/api/v1/reports/${report.id}?download=1`,
    };
  });

  app.get("/api/v1/oauth/codex/status", async () => ({
    connected: false,
    mode: "scaffold",
    message:
      "Codex OAuth PKCE scaffolding is in place. Complete provider-specific token exchange before production use.",
  }));

  return app;
}
