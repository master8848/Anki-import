/**
 * Tests for idempotency (M10).
 */

import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  checkIdempotency,
  markOutcome,
  markPending,
  operationId,
} from "../src/idempotency.ts";

const TEMP_XDG = path.join(os.tmpdir(), `anki-xml-idem-${Date.now()}`);
let originalXdg: string | undefined;

beforeEach(() => {
  originalXdg = process.env["XDG_DATA_HOME"];
  process.env["XDG_DATA_HOME"] = TEMP_XDG;
});

afterEach(async () => {
  if (originalXdg === undefined) delete process.env["XDG_DATA_HOME"];
  else process.env["XDG_DATA_HOME"] = originalXdg;
  await fs.rm(TEMP_XDG, { recursive: true, force: true });
});

describe("operationId", () => {
  test("is stable for the same (key, command, description)", () => {
    const a = operationId({ key: "k1", command: "import", description: "file A" });
    const b = operationId({ key: "k1", command: "import", description: "file A" });
    expect(a).toBe(b);
  });

  test("differs when any input differs", () => {
    const a = operationId({ key: "k1", command: "import", description: "file A" });
    const b = operationId({ key: "k2", command: "import", description: "file A" });
    const c = operationId({ key: "k1", command: "delete", description: "file A" });
    const d = operationId({ key: "k1", command: "import", description: "file B" });
    expect(new Set([a, b, c, d]).size).toBe(4);
  });

  test("prevents substring collisions via NUL separator", () => {
    const a = operationId({ key: "a", command: "b", description: "c" });
    const b = operationId({ key: "a|b", command: "", description: "c" });
    expect(a).not.toBe(b);
  });
});

describe("checkIdempotency", () => {
  test("returns fresh=true when no prior run exists", async () => {
    const result = await checkIdempotency({
      key: "k1",
      command: "import",
      description: "first run",
    });
    expect(result.fresh).toBe(true);
    expect(result.priorOk).toBe(false);
  });

  test("returns fresh=false + priorOk=true after a successful run", async () => {
    await markPending({ key: "k1", command: "import", description: "x" }, [1, 2]);
    await markOutcome({ key: "k1", command: "import", description: "x" }, "ok", [1, 2]);
    const result = await checkIdempotency({
      key: "k1",
      command: "import",
      description: "x",
    });
    expect(result.fresh).toBe(false);
    expect(result.priorOk).toBe(true);
  });

  test("returns fresh=false + priorOk=false after a failed run", async () => {
    await markPending({ key: "k1", command: "import", description: "x" });
    await markOutcome({ key: "k1", command: "import", description: "x" }, "error", [], "boom");
    const result = await checkIdempotency({
      key: "k1",
      command: "import",
      description: "x",
    });
    expect(result.fresh).toBe(false);
    expect(result.priorOk).toBe(false);
  });

  test("treats different keys as independent operations", async () => {
    await markOutcome({ key: "k1", command: "import", description: "x" }, "ok");
    const result = await checkIdempotency({
      key: "k2",
      command: "import",
      description: "x",
    });
    expect(result.fresh).toBe(true);
  });
});