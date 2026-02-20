import { describe, expect, it } from "vitest";
import type { NlpJobRequest } from "./index.js";

describe("shared types", () => {
  it("supports NLP job contracts", () => {
    const req: NlpJobRequest = {
      analysisType: "sentiment_trend",
      selection: { participantIds: ["p1"], maxMessages: 200 },
      consent: { approved: true, approvedAt: new Date().toISOString() },
    };

    expect(req.selection.maxMessages).toBe(200);
  });
});
