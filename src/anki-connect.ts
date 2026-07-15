/**
 * Minimal AnkiConnect HTTP client.
 *
 * AnkiConnect is an Anki plugin (https://ankiweb.net/shared/info/2055492159)
 * that exposes a JSON-RPC-style API over HTTP. By default it listens on
 * `http://127.0.0.1:8765`. We use two endpoints:
 *
 *   - `version`  : used as a cheap reachability / version check.
 *   - `addNotes` : bulk-creates notes; returns one entry per input note
 *                  containing either the new note id or `null` on failure.
 *
 * The client is dependency-injected with a `fetch` implementation so tests
 * can substitute an in-memory mock without monkey-patching globals.
 */

import type { AnkiConnectNote, AnkiConnectResponse } from "./types.ts";

export interface AnkiConnectOptions {
  /** Base URL of AnkiConnect, e.g. `http://127.0.0.1:8765`. */
  url: string;
  /** Override for tests. Defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

export class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

export class AnkiConnectClient {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AnkiConnectOptions) {
    this.url = options.url.replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Verify AnkiConnect is reachable and responsive. Returns its reported version (e.g. "6"). */
  async version(): Promise<number> {
    const res = await this.invoke<number>("version");
    if (typeof res !== "number") {
      throw new AnkiConnectError(`Unexpected response from 'version': ${JSON.stringify(res)}`);
    }
    return res;
  }

  /**
   * Submit a batch of notes for creation.
   *
   * Returns the parallel array returned by AnkiConnect: each element is
   * either the new note's id (number) or `null` when that note failed.
   */
  async addNotes(notes: AnkiConnectNote[]): Promise<(number | null)[]> {
    if (notes.length === 0) return [];
    const res = await this.invoke<(number | null)[]>("addNotes", { notes });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'addNotes': ${JSON.stringify(res)}`);
    }
    return res;
  }

  /**
   * Create a deck (or no-op if it already exists).
   *
   * AnkiConnect's `createDeck` is idempotent: it returns the existing
   * deck's id when called for a name that already exists, and the new
   * deck's id otherwise. It also creates missing parent decks on the
   * fly (so calling `createDeck('A::B::C')` will create `A`, `A::B`
   * and `A::B::C` if none of them exist).
   *
   * Returns the deck id (number) reported by AnkiConnect.
   */
  async createDeck(name: string): Promise<number> {
    const res = await this.invoke<number | null>("createDeck", { deck: name });
    if (typeof res !== "number") {
      throw new AnkiConnectError(
        `Unexpected response from 'createDeck': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  /**
   * Low-level JSON-RPC invocation. Throws on network failure, non-2xx
   * status, or an envelope-level `error`. Per-note failures are NOT
   * thrown here — they appear as `null` in the result array.
   */
  private async invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ action, version: 6, params: params ?? {} });

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.url}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      throw new AnkiConnectError(
        `Failed to reach AnkiConnect at ${this.url}: ${(err as Error).message}`,
      );
    }

    if (!response.ok) {
      throw new AnkiConnectError(`AnkiConnect returned HTTP ${response.status} ${response.statusText}`);
    }

    let envelope: AnkiConnectResponse<T>;
    try {
      envelope = (await response.json()) as AnkiConnectResponse<T>;
    } catch (err) {
      throw new AnkiConnectError(`Invalid JSON from AnkiConnect: ${(err as Error).message}`);
    }

    if (envelope.error) {
      throw new AnkiConnectError(`AnkiConnect error: ${envelope.error}`);
    }
    return envelope.result as T;
  }
}