/**
 * Pure diff helpers: note-vs-note, note lists, decks, and tags.
 */

import type { ValidatedNote } from "@anki-xml/utils";

export interface FieldDiff {
  field: string;
  from?: string;
  to?: string;
}

export interface NoteDiff {
  noteNumber: number;
  id?: number;
  kind: "added" | "removed" | "changed" | "unchanged";
  changes: FieldDiff[];
  deckChanged?: { from?: string; to?: string };
  modelChanged?: { from?: string; to?: string };
  tagsChanged?: { added: string[]; removed: string[] };
}

/** Added tags (in `b`, not in `a`) and removed tags (in `a`, not in `b`). */
export function diffTags(a: string[], b: string[]): { added: string[]; removed: string[] } {
  const bSet = new Set(b);
  const aSet = new Set(a);
  return {
    added: b.filter((t) => !aSet.has(t)),
    removed: a.filter((t) => !bSet.has(t)),
  };
}

/** Decks expected but missing from the collection, plus extras in the collection. */
export function diffDecks(collection: string[], expected: string[]): { missing: string[]; extra: string[] } {
  const coll = new Set(collection);
  const exp = new Set(expected);
  return {
    missing: expected.filter((d) => !coll.has(d)),
    extra: collection.filter((d) => !exp.has(d)),
  };
}

/**
 * Diff two notes. Kind is "changed" when any field value, deckName,
 * modelName, or tags differ; `changes` lists the differing fields.
 */
export function diffNote(a: ValidatedNote, b: ValidatedNote): NoteDiff {
  const keys = new Set([...Object.keys(a.fields), ...Object.keys(b.fields)]);
  const changes: FieldDiff[] = [];
  for (const key of keys) {
    const from = a.fields[key];
    const to = b.fields[key];
    if (from !== to) changes.push({ field: key, ...(from !== undefined && { from }), ...(to !== undefined && { to }) });
  }
  const tags = diffTags(a.tags, b.tags);
  const deckChanged = a.deckName !== b.deckName ? { from: a.deckName, to: b.deckName } : undefined;
  const modelChanged = a.modelName !== b.modelName ? { from: a.modelName, to: b.modelName } : undefined;
  const tagsChanged = tags.added.length > 0 || tags.removed.length > 0 ? tags : undefined;

  if (changes.length === 0 && deckChanged === undefined && modelChanged === undefined && tagsChanged === undefined) {
    return { noteNumber: a.number, id: a.id, kind: "unchanged", changes: [] };
  }
  const out: NoteDiff = { noteNumber: a.number, id: a.id, kind: "changed", changes };
  if (deckChanged) out.deckChanged = deckChanged;
  if (modelChanged) out.modelChanged = modelChanged;
  if (tagsChanged) out.tagsChanged = tagsChanged;
  return out;
}

/**
 * Diff two note lists. Matching rules (restored old `.find` semantics):
 * - an after-note WITH an id matches only by id;
 * - an after-note WITHOUT an id matches by `number` (any before note);
 * - earliest after-note wins; unmatched notes become "added"/"removed".
 *
 * Runs in O(n): notes are indexed into id/number buckets (numbers only
 * for id-less notes) and each `before` note scans its candidate matches
 * with a single merge pass.
 */
export function diffNoteLists(before: ValidatedNote[], after: ValidatedNote[]): NoteDiff[] {
  const idBuckets = new Map<number, number[]>();
  const numBuckets = new Map<number, number[]>();
  for (let i = 0; i < after.length; i++) {
    const a = after[i]!;
    if (a.id !== undefined) {
      const list = idBuckets.get(a.id);
      if (list) list.push(i);
      else idBuckets.set(a.id, [i]);
    } else {
      const list = numBuckets.get(a.number);
      if (list) list.push(i);
      else numBuckets.set(a.number, [i]);
    }
  }

  const used = new Set<number>();
  const out: NoteDiff[] = [];

  for (const b of before) {
    const idCands = b.id !== undefined ? idBuckets.get(b.id) : undefined;
    const match = firstUnusedMatch(after, idCands, numBuckets.get(b.number), used);
    if (!match) {
      out.push({ noteNumber: b.number, id: b.id, kind: "removed", changes: [] });
      continue;
    }
    used.add(match.number);
    out.push(diffNote(b, match));
  }

  for (const a of after) {
    if (used.has(a.number)) continue;
    out.push({ noteNumber: a.number, id: a.id, kind: "added", changes: [] });
  }
  return out;
}

/**
 * First `after` note (by position) among the candidate buckets that has
 * not been consumed. Both candidate lists are ascending, so a single
 * merge pass reproduces the previous linear `.find` scan.
 */
function firstUnusedMatch(
  after: ValidatedNote[],
  idCands: readonly number[] | undefined,
  numCands: readonly number[] | undefined,
  used: Set<number>,
): ValidatedNote | undefined {
  const ids = idCands ?? [];
  const nums = numCands ?? [];
  let i = 0;
  let j = 0;
  while (i < ids.length || j < nums.length) {
    const idIdx = i < ids.length ? ids[i]! : Infinity;
    const numIdx = j < nums.length ? nums[j]! : Infinity;
    let idx: number;
    if (idIdx < numIdx) {
      idx = idIdx;
      i++;
    } else if (numIdx < idIdx) {
      idx = numIdx;
      j++;
    } else {
      idx = idIdx;
      i++;
      j++;
    }
    const a = after[idx]!;
    if (!used.has(a.number)) return a;
  }
  return undefined;
}
