export type DataSourceType = "macos_live" | "imazing_import";

export interface DataSource {
  id: string;
  type: DataSourceType;
  label: string;
  createdAt: string;
}

export interface ParseWarning {
  id: string;
  importId: string;
  severity: "info" | "warning" | "error";
  code: string;
  details: Record<string, unknown>;
  affectedRows: number;
  createdAt: string;
}

export interface ParticipantProfile {
  id: string;
  displayName: string;
  normalizedHandles: string[];
  isSelf: boolean;
  firstSeen: string;
  lastSeen: string;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  reciprocityScore: number;
  avgResponseMinutes: number | null;
  activeDays: number;
}

export interface ConversationStats {
  id: string;
  title: string;
  isGroup: boolean;
  participantCount: number;
  totalMessages: number;
  inboundCount: number;
  outboundCount: number;
  firstSeen: string;
  lastSeen: string;
}

export interface InsightCard {
  id: string;
  scope: "participant" | "conversation" | "global";
  scopeId: string | null;
  insightType: string;
  value: Record<string, unknown>;
  confidence: number;
  source: "rule" | "gpt";
  createdAt: string;
}

export interface NlpSliceSelection {
  participantIds?: string[];
  conversationIds?: string[];
  dateStart?: string;
  dateEnd?: string;
  maxMessages?: number;
}

export interface NlpJobRequest {
  analysisType:
    | "sentiment_trend"
    | "topic_clusters"
    | "tone_shift"
    | "conversation_health";
  selection: NlpSliceSelection;
  consent: {
    approved: boolean;
    approvedAt: string;
  };
}

export interface ReportRequest {
  format: "csv" | "pdf";
  range: "90d" | "12m" | "all";
}

export interface ApiError {
  error: string;
  message: string;
}
