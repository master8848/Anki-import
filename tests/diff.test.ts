import { describe, expect, it } from "vitest";
import { diffDecks, diffNote, diffNoteLists, diffTags } from "@anki-xml/diff";
import type { ValidatedNote } from "@anki-xml/utils";

function note(partial: Partial<ValidatedNote> & { number: number }): ValidatedNote {
  return {
    deckName: "Deck",
    modelName: "Basic",
    fields: { Front: "front", Back: "back" },
    tags: ["a", "b"],
    ...partial,
  };
}

describe("diffTags", () => {
  it("reports added and removed tags", () => {
    expect(diffTags(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    expect(diffTags(["a"], ["a"])).toEqual({ added: [], removed: [] });
  });
});

describe("diffDecks", () => {
  it("reports missing and extra decks", () => {
    expect(diffDecks(["A", "B", "C"], ["B", "C", "D"])).toEqual({ missing: ["D"], extra: ["A"] });
    expect(diffDecks(["A"], ["A"])).toEqual({ missing: [], extra: [] });
  });
});

describe("diffNote", () => {
  it("reports unchanged notes", () => {
    const a = note({ number: 1, id: 7 });
    const b = note({ number: 1, id: 7, tags: ["b", "a"] });
    expect(diffNote(a, b)).toEqual({
      noteNumber: 1,
      id: 7,
      kind: "unchanged",
      changes: [],
    });
  });

  it("reports changed fields with from/to values", () => {
    const a = note({ number: 1, fields: { Front: "old", Back: "same" } });
    const b = note({ number: 1, fields: { Front: "new" } });
    const d = diffNote(a, b);
    expect(d.kind).toBe("changed");
    expect(d.changes).toEqual([
      { field: "Front", from: "old", to: "new" },
      { field: "Back", from: "same", to: undefined },
    ]);
  });

  it("reports tag and deck changes", () => {
    const a = note({ number: 1, deckName: "Old", tags: ["x"] });
    const b = note({ number: 1, deckName: "New", tags: ["x", "y"] });
    const d = diffNote(a, b);
    expect(d.kind).toBe("changed");
    expect(d.deckChanged).toEqual({ from: "Old", to: "New" });
    expect(d.tagsChanged).toEqual({ added: ["y"], removed: [] });
  });
});

describe("diffNoteLists", () => {
  it("matches by id when both sides have ids", () => {
    const before = [
      note({ number: 1, id: 7, fields: { Front: "old", Back: "back" } }),
      note({ number: 2, id: 8 }),
      note({ number: 3, id: 9 }),
    ];
    const after = [
      note({ number: 2, id: 8 }),
      note({ number: 3, id: 9 }),
      note({ number: 1, id: 7, fields: { Front: "new", Back: "back" } }),
    ];
    const diffs = diffNoteLists(before, after);
    expect(diffs).toHaveLength(3);
    const changed = diffs.find((d) => d.kind === "changed");
    expect(changed).toMatchObject({ id: 7, changes: [{ field: "Front", from: "old", to: "new" }] });
    expect(diffs.filter((d) => d.kind === "unchanged")).toHaveLength(2);
  });

  it("matches by number when ids are absent and reports removals", () => {
    const before = [note({ number: 1 }), note({ number: 2 })];
    const after = [note({ number: 1 }), note({ number: 3 })];
    const diffs = diffNoteLists(before, after);
    expect(diffs.map((d) => [d.noteNumber, d.kind])).toEqual([
      [1, "unchanged"],
      [2, "removed"],
      [3, "added"],
    ]);
  });

  it("lets the earliest after-note win when number and id point elsewhere", () => {
    const before = [note({ number: 5, id: 7 })];
    const after = [note({ number: 5 }), note({ number: 99, id: 7, fields: { Front: "new" } })];
    const diffs = diffNoteLists(before, after);
    expect(diffs.map((d) => [d.noteNumber, d.kind])).toEqual([
      [5, "unchanged"],
      [99, "added"],
    ]);
  });

  it("buckets duplicate numbers without matching a consumed note twice", () => {
    const before = [note({ number: 5 })];
    const after = [note({ number: 5 }), note({ number: 5, fields: { Front: "dup" } })];
    const diffs = diffNoteLists(before, after);
    expect(diffs.map((d) => [d.noteNumber, d.kind])).toEqual([[5, "unchanged"]]);
  });

  it("handles duplicate ids without matching one collection note twice", () => {
    const before = [note({ number: 1, id: 7 }), note({ number: 2, id: 7 })];
    const after = [note({ number: 1, id: 7 })];
    const diffs = diffNoteLists(before, after);
    expect(diffs.map((d) => [d.noteNumber, d.kind])).toEqual([
      [1, "unchanged"],
      [2, "removed"],
    ]);
  });
});
