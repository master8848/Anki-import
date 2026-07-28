/**
 * Tests for the `plan` command: preflight validation + dedup check.
 */

import { describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { runPlan } from "../src/plan.ts";

async function stageXml(xml: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-xml-plan-"));
  const file = path.join(dir, "cards.xml");
  await fs.writeFile(file, xml, "utf8");
  return file;
}

const VALID_BASIC = `<?xml version="1.0"?>
<anki>
  <note type="Basic" deck="AI Import::Test">
    <front>Hola</front>
    <back>Hello</back>
  </note>
</anki>
`;

describe("runPlan", () => {
  test("offline plan reports validation and deck info without network", async () => {
    const file = await stageXml(VALID_BASIC);
    const report = await runPlan({
      inputPath: file,
      preflight: false,
    });
    expect(report.valid).toBe(true);
    expect(report.validCount).toBe(1);
    expect(report.noteCount).toBe(1);
    expect(report.decks[0]?.name).toBe("AI Import::Test");
    expect(report.decks[0]?.wouldCreate).toBe(true);
    // No preflight = no dedup summary
    expect(report.canAddSummary.wouldAdd).toBe(0);
    expect(report.canAddSummary.wouldDuplicate).toBe(0);
    expect(report.canAddSummary.unknown).toBe(0);
  });

  test("invalid file fails with errors", async () => {
    const file = await stageXml(`<anki><note type="Basic" deck="AI">
      <front>Q</front>
    </note></anki>`);
    const report = await runPlan({
      inputPath: file,
      preflight: false,
    });
    expect(report.valid).toBe(false);
    expect(report.errors.length).toBeGreaterThan(0);
  });

  test("malformed XML throws XmlParseError", async () => {
    const file = await stageXml(`<anki><note type="Basic"><front>oops`);
    await expect(runPlan({ inputPath: file, preflight: false })).rejects.toThrow();
  });

  test("no file rejects", async () => {
    await expect(runPlan({ inputPath: "/no/such/file.xml" })).rejects.toThrow();
  });

  test("preflight with unreachable AnkiConnect reports unknown", async () => {
    const file = await stageXml(VALID_BASIC);
    const report = await runPlan({
      inputPath: file,
      ankiConnectUrl: "http://127.0.0.1:1", // unreachable port
      preflight: true,
    });
    expect(report.canAddSummary.unknown).toBe(1);
    expect(report.canAddSummary.wouldAdd).toBe(0);
  });
});
