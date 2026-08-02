/**
 * AnkiConnect HTTP client — all network I/O for Anki lives here.
 */

import type { AnkiConnectNote, AnkiConnectResponse } from "@anki-xml/utils";

export interface AnkiConnectNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
  deckName?: string;
}

export interface AnkiClientOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  timeout?: number;
  retries?: number;
  backoffMs?: number;
}

export class AnkiConnectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnkiConnectError";
  }
}

export class AnkiClient {
  private readonly url: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly backoffMs: number;

  constructor(options: AnkiClientOptions = {}) {
    this.url = (options.url ?? "http://127.0.0.1:8765").replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeout ?? 10_000;
    this.maxRetries = options.retries ?? 3;
    this.backoffMs = options.backoffMs ?? 100;
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

  private async invoke<T>(action: string, params?: Record<string, unknown>): Promise<T> {
    const body = JSON.stringify({ action, version: 6, params: params ?? {} });
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
        let response: Response;
        try {
          response = await this.fetchImpl(`${this.url}/`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
            signal: controller.signal,
          });
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new AnkiConnectError(
            `AnkiConnect returned HTTP ${response.status} ${response.statusText}`,
          );
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
      } catch (err) {
        lastError = err as Error;
        if (lastError.message.startsWith("AnkiConnect error:")) throw lastError;
        if (attempt < this.maxRetries) {
          const delay = this.backoffMs * 2 ** (attempt - 1);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    throw new AnkiConnectError(
      `Failed to reach AnkiConnect at ${this.url}: ${lastError?.message ?? "Unknown error"}`,
    );
  }
}

/** @deprecated Use AnkiClient */
export const AnkiConnectClient = AnkiClient;
