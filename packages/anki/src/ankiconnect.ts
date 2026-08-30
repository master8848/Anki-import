/**
 * AnkiConnect HTTP client — all network I/O for Anki lives here.
 * No other package may talk to AnkiConnect directly.
 */

import type { AnkiConnectNote, AnkiConnectResponse } from "@anki-xml/utils";
import {
  authDiagnosis,
  classifyConnectError,
  connectDiagnosis,
  DEFAULT_URL,
  isAuthErrorMessage,
  type ConnectDiagnosis,
} from "./errors.ts";
import { ankiConnectAbortSignal, isAnkiConnectAborted } from "./abort.ts";

export interface AnkiConnectNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
  deckName?: string;
}

export interface AnkiConnectUpdateNote {
  id: number;
  fields: Record<string, string>;
  tags?: string[];
}

export interface DeckCardCounts {
  new: number;
  learning: number;
  review: number;
  suspended: number;
  buried: number;
}

export interface AnkiClientOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeout?: number;
  /** Retry budget for network errors (connection refused, DNS, ...). */
  retries?: number;
  /** Exponential backoff base for network-error retries. */
  backoffMs?: number;
  /** Retry budget for transient HTTP 5xx responses from AnkiConnect. */
  httpRetries?: number;
  /** Exponential backoff base for HTTP 5xx retries. */
  httpBackoffMs?: number;
}

export class AnkiConnectError extends Error {
  /** Stable, branchable cause code, e.g. "refused". */
  override cause?: string;
  /** Actionable fix steps for humans and AI agents. */
  hints?: string[];
  /** Suggested follow-up command, e.g. "anki-import doctor". */
  suggestion?: string;
  /** Full diagnosis when the failure was a connection problem. */
  diagnosis?: ConnectDiagnosis;
  /** HTTP status when AnkiConnect answered with a non-2xx response. */
  status?: number;

  constructor(message: string, diagnosis?: ConnectDiagnosis, status?: number) {
    super(message);
    this.name = "AnkiConnectError";
    if (diagnosis) {
      this.diagnosis = diagnosis;
      this.cause = diagnosis.cause;
      this.hints = diagnosis.hints;
      this.suggestion = diagnosis.suggestion;
    }
    if (status !== undefined) this.status = status;
  }
}

export class AnkiClient {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;
  private readonly httpRetries: number;
  private readonly httpBackoffMs: number;

  constructor(options: AnkiClientOptions = {}) {
    this.url = (options.url ?? DEFAULT_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeout ?? 10_000;
    this.maxRetries = options.retries ?? 3;
    this.backoffMs = options.backoffMs ?? 100;
    this.httpRetries = options.httpRetries ?? 3;
    this.httpBackoffMs = options.httpBackoffMs ?? 300;
  }

  async version(): Promise<number> {
    const res = await this.invoke<number>("version");
    if (typeof res !== "number") {
      throw new AnkiConnectError(`Unexpected response from 'version': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async addNotes(notes: AnkiConnectNote[]): Promise<(number | null)[]> {
    if (notes.length === 0) return [];
    const res = await this.invoke<(number | null)[]>("addNotes", { notes });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'addNotes': ${JSON.stringify(res)}`);
    }
    return res;
  }

  /** Test which notes can be added without duplicating existing ones. */
  async canAddNotes(notes: AnkiConnectNote[]): Promise<boolean[]> {
    if (notes.length === 0) return [];
    const res = await this.invoke<boolean[]>("canAddNotes", { notes });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'canAddNotes': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async updateNoteFields(note: AnkiConnectUpdateNote): Promise<void> {
    await this.invoke<null>("updateNoteFields", { note });
  }

  async createDeck(name: string): Promise<number> {
    const res = await this.invoke<number | null>("createDeck", { deck: name });
    if (typeof res !== "number") {
      throw new AnkiConnectError(`Unexpected response from 'createDeck': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async deckNames(): Promise<string[]> {
    const res = await this.invoke<string[]>("deckNames");
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'deckNames': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async modelNames(): Promise<string[]> {
    const res = await this.invoke<string[]>("modelNames");
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'modelNames': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async modelFieldNames(modelName: string): Promise<string[]> {
    const res = await this.invoke<string[]>("modelFieldNames", { modelName });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(
        `Unexpected response from 'modelFieldNames': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  async modelTemplates(modelName: string): Promise<Record<string, Record<string, string>>> {
    const res = await this.invoke<Record<string, Record<string, string>>>("modelTemplates", {
      modelName,
    });
    if (res === null || typeof res !== "object" || Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'modelTemplates': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async findNotes(query: string): Promise<number[]> {
    const res = await this.invoke<number[]>("findNotes", { query });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'findNotes': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async deleteNotes(noteIds: number[]): Promise<void> {
    await this.invoke<null>("deleteNotes", { notes: noteIds });
  }

  /**
   * Execute several actions in a single HTTP request. AnkiConnect runs
   * them sequentially in order. Each action is sent with version 6, so
   * every returned element is a per-action `{ result, error }` envelope;
   * the first failing action throws (mirroring invoke()), otherwise the
   * per-action results are returned in order.
   */
  async multi(
    requests: Array<{ action: string; params?: Record<string, unknown> }>,
  ): Promise<unknown[]> {
    if (requests.length === 0) return [];
    // NEVER retry: `multi` runs a non-idempotent batch (addNotes,
    // updateNote, ...). A retry would re-run the whole batch and
    // double-apply every action in it, so even network errors surface
    // after exactly one attempt.
    let results: unknown;
    try {
      results = await this.invokeOnce<unknown[]>("multi", {
        actions: requests.map((r) => ({
          action: r.action,
          version: 6,
          params: r.params ?? {},
        })),
      });
    } catch (err) {
      if (err instanceof AnkiConnectError) throw err;
      throw this.wrapNetworkError(err);
    }
    if (!Array.isArray(results)) {
      throw new AnkiConnectError(`Unexpected response from 'multi': ${JSON.stringify(results)}`);
    }
    return results.map((element, i) => {
      const name = requests[i]?.action ?? String(i);
      if (element === null || typeof element !== "object" || Array.isArray(element)) {
        throw new AnkiConnectError(
          `Unexpected result from '${name}' in multi: ${JSON.stringify(element)}`,
        );
      }
      const env = element as Record<string, unknown>;
      if (env["error"] !== undefined && env["error"] !== null) {
        throw new AnkiConnectError(`AnkiConnect error: ${String(env["error"])}`);
      }
      return env["result"] ?? null;
    });
  }

  async notesInfo(noteIds: number[]): Promise<(AnkiConnectNoteInfo | null)[]> {
    if (noteIds.length === 0) return [];
    const res = await this.invoke<(AnkiConnectNoteInfo | null)[]>("notesInfo", {
      notes: noteIds,
    });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'notesInfo': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async getAddons(): Promise<Record<string, boolean>> {
    const res = await this.invoke<Record<string, boolean> | null>("getAddons");
    if (res === null || typeof res !== "object" || Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'getAddons': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async getTags(): Promise<string[]> {
    const res = await this.invoke<string[]>("getTags");
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'getTags': ${JSON.stringify(res)}`);
    }
    return res;
  }

  async addTags(noteIds: number[], tags: string[]): Promise<void> {
    if (noteIds.length === 0 || tags.length === 0) return;
    await this.invoke<null>("addTags", { notes: noteIds, tags: tags.join(" ") });
  }

  async removeTags(noteIds: number[], tags: string[]): Promise<void> {
    if (noteIds.length === 0 || tags.length === 0) return;
    await this.invoke<null>("removeTags", { notes: noteIds, tags: tags.join(" ") });
  }

  /** Store a media file. Accepts raw bytes (base64-encoded internally). */
  async storeMedia(filename: string, data: Buffer): Promise<string> {
    const res = await this.invoke<string>("storeMedia", {
      filename,
      data: data.toString("base64"),
    });
    if (typeof res !== "string") {
      throw new AnkiConnectError(`Unexpected response from 'storeMedia': ${JSON.stringify(res)}`);
    }
    return res;
  }

  /** Retrieve a media file as raw bytes. */
  async retrieveMedia(filename: string): Promise<Buffer> {
    const res = await this.invoke<string>("retrieveMedia", { filename });
    if (typeof res !== "string") {
      throw new AnkiConnectError(`Unexpected response from 'retrieveMedia': ${JSON.stringify(res)}`);
    }
    return Buffer.from(res, "base64");
  }

  async deleteMedia(filename: string): Promise<void> {
    await this.invoke<null>("deleteMedia", { filename });
  }

  async mediaList(): Promise<string[]> {
    const res = await this.invoke<string[]>("mediaList");
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'mediaList': ${JSON.stringify(res)}`);
    }
    return res;
  }

  /** Per-deck card counts. */
  async cardCounts(decks: string[]): Promise<Record<string, DeckCardCounts>> {
    const res = await this.invoke<Record<string, DeckCardCounts>>("cardCounts", { decks });
    if (res === null || typeof res !== "object" || Array.isArray(res)) {
      throw new AnkiConnectError(`Unexpected response from 'cardCounts': ${JSON.stringify(res)}`);
    }
    return res;
  }

  /**
   * Trigger AnkiWeb sync (Anki desktop → AnkiWeb). This is what makes
   * cards appear on the phone — the phone then syncs from AnkiWeb.
   * Throws AnkiConnectError with cause "auth" if Anki is not logged in.
   */
  async sync(): Promise<void> {
    try {
      await this.invoke<null>("sync");
    } catch (err) {
      if (err instanceof AnkiConnectError) {
        if (err.cause === "auth") throw err;
        const msg = err.message;
        if (isAuthErrorMessage(msg)) {
          throw new AnkiConnectError(msg, authDiagnosis(this.url, msg));
        }
      }
      throw err;
    }
  }

  /**
   * Run a diagnosis against this client's URL without throwing —
   * returns structured hints for humans and agents.
   */
  async diagnose(): Promise<ConnectDiagnosis> {
    try {
      await this.version();
      return {
        reachable: true,
        cause: "ok",
        url: this.url,
        detail: `AnkiConnect reachable at ${this.url}`,
        hints: [],
      };
    } catch (err) {
      if (err instanceof AnkiConnectError && err.diagnosis) return err.diagnosis;
      return classifyConnectError(err, this.url);
    }
  }

  /**
   * Invoke an action with retries:
   * - network errors (refused/timeout/DNS): retried with exponential
   *   backoff — AnkiConnect may simply have been busy or restarting;
   * - HTTP 5xx: retried a few times with a short backoff (transient
   *   server errors recover quickly; the old long-backoff retries were
   *   the bug);
   * - HTTP 4xx, bad JSON, and envelope errors: permanent, no retry.
   */
  private async invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    let networkAttempts = 0;
    let httpAttempts = 0;
    for (;;) {
      try {
        return await this.invokeOnce<T>(action, params);
      } catch (err) {
        if (err instanceof AnkiConnectError) {
          if (typeof err.status === "number" && err.status >= 500) {
            if (httpAttempts + 1 >= this.httpRetries) throw err;
            httpAttempts++;
            await sleep(this.httpBackoffMs * 2 ** (httpAttempts - 1));
            continue;
          }
          throw err;
        }
        if (isAnkiConnectAborted() || networkAttempts + 1 >= this.maxRetries) {
          throw this.wrapNetworkError(err);
        }
        networkAttempts++;
        await sleep(this.backoffMs * 2 ** (networkAttempts - 1));
      }
    }
  }

  /**
   * One HTTP round-trip: POST the action, enforce the timeout, and
   * parse the envelope. AnkiConnectError is thrown for HTTP status /
   * bad JSON / envelope failures; raw fetch errors propagate unchanged
   * so callers decide whether to retry them.
   */
  private async invokeOnce<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ action, version: 6, params: params ?? {} });
    let response: Response;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    const abortFromGlobal = () => controller.abort();
    const globalSignal = ankiConnectAbortSignal();
    if (globalSignal.aborted) controller.abort();
    else globalSignal.addEventListener("abort", abortFromGlobal);
    try {
      response = await this.fetchImpl(`${this.url}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
      globalSignal.removeEventListener("abort", abortFromGlobal);
    }

    if (!response.ok) {
      throw new AnkiConnectError(
        `AnkiConnect returned HTTP ${response.status} ${response.statusText}`,
        connectDiagnosis(
          "http",
          this.url,
          `AnkiConnect returned HTTP ${response.status} ${response.statusText}`,
        ),
        response.status,
      );
    }

    const envelope = await this.parseEnvelope(response, action);
    if (envelope.error) {
      throw new AnkiConnectError(`AnkiConnect error: ${envelope.error}`);
    }
    return envelope.result as T;
  }

  /** Wrap a raw fetch failure in a classified AnkiConnectError. */
  private wrapNetworkError(err: unknown): AnkiConnectError {
    return new AnkiConnectError(
      `Failed to reach AnkiConnect at ${this.url}: ${err instanceof Error ? err.message : String(err)}`,
      classifyConnectError(err, this.url),
    );
  }

  /** Parse and shape-check an AnkiConnect envelope; bad shapes get the stable `bad-json` cause. */
  private async parseEnvelope(
    response: Response,
    action: string,
  ): Promise<AnkiConnectResponse<unknown>> {
    let raw: unknown;
    try {
      raw = await response.json();
    } catch (err) {
      throw new AnkiConnectError(
        `Invalid JSON from AnkiConnect: ${(err as Error).message}`,
        connectDiagnosis(
          "bad-json",
          this.url,
          `Non-AnkiConnect response from ${this.url}: ${(err as Error).message}`,
        ),
      );
    }
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new AnkiConnectError(
        `Invalid response from '${action}': ${JSON.stringify(raw)}`,
        connectDiagnosis(
          "bad-json",
          this.url,
          `Non-AnkiConnect response from ${this.url}: expected an object envelope, got ${JSON.stringify(raw)}`,
        ),
      );
    }
    const env = raw as Record<string, unknown>;
    if (!("result" in env) || !("error" in env)) {
      throw new AnkiConnectError(
        `Invalid response envelope from '${action}': missing result/error`,
        connectDiagnosis(
          "bad-json",
          this.url,
          `Non-AnkiConnect response from ${this.url}: envelope missing result/error fields`,
        ),
      );
    }
    if (env["error"] !== null && typeof env["error"] !== "string") {
      throw new AnkiConnectError(
        `Invalid response envelope from '${action}': error must be a string or null`,
        connectDiagnosis(
          "bad-json",
          this.url,
          `Non-AnkiConnect response from ${this.url}: malformed error field`,
        ),
      );
    }
    return { result: env["result"] ?? null, error: env["error"] as string | null };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
