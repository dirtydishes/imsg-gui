import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { DatabaseClient } from "../db/types.js";
import { createId } from "../utils/ids.js";
import { nowIso, parseRangeToStart } from "../utils/time.js";

interface ReportRow {
  id: string;
  format: "csv" | "pdf";
  range: "90d" | "12m" | "all";
  file_path: string;
  created_at: string;
}

function reportData(db: DatabaseClient, range: "90d" | "12m" | "all") {
  const start = parseRangeToStart(range);
  return db
    .prepare(
      `SELECT
         p.display_name,
         SUM(CASE WHEN m.direction = 'inbound' THEN 1 ELSE 0 END) AS inbound,
         SUM(CASE WHEN m.direction = 'outbound' THEN 1 ELSE 0 END) AS outbound,
         COUNT(m.id) AS total
       FROM participants p
       LEFT JOIN messages m ON m.participant_id = p.id
       WHERE p.is_self = 0
         AND (m.sent_at IS NULL OR m.sent_at >= ?)
       GROUP BY p.id
       ORDER BY total DESC`
    )
    .all(start) as Array<{ display_name: string; inbound: number; outbound: number; total: number }>;
}

export function createReport(
  db: DatabaseClient,
  baseDataDir: string,
  format: "csv" | "pdf",
  range: "90d" | "12m" | "all"
): { id: string } {
  const reportId = createId("rep");
  const reportsDir = path.resolve(baseDataDir, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  const ext = format === "csv" ? "csv" : "pdf";
  const filePath = path.join(reportsDir, `${reportId}.${ext}`);
  const data = reportData(db, range);

  if (format === "csv") {
    const lines = ["name,inbound,outbound,total", ...data.map((row) => `${JSON.stringify(row.display_name)},${row.inbound || 0},${row.outbound || 0},${row.total || 0}`)];
    fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
  } else {
    const doc = new PDFDocument({ margin: 36 });
    doc.pipe(fs.createWriteStream(filePath));
    doc.fontSize(18).text("iMessage Analytics Report", { underline: true });
    doc.moveDown().fontSize(12).text(`Range: ${range}`);
    doc.text(`Generated at: ${nowIso()}`);
    doc.moveDown();
    for (const row of data) {
      doc.text(`${row.display_name}: inbound ${row.inbound || 0}, outbound ${row.outbound || 0}, total ${row.total || 0}`);
    }
    doc.end();
  }

  db.prepare(
    `INSERT INTO reports (id, format, range, file_path, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(reportId, format, range, filePath, nowIso());

  return { id: reportId };
}

export function listReports(db: DatabaseClient): Array<{
  id: string;
  format: string;
  range: string;
  createdAt: string;
}> {
  const rows = db
    .prepare(`SELECT id, format, range, file_path, created_at FROM reports ORDER BY created_at DESC`)
    .all() as ReportRow[];

  return rows.map((row) => ({
    id: row.id,
    format: row.format,
    range: row.range,
    createdAt: row.created_at,
  }));
}

export function findReport(db: DatabaseClient, reportId: string): {
  id: string;
  format: string;
  range: string;
  filePath: string;
  createdAt: string;
} | null {
  const row = db
    .prepare(`SELECT id, format, range, file_path, created_at FROM reports WHERE id = ?`)
    .get(reportId) as ReportRow | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    format: row.format,
    range: row.range,
    filePath: row.file_path,
    createdAt: row.created_at,
  };
}
