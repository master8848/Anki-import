import { describe, expect, it } from "vitest";
import { chunkArray, parseTagList, toAnkiConnectNote } from "@anki-xml/utils";
import type { ValidatedNote } from "@anki-xml/utils";

function note(partial: Partial<ValidatedNote> & { number: number }): ValidatedNote {
  return {
    deckName: "Deck",
    modelName: "Basic",
    fields: { Front: "front", Back: "back" },
    tags: ["a"],
    ...partial,
  };
}

describe("parseTagList", () => {
  it("splits on whitespace, trims, and drops empties", () => {
    expect(parseTagList("  aaa   bbb\tccc\n ddd ")).toEqual(["aaa", "bbb", "ccc", "ddd"]);
    expect(parseTagList("   ")).toEqual([]);
    expect(parseTagList("")).toEqual([]);
  });
});

describe("toAnkiConnectNote", () => {
  it("copies fields/tags and forwards allowDuplicate", () => {
    const n = note({ number: 1, tags: ["x", "y"] });
    const payload = toAnkiConnectNote(n, true);
    expect(payload).toEqual({
      deckName: "Deck",
      modelName: "Basic",
      fields: { Front: "front", Back: "back" },
      tags: ["x", "y"],
      options: { allowDuplicate: true },
    });
    payload.fields["Front"] = "mutated";
    payload.tags.push("mutated");
    expect(n.fields["Front"]).toBe("front");
    expect(n.tags).toEqual(["x", "y"]);
  });
});

describe("chunkArray", () => {
  it("chunks into at-most-size slices and handles empty input", () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 2)).toEqual([]);
  });
});
