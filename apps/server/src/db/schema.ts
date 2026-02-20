import type { DatabaseClient } from "./types.js";

const schemaSql = `
CREATE TABLE IF NOT EXISTS data_sources (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS imports (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  format TEXT NOT NULL,
  file_path TEXT NOT NULL,
  ingested_at TEXT NOT NULL,
  quality_score REAL NOT NULL DEFAULT 0,
  FOREIGN KEY (source_id) REFERENCES data_sources(id)
);

CREATE TABLE IF NOT EXISTS participants (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_handles TEXT NOT NULL,
  is_self INTEGER NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  source_conversation_keys TEXT NOT NULL,
  chat_title TEXT NOT NULL,
  is_group INTEGER NOT NULL,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  PRIMARY KEY (conversation_id, participant_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (participant_id) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  direction TEXT NOT NULL,
  text TEXT NOT NULL,
  text_redacted TEXT NOT NULL,
  has_attachment INTEGER NOT NULL,
  source_id TEXT NOT NULL,
  source_msg_key TEXT NOT NULL,
  dedupe_hash TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id),
  FOREIGN KEY (participant_id) REFERENCES participants(id),
  FOREIGN KEY (source_id) REFERENCES data_sources(id),
  UNIQUE (source_id, source_msg_key)
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  mime_type TEXT,
  file_ext TEXT,
  size_bytes INTEGER,
  source_uri TEXT,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

CREATE TABLE IF NOT EXISTS identity_links (
  id TEXT PRIMARY KEY,
  participant_id_a TEXT NOT NULL,
  participant_id_b TEXT NOT NULL,
  method TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (participant_id_a) REFERENCES participants(id),
  FOREIGN KEY (participant_id_b) REFERENCES participants(id)
);

CREATE TABLE IF NOT EXISTS metrics_daily (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  day TEXT NOT NULL,
  inbound_count INTEGER NOT NULL,
  outbound_count INTEGER NOT NULL,
  total_messages INTEGER NOT NULL,
  avg_message_length REAL NOT NULL,
  avg_response_minutes REAL,
  created_at TEXT NOT NULL,
  UNIQUE (scope_type, scope_id, day)
);

CREATE TABLE IF NOT EXISTS insights (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  scope_id TEXT,
  insight_type TEXT NOT NULL,
  value_json TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS parse_warnings (
  id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  code TEXT NOT NULL,
  details_json TEXT NOT NULL,
  affected_rows INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (import_id) REFERENCES imports(id)
);

CREATE TABLE IF NOT EXISTS nlp_jobs (
  id TEXT PRIMARY KEY,
  analysis_type TEXT NOT NULL,
  selection_json TEXT NOT NULL,
  record_count INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  range TEXT NOT NULL,
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_participant ON messages(participant_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_metrics_scope_day ON metrics_daily(scope_type, scope_id, day);
CREATE INDEX IF NOT EXISTS idx_insights_scope ON insights(scope, scope_id);
`;

export function migrate(db: DatabaseClient): void {
  db.exec(schemaSql);
}
