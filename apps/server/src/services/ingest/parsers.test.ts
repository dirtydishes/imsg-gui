import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseImazingCsv } from "./imazingCsv.js";
import { parseImazingTxt } from "./imazingTxt.js";

const fixtures = path.resolve(process.cwd(), "test/fixtures");

describe("iMazing parsers", () => {
  it("parses CSV exports", () => {
    const filePath = path.join(fixtures, "imazing-sample.csv");
    const result = parseImazingCsv(filePath);

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.direction).toBe("outbound");
    expect(result.qualityScore).toBeGreaterThan(70);
  });

  it("parses TXT exports and emits warning for unparsed lines", () => {
    const filePath = path.join(fixtures, "imazing-sample.txt");
    const result = parseImazingTxt(filePath);

    expect(result.messages).toHaveLength(2);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.qualityScore).toBeLessThan(100);
  });
});
