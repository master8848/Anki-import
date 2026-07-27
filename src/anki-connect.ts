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

/**
 * A single note returned by AnkiConnect's `notesInfo`. The fields object
 * uses the note type's *field names* (e.g. "Front", "Back"), NOT the
 * lowercase XML tags we accept on input. Callers that want XML tag
 * names need to map them via `modelFieldNames`.
 */
export interface AnkiConnectNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
}

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
   * List every deck name (flat). AnkiConnect returns names in `Parent::Child`
   * form. Use `parseDeckTree` to turn this into a hierarchy.
   */
  async deckNames(): Promise<string[]> {
    const res = await this.invoke<string[]>("deckNames");
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(
        `Unexpected response from 'deckNames': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  /**
   * Same as `deckNames` but also returns Anki's internal deck id for each.
   * Useful when callers want a stable handle independent of renaming.
   */
  async deckNamesAndIds(): Promise<Record<string, number>> {
    const res = await this.invoke<Record<string, number>>("deckNamesAndIds");
    if (res === null || typeof res !== "object" || Array.isArray(res)) {
      throw new AnkiConnectError(
        `Unexpected response from 'deckNamesAndIds': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  /**
   * Run an Anki search query and return the matching *note* ids.
   * `query` follows Anki's search syntax (e.g. `deck:Spanish`, `tag:verb`,
   * `"hola"`, `is:review`). An empty query matches every note.
   */
  async findNotes(query: string): Promise<number[]> {
    const res = await this.invoke<number[]>("findNotes", { query });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(
        `Unexpected response from 'findNotes': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  /**
   * Same as `findNotes` but returns *card* ids. Used for `is:new` /
   * `is:learn` / `is:review` style queries that filter cards, not notes.
   */
  async findCards(query: string): Promise<number[]> {
    const res = await this.invoke<number[]>("findCards", { query });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(
        `Unexpected response from 'findCards': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  /**
   * Fetch full note records (modelName, tags, fields, card ids) for the
   * given note ids. AnkiConnect returns `null` entries for missing ids,
   * which we preserve so callers can map failures back to positions.
   */
  async notesInfo(noteIds: number[]): Promise<(AnkiConnectNoteInfo | null)[]> {
    if (noteIds.length === 0) return [];
    const res = await this.invoke<(AnkiConnectNoteInfo | null)[]>("notesInfo", {
      notes: noteIds,
    });
    if (!Array.isArray(res)) {
      throw new AnkiConnectError(
        `Unexpected response from 'notesInfo': ${JSON.stringify(res)}`,
      );
    }
    return res;
  }

  /**
   * Replace the fields of an existing note. By default tags are not
   * touched; pass `tags` to set the entire tag list (replaces).
   * Field names are the Anki *display* names ("Front", "Back"), not
   * the lowercase XML tags. Use `modelFieldNames` to discover them.
   */
  async updateNoteFields(
    noteId: number,
    fields: Record<string, string>,
    options?: { tags?: string[] },
  ): Promise<void> {
    const params: Record<string, unknown> = { id: noteId, fields };
    if (options?.tags !== undefined) params["tags"] = options.tags;
    await this.invoke<null>("updateNoteFields", params);
  }

  /** Add tags to an existing note (idempotent). */
  async addTags(noteIds: number[], tags: string): Promise<void> {
    await this.invoke<null>("addTags", { notes: noteIds, tags });
  }

  /**
   * Preflight check: for each candidate note, ask AnkiConnect if it
   * would be added (true), rejected as a duplicate (false), or rejected
   * for some other reason (null).
   *
   * Same `notes` shape as `addNotes`; AnkiConnect does the dedup check
   * against the live collection.
   */
  async canAddNotes(
    notes: AnkiConnectNote[],
  ): Promise<(boolean | null)[]> {
    return await this.invoke<(boolean | null)[]>("canAddNotes", { notes });
  }

  /** List all deck names. Used by `plan` to predict deck creation. */
  async deckNames(): Promise<string[]> {
    return await this.invoke<string[]>("deckNames");
  }

  /** Delete a list of notes. Permanent; not undoable. */
  async deleteNotes(noteIds: number[]): Promise<void> {
    await this.invoke<null>("deleteNotes", { notes: noteIds });
  }

  /** Rename a deck. */
  async renameDeck(oldName: string, newName: string): Promise<void> {
    await this.invoke<null>("changeDeck", { name: oldName, newName });
    // changeDeck does not move child decks. For a true rename, walk the
    // tree and reparent; for now we surface a flat rename.
    void newName;
  }

  /** Move notes to a target deck. */
  async moveNotesToDeck(noteIds: number[], deck: string): Promise<void> {
    await this.invoke<null>("changeDeck", { notes: noteIds, deck });
  }

  /** Move a single note to a different deck. */
  async changeDeck(noteId: number, deckName: string): Promise<void> {
    await this.invoke<null>("changeDeck", { notes: [noteId], deck: deckName });
  }

  /** Delete an entire deck. Permanent; not undoable. */
  async deleteDeck(name: string, cardsToo: boolean): Promise<void> {
    await this.invoke<null>("deleteDeck", { name, cardsToo });
  }

  /** Suspend a list of cards. */
  async suspendCards(cardIds: number[]): Promise<void> {
    await this.invoke<null>("suspend", { cards: cardIds });
  }

  /** Unsuspend a list of cards. */
  async unsuspendCards(cardIds: number[]): Promise<void> {
    await this.invoke<null>("unsuspend", { cards: cardIds });
  }

  /** Bury a list of cards (hide from review until the next day). */
  async buryCards(cardIds: number[]): Promise<void> {
    await this.invoke<null>("buryCards", { cards: cardIds });
  }

  /** Return the card ids for a note id. */
  async cardsForNote(noteId: number): Promise<number[]> {
    return await this.invoke<number[]>("cardsOfNote", { note: noteId });
  }

  /** Create a new model. Used for custom note types (P4.2). */
  async createModel(opts: {
    modelName: string;
    inOrderFields: string[];
    css?: string;
    cardTemplates: { Name: string; Front: string; Back: string }[];
  }): Promise<{ id: number; name: string }> {
    return await this.invoke<{ id: number; name: string }>("createModel", {
      modelName: opts.modelName,
      inOrderFields: opts.inOrderFields,
      css: opts.css ?? "",
      isCloze: false,
      cardTemplates: opts.cardTemplates,
    });
  }

  /** Upload a media file. Returns the stored filename. */
  async storeMediaFile(filename: string, base64Data: string): Promise<string> {
    return await this.invoke<string>("storeMediaFile", {
      filename,
      data: base64Data,
    });
  }

  /** Open Anki's browser on a query. Used by the `preview` command. */
  async guiBrowse(query: string): Promise<void> {
    await this.invoke<null>("guiBrowse", { query });
  }

  /** Every model name paired with its id. */
  async modelNamesAndIds(): Promise<{ name: string; id: number }[]> {
    return await this.invoke<{ name: string; id: number }[]>("modelNamesAndIds");
  }

  /** Every model name. */
  async modelNames(): Promise<string[]> {
    return await this.invoke<string[]>("modelNames");
  }

  /** Field names for one model. Returns [] if the model doesn't exist. */
  async modelFieldNames(modelName: string): Promise<string[]> {
    return await this.invoke<string[]>("modelFieldNames", { modelName });
  }

  /** Card templates for one model. */
  async modelTemplates(
    modelName: string,
  ): Promise<{ name: string; ord: number }[]> {
    const result = await this.invoke<
      Record<string, { Name: string; Ord: number }>
    >("modelTemplates", { modelName });
    if (!result) return [];
    return Object.values(result).map((t) => ({ name: t.Name, ord: t.Ord }));
  }

  /** Every tag in the collection. */
  async getTags(): Promise<string[]> {
    return await this.invoke<string[]>("getTags");
  }

  /** Remove tags from an existing note (idempotent). */
  async removeTags(noteIds: number[], tags: string): Promise<void> {
    await this.invoke<null>("removeTags", { notes: noteIds, tags });
  }

  /** Create a single note. Returns the new note id, or null on rejection. */
  async addNote(note: AnkiConnectNote): Promise<number | null> {
    return await this.invoke<number | null>("addNote", { note });
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