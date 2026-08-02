import { describe, expect, it } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { main } from "@anki-xml/cli";

async function writeTemp(name: string, content: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "anki-cmd-"));
  const file = path.join(dir, name);
  await fs.writeFile(file, content);
  return file;
}

describe("plan/diff/sync error paths (no Anki needed)", () => {
  it("plan reports validation errors in JSON", async () => {
    const file = await writeTemp("bad.xml", `<anki deck="T"><note type="Basic"><front>a</front></note></anki>`);
    const out = await captureJson(() => main(["plan", file, "--json"]));
    expect(out.ok).toBe(false);
    expect((out.error as { code?: string }).code).toBe("VALIDATION_ERROR");
  });

  it("diff reports validation errors without touching Anki", async () => {
    const file = await writeTemp("bad.yaml", "deck: T\nnotes:\n  - front: only-front\n");
    const out = await captureJson(() => main(["diff", file, "--json"]));
    expect(out.ok).toBe(false);
  });

  it("sync dry-run reports validation errors", async () => {
    const file = await writeTemp("bad.csv", "front,back\nonly-front,\n");
    const out = await captureJson(() => main(["sync", file, "--json"]));
    expect(out.ok).toBe(false);
  });

  it("import supports yaml via the plugin registry (dry-run)", async () => {
    const file = await writeTemp(
      "cards.yaml",
      `deck: Japanese
notes:
  - front: こんにちは
    back: Hello
    tags: greetings
`,
    );
    const out = await captureJson(() => main(["import", file, "--dry-run", "--json"]));
    expect(out.ok).toBe(true);
    expect(out.validCount).toBe(1);
  });

  it("import supports csv with --deck override (dry-run)", async () => {
    const file = await writeTemp("cards.csv", "front,back\nq1,a1\nq2,a2\n");
    const out = await captureJson(() => main(["import", file, "--dry-run", "--json", "--deck", "CSVDeck"]));
    expect(out.ok).toBe(true);
    expect(out.validCount).toBe(2);
  });

  it("import supports markdown (dry-run)", async () => {
    const file = await writeTemp(
      "cards.md",
      `---
deck: MD
tags: test
---

# First
Answer one

# Second
Answer two
`,
    );
    const out = await captureJson(() => main(["import", file, "--dry-run", "--json"]));
    expect(out.ok).toBe(true);
    expect(out.validCount).toBe(2);
  });

  it("rejects unsupported formats with a clear message", async () => {
    const file = await writeTemp("cards.txt", "hello");
    const out = await captureJson(() => main(["import", file, "--json"]));
    expect(out.ok).toBe(false);
    const err = out.error as { message?: string };
    expect(err.message).toMatch(/Unsupported file format/);
  });
});

async function captureJson(run: () => Promise<number>): Promise<Record<string, unknown>> {
  const original = console.log;
  let captured = "";
  console.log = (msg: string) => {
    captured += String(msg) + "\n";
  };
  try {
    const code = await run();
    expect(code).toBeGreaterThanOrEqual(0);
    return JSON.parse(captured) as Record<string, unknown>;
  } finally {
    console.log = original;
  }
}
