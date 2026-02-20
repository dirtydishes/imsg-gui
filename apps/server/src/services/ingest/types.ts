export interface ParsedMessage {
  sourceMsgKey: string;
  sentAt: string;
  direction: "inbound" | "outbound";
  text: string;
  hasAttachment: boolean;
  conversationKey: string;
  conversationTitle: string;
  isGroup: boolean;
  participantHandle: string;
  participantName: string;
  isSelf: boolean;
  attachment?: {
    mimeType?: string;
    fileExt?: string;
    sizeBytes?: number;
    sourceUri?: string;
  };
}

export interface ParserWarning {
  severity: "info" | "warning" | "error";
  code: string;
  details: Record<string, unknown>;
  affectedRows: number;
}
