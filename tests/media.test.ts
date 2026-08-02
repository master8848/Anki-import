import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AnkiClient } from "@anki-xml/anki";
import {
  deleteMedia,
  listMedia,
  retrieveMediaToFile,
  storeMedia,
  storeMediaFile,
} from "@anki-xml/media";

function jsonResponse(result: unknown, error: string | null = null) {
  return {
    ok: true,
    json: async () => ({ result, error }),
  } as unknown as Response;
}

function makeClient(handler: (action: string, params: Record<string, unknown>) => Promise<unknown>) {
  const calls: { action: string; params: Record<string, unknown> }[] = [];
  const client = new AnkiClient({
    url: "http://127.0.0.1:8765",
    retries: 1,
    fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        action: string;
        params: Record<string, unknown>;
      };
      calls.push({ action: body.action, params: body.params ?? {} });
      return jsonResponse(await handler(body.action, body.params ?? {}));
    },
  });
  return { client, calls };
}

describe("storeMedia", () => {
  it("passes raw bytes through (base64-encoded payload)", async () => {
    const { client, calls } = makeClient(async () => "ok");
    const res = await storeMedia(client, "pic.png", Buffer.from("hello"));
    expect(res).toBe("ok");
    expect(calls[0]!.action).toBe("storeMedia");
    expect(calls[0]!.params["filename"]).toBe("pic.png");
    expect(calls[0]!.params["data"]).toBe("aGVsbG8=");
  });
});

describe("storeMediaFile", () => {
  it("reads a file from disk and uploads it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anki-media-"));
    const file = join(dir, "image.png");
    await writeFile(file, Buffer.from([1, 2, 3, 4]));
    const { client, calls } = makeClient(async () => "image.png");
    const res = await storeMediaFile(client, file);
    expect(res).toBe("image.png");
    expect(calls[0]!.action).toBe("storeMedia");
    expect(calls[0]!.params["filename"]).toBe("image.png");
    expect(calls[0]!.params["data"]).toBe(Buffer.from([1, 2, 3, 4]).toString("base64"));
  });

  it("uses an explicit filename when given", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anki-media-"));
    const file = join(dir, "local.bin");
    await writeFile(file, Buffer.from("x"));
    const { client, calls } = makeClient(async () => "remote.bin");
    await storeMediaFile(client, file, "remote.bin");
    expect(calls[0]!.params["filename"]).toBe("remote.bin");
  });
});

describe("retrieveMediaToFile", () => {
  it("writes retrieved bytes to the output path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "anki-media-"));
    const out = join(dir, "out.txt");
    const { client, calls } = makeClient(async () => Buffer.from("world").toString("base64"));
    await retrieveMediaToFile(client, "a.txt", out);
    expect(calls[0]!.action).toBe("retrieveMedia");
    expect(calls[0]!.params["filename"]).toBe("a.txt");
    expect(await readFile(out, "utf8")).toBe("world");
  });
});

describe("deleteMedia", () => {
  it("sends the deleteMedia action with the filename", async () => {
    const { client, calls } = makeClient(async () => null);
    await deleteMedia(client, "junk.png");
    expect(calls[0]!.action).toBe("deleteMedia");
    expect(calls[0]!.params).toEqual({ filename: "junk.png" });
  });
});

describe("listMedia", () => {
  it("returns the media list from mediaList", async () => {
    const { client, calls } = makeClient(async () => ["a.png", "b.png"]);
    expect(await listMedia(client)).toEqual(["a.png", "b.png"]);
    expect(calls[0]!.action).toBe("mediaList");
  });
});
