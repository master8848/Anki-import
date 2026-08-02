import { describe, expect, it } from "vitest";
import { AnkiClient, AnkiConnectError, classifyConnectError } from "@anki-xml/anki";

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

function connectError(code: string): TypeError {
  const err = new TypeError("fetch failed");
  (err as { cause?: unknown }).cause = { code };
  return err;
}

describe("classifyConnectError", () => {
  it("classifies ECONNREFUSED with actionable steps", () => {
    const diag = classifyConnectError(connectError("ECONNREFUSED"), "http://127.0.0.1:8765");
    expect(diag.reachable).toBe(false);
    expect(diag.cause).toBe("refused");
    expect(diag.hints.length).toBeGreaterThan(0);
    expect(diag.hints.join(" ")).toMatch(/start the anki app/i);
    expect(diag.hints.join(" ")).toMatch(/2055492159/);
    expect(diag.suggestion).toBe("anki-import doctor");
  });

  it("classifies timeouts", () => {
    const diag = classifyConnectError(connectError("ETIMEDOUT"), "http://127.0.0.1:8765");
    expect(diag.cause).toBe("timeout");
    expect(diag.hints.join(" ")).toMatch(/restart anki/i);
  });

  it("classifies invalid JSON as bad-json", () => {
    const diag = classifyConnectError(new Error("Invalid JSON from AnkiConnect: x"), "url");
    expect(diag.cause).toBe("bad-json");
    expect(diag.hints.join(" ")).toMatch(/something else is listening/i);
  });
});

describe("AnkiClient diagnostics", () => {
  it("diagnose() reports reachable", async () => {
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 1,
      fetchImpl: async () => jsonResponse(6),
    });
    const diag = await client.diagnose();
    expect(diag.reachable).toBe(true);
    expect(diag.cause).toBe("ok");
  });

  it("diagnose() reports refused with hints when Anki is not running", async () => {
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 1,
      fetchImpl: async () => {
        throw connectError("ECONNREFUSED");
      },
    });
    const diag = await client.diagnose();
    expect(diag.reachable).toBe(false);
    expect(diag.cause).toBe("refused");
    expect(diag.hints.length).toBeGreaterThan(0);
  });

  it("thrown AnkiConnectError carries cause + hints", async () => {
    const client = new AnkiClient({
      url: "http://127.0.0.1:8765",
      retries: 1,
      backoffMs: 1,
      fetchImpl: async () => {
        throw connectError("ECONNREFUSED");
      },
    });
    await expect(client.version()).rejects.toBeInstanceOf(AnkiConnectError);
    try {
      await client.version();
    } catch (err) {
      expect(err).toBeInstanceOf(AnkiConnectError);
      const e = err as AnkiConnectError;
      expect(e.cause).toBe("refused");
      expect(e.hints?.length).toBeGreaterThan(0);
      expect(e.suggestion).toBe("anki-import doctor");
    }
  });
});
