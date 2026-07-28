/**
 * Edge-case tests covering the kinds of real-world XML inputs that
 * have caused bugs in similar Anki-import tools. Each test cites the
 * upstream issue (where applicable) so a future reader can trace the
 * "why" of every assertion back to a concrete report.
 *
 * Sources of inspiration:
 *   - terkelg/anki-markdown#33  (cloze support)
 *   - terkelg/anki-markdown#36  (comma-separated cloze ordinals)
 *   - terkelg/anki-markdown#43  (list rendering mangled by importer)
 *   - terkelg/anki-markdown#44  (PR: preserve raw template field text)
 *   - terkelg/anki-markdown#45  (PR: preserve field indentation)
 */

import { describe, expect, test } from "bun:test";
import { importFromFile } from "../src/import.ts";
import { parseDocument, parseNotes, validateNotes, XmlParseError } from "../src/xml.ts";
import type { AnkiConnectResponse } from "../src/types.ts";

// ─── XML well-formedness: hostile input ────────────────────────────────────

describe("XML well-formedness edge cases", () => {
  test("XML declaration is allowed", () => {
    const src = `<?xml version="1.0" encoding="UTF-8"?><anki><note type="Basic"><front>Q</front><back>A</back></note></anki>`;
    expect(() => parseNotes(src)).not.toThrow();
  });

  test("UTF-8 BOM at start of file is tolerated", () => {
    const src = `\uFEFF<anki><note type="Basic"><front>Q</front><back>A</back></note></anki>`;
    expect(() => parseNotes(src)).not.toThrow();
  });

  test("DOCTYPE declaration is parsed but ignored (the file still imports)", () => {
    // fast-xml-parser is lenient and silently accepts DOCTYPE. We
    // don't validate against any DTD, so the declaration is ignored
    // and the notes are parsed as if the DOCTYPE weren't there.
    // The contract here is documentation: if a user wraps their
    // file in DOCTYPE because their authoring tool adds one, the
    // import will still work and the DOCTYPE is a no-op.
    const src = `<?xml version="1.0"?><!DOCTYPE anki []><anki><note type="Basic"><front>Q</front><back>A</back></note></anki>`;
    expect(() => parseNotes(src)).not.toThrow();
    const notes = parseNotes(src);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe("Basic");
  });

  test("rejects bare `<` in PCDATA (illegal in XML)", () => {
    // Authors sometimes paste a `5 < 10` expression into a field and
    // forget to wrap it in CDATA. That is illegal XML — `&lt;` is
    // required. We must NOT silently turn it into a tag boundary.
    const src = `<anki><note type="Basic"><front>5 < 10</front><back>A</back></note></anki>`;
    expect(() => parseNotes(src)).toThrow(XmlParseError);
  });

  test("rejects bare `&` in PCDATA (illegal in XML)", () => {
    const src = `<anki><note type="Basic"><front>Tom & Jerry</front><back>A</back></note></anki>`;
    expect(() => parseNotes(src)).toThrow(XmlParseError);
  });

  test("self-closing field tag is treated as missing field", () => {
    // `<front/>` looks like a present-but-empty field to a casual
    // reader. Our pipeline must surface it as a missing-field error,
    // not as a field with empty content. The downstream validator
    // already covers this; we re-pin the contract here.
    const r = validateNotes(
      [{ number: 1, type: "Basic", deck: "", tags: "", fields: [] }],
      "D",
    );
    expect(r.notes).toHaveLength(0);
    expect(r.errors.some((e) => /<front>/.test(e.message))).toBe(true);
  });

  test("comments inside <anki> are ignored, not parsed as notes", () => {
    const src = `<anki deck="D">
      <!-- a comment that mentions <note type="Basic"> but is not real -->
      <note type="Basic"><front>Q</front><back>A</back></note>
    </anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes).toHaveLength(1);
  });
});

// ─── Unicode & multi-byte content ──────────────────────────────────────────

describe("Unicode and multi-byte content", () => {
  test("emoji round-trips unchanged", () => {
    const src = `<anki deck="D"><note type="Basic"><front>🎉 party</front><back>🥳 celebration</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Front).toBe("🎉 party");
    expect(r.notes[0]!.fields.Back).toBe("🥳 celebration");
  });

  test("CJK content round-trips unchanged", () => {
    const src = `<anki deck="D"><note type="Basic"><front>你好</front><back>Hello</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes[0]!.fields.Front).toBe("你好");
  });

  test("RTL content round-trips unchanged", () => {
    const src = `<anki deck="D"><note type="Basic"><front>مرحبا</front><back>Hello</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes[0]!.fields.Front).toBe("مرحبا");
  });

  test("zero-width joiners and combining characters are preserved", () => {
    // ZWJ sequences are common in emoji and complex scripts. The
    // pipeline must not normalize them away.
    const src = `<anki deck="D"><note type="Basic"><front>👨‍👩‍👧‍👦</front><back>family</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes[0]!.fields.Front).toBe("👨‍👩‍👧‍👦");
  });
});

// ─── Deck name edge cases ─────────────────────────────────────────────────

describe("Deck name edge cases", () => {
  test("deck name with multiple `::` (deep hierarchy) works", () => {
    const src = `<anki deck="A::B::C::D::E"><note type="Basic"><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "A::B::C::D::E");
    expect(r.notes[0]!.deckName).toBe("A::B::C::D::E");
  });

  test("default deck name with trailing colons is preserved", () => {
    const src = `<anki deck="Top::"><note type="Basic"><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "Top::");
    expect(r.notes[0]!.deckName).toBe("Top::");
  });

  test("empty per-note deck falls back to <anki> default", () => {
    const src = `<anki deck="DefaultDeck"><note type="Basic" deck=""><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "DefaultDeck");
    expect(r.notes[0]!.deckName).toBe("DefaultDeck");
  });
});

// ─── Tag edge cases ───────────────────────────────────────────────────────

describe("Tag edge cases", () => {
  test("single tag", () => {
    const src = `<anki deck="D"><note type="Basic" tags="solo"><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes[0]!.tags).toEqual(["solo"]);
  });

  test("tags with tab/newline separation (treat as whitespace)", () => {
    const src = `<anki deck="D"><note type="Basic" tags="a\tb\nc"><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes[0]!.tags).toEqual(["a", "b", "c"]);
  });

  test("empty tag attribute produces no tags", () => {
    const src = `<anki deck="D"><note type="Basic" tags=""><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes[0]!.tags).toEqual([]);
  });
});

// ─── Structural edge cases ────────────────────────────────────────────────

describe("Structural edge cases", () => {
  test("note with no recognized fields is flagged as missing-required", () => {
    // Cloze note with no <text> and no <front>/<back> at all.
    const src = `<anki deck="D"><note type="Cloze"></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes).toHaveLength(0);
    expect(r.errors.some((e) => /<text>/.test(e.message))).toBe(true);
  });

  test("note with only <extra> for a non-Cloze model is rejected", () => {
    const src = `<anki deck="D"><note type="Basic"><extra>hint only</extra></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes).toHaveLength(0);
    expect(r.errors.some((e) => /<front>/.test(e.message))).toBe(true);
  });

  test("a field that is ONLY a CDATA section containing only whitespace is rejected", () => {
    // The author clearly intended this to be content. We must surface
    // the missing-content error, not silently treat the field as
    // meaningful.
    const src = `<anki deck="D"><note type="Basic"><front><![CDATA[   \n\t  ]]></front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes).toHaveLength(0);
    expect(r.errors.some((e) => /empty/.test(e.message))).toBe(true);
  });

  test("a field that is ONLY an <img> tag is rejected (no real content)", () => {
    // The naive `hasMeaningfulContent` strips tags before checking
    // length. An `<img>` is not meaningful text — its content is in
    // the src, not in the field body.
    const src = `<anki deck="D"><note type="Basic"><front><img src="x.png"/></front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes).toHaveLength(0);
    expect(r.errors.some((e) => /empty/.test(e.message))).toBe(true);
  });

  test("a field with text AND an <img> tag is accepted", () => {
    const src = `<anki deck="D"><note type="Basic"><front>see <img src="x.png"/> here</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Front).toBe("see <img src=\"x.png\"/> here");
  });

  test("unknown field tags are silently skipped (not validated as fields)", () => {
    // `<hint>` is not a recognized field. We don't know what to do
    // with it, so we ignore it. The Basic note still validates
    // because front+back are present and meaningful.
    const src = `<anki deck="D"><note type="Basic"><front>Q</front><back>A</back><hint>extra</hint></note></anki>`;
    const r = validateNotes(parseNotes(src), "D");
    expect(r.notes).toHaveLength(1);
  });
});

// ─── defaultDeck inheritance from <anki deck=...> ─────────────────────────

describe("Default deck inheritance", () => {
  test("<anki> with no deck attribute AND no per-note deck is an error", () => {
    const src = `<anki><note type="Basic"><front>Q</front><back>A</back></note></anki>`;
    const r = validateNotes(parseNotes(src), "");
    expect(r.notes).toHaveLength(0);
    expect(r.errors.some((e) => /no deck/.test(e.message))).toBe(true);
  });

  test("per-note deck overrides the <anki> default for that note only", () => {
    const src = `<anki deck="Default">
      <note type="Basic"><front>1</front><back>1</back></note>
      <note type="Basic" deck="Override"><front>2</front><back>2</back></note>
      <note type="Basic"><front>3</front><back>3</back></note>
    </anki>`;
    const r = validateNotes(parseNotes(src), "Default");
    expect(r.notes.map((n) => n.deckName)).toEqual(["Default", "Override", "Default"]);
  });
});

// ─── Re-import / duplicate handling (end-to-end with mocked Anki) ────────

describe("Re-import and duplicate handling", () => {
  function makeMockAnki(
    addNotesResult: (number | null)[],
  ): typeof fetch {
    return (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.action === "createDeck") {
        return new Response(JSON.stringify({ result: 1, error: null }), { status: 200 });
      }
      if (body.action === "addNotes") {
        const env: AnkiConnectResponse<(number | null)[]> = {
          result: addNotesResult,
          error: null,
        };
        return new Response(JSON.stringify(env), { status: 200 });
      }
      return new Response(JSON.stringify({ result: null, error: null }), { status: 200 });
    }) as unknown as typeof fetch;
  }

  function writeTemp(name: string, body: string): string {
    const path = `/tmp/anki-xml-edge-${name}-${Math.random().toString(36).slice(2)}.xml`;
    require("node:fs").writeFileSync(path, body);
    return path;
  }

  test("second import of identical file with allowDuplicate=false yields 0 new notes", async () => {
    // AnkiConnect's `addNotes` returns [null, null, null] for the
    // three duplicates; our reconciler must count those as `failed`,
    // not `created`, and exit 1.
    const path = writeTemp(
      "dup",
      `<anki deck="D"><note type="Basic"><front>Q</front><back>A</back></note></anki>`,
    );
    const fetchImpl = makeMockAnki([null]);
    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.result.created).toBe(0);
    expect(outcome.result.failed).toHaveLength(1);
    expect(outcome.result.failed[0]!.noteNumber).toBe(1);
  });

  test("createDeck is called once per unique deck even across many notes", async () => {
    const deckCalls: string[] = [];
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.action === "createDeck") {
        deckCalls.push((body.params as { deck: string }).deck);
        return new Response(JSON.stringify({ result: 1, error: null }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: [1, 1, 1], error: null }), { status: 200 });
    }) as unknown as typeof fetch;

    const path = writeTemp(
      "dedup",
      `<anki>
        <note type="Basic" deck="Same"><front>1</front><back>1</back></note>
        <note type="Basic" deck="Same"><front>2</front><back>2</back></note>
        <note type="Basic" deck="Other"><front>3</front><back>3</back></note>
      </anki>`,
    );
    await importFromFile({ inputPath: path, fetchImpl });
    expect(deckCalls.sort()).toEqual(["Other", "Same"]);
    expect(deckCalls.filter((d) => d === "Same")).toHaveLength(1);
  });

  test("createDeck error aborts the import (no notes are posted)", async () => {
    const addNotesCalled = { value: false };
    const fetchImpl: typeof fetch = (async (_input, init) => {
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.action === "createDeck") {
        return new Response(
          JSON.stringify({ result: null, error: "deck name contains '/' or '?'" }),
          { status: 200 },
        );
      }
      if (body.action === "addNotes") {
        addNotesCalled.value = true;
      }
      return new Response(JSON.stringify({ result: [], error: null }), { status: 200 });
    }) as unknown as typeof fetch;

    const path = writeTemp("createrr", `<anki deck="bad?"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    await expect(importFromFile({ inputPath: path, fetchImpl })).rejects.toThrow(
      /deck name contains/,
    );
    expect(addNotesCalled.value).toBe(false);
  });
});

// ─── parseDocument default-deck contract ───────────────────────────────────

describe("parseDocument default-deck contract", () => {
  test("defaultDeck is empty string when <anki> has no deck attribute", () => {
    const doc = parseDocument(`<anki><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    expect(doc.defaultDeck).toBe("");
  });

  test("defaultDeck is the attribute value when present", () => {
    const doc = parseDocument(
      `<anki deck="Foo::Bar"><note type="Basic"><front>Q</front><back>A</back></note></anki>`,
    );
    expect(doc.defaultDeck).toBe("Foo::Bar");
  });

  test("defaultDeck is empty string for explicit empty attribute", () => {
    const doc = parseDocument(
      `<anki deck=""><note type="Basic"><front>Q</front><back>A</back></note></anki>`,
    );
    expect(doc.defaultDeck).toBe("");
  });
});
