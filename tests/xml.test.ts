/**
 * Tests for the XML parser/validator pipeline.
 *
 * Focuses on:
 *   - Round-trip of nested HTML
 *   - Round-trip of CDATA (with bare-`&` escaping, no double-escape)
 *   - Round-trip of MathJax inline/display math
 *   - Round-trip of native Anki [latex]...[/latex] blocks
 *   - Round-trip of HTML entities
 *   - Structural validation rules for every supported model
 *   - Default vs per-note deck
 *   - Tag parsing
 */

import { describe, expect, test } from "bun:test";
import { parseDocument, parseNotes, validateNotes, XmlParseError } from "../src/xml.ts";
import type { ParsedNote, ValidationResult } from "../src/types.ts";

function parse(src: string): ParsedNote[] {
  return parseNotes(src);
}

function validate(src: string): ValidationResult {
  // Use the parser-driven default deck. We supply a placeholder ("D")
  // unless the source EXPLICITLY writes `deck=""` (the only way to
  // opt INTO the "no deck" error path from this test file — every
  // other test ignores deck inheritance).
  const doc = parseDocument(src);
  const wantsExplicitEmpty = /<anki\b[^>]*\bdeck\s*=\s*""/.test(src);
  const defaultDeck = wantsExplicitEmpty ? doc.defaultDeck : (doc.defaultDeck || "D");
  return validateNotes(doc.notes, defaultDeck);
}

// ─── Well-formedness / root element ────────────────────────────────────────

describe("parseNotes: structure", () => {
  test("rejects non-XML input", () => {
    expect(() => parse("not xml at all <<<")).toThrow(XmlParseError);
  });

  test("rejects empty input", () => {
    expect(() => parse("")).toThrow(XmlParseError);
  });

  test("rejects wrong root element", () => {
    expect(() => parse("<deck><card/></deck>")).toThrow(/Root element must be <anki>/);
  });

  test("accepts empty <anki>", () => {
    const notes = parse("<anki></anki>");
    expect(notes).toHaveLength(0);
  });

  test("reads default deck from <anki deck=...>", () => {
    const r = validate('<anki deck="Foo::Bar"><note type="Basic"><front>Q</front><back>A</back></note></anki>');
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.deckName).toBe("Foo::Bar");
  });
});

// ─── Field extraction: plain HTML ──────────────────────────────────────────

describe("parseNotes: nested HTML preservation", () => {
  test("preserves inline <i>, <b>, <code>", () => {
    const xml = `<anki><note type="Basic"><front>State <i>the chain rule</i></front><back><b>(f &#183; g)&#39;(x)</b></back></note></anki>`;
    const r = validate(xml);
    expect(r.errors).toHaveLength(0);
    const fields = r.notes[0]!.fields;
    expect(fields.Front).toBe("State <i>the chain rule</i>");
    expect(fields.Back).toBe("<b>(f &#183; g)&#39;(x)</b>");
  });

  test("preserves multiple nested levels", () => {
    const xml = `<anki><note type="Basic"><front><div><p>Outer <span>inner</span></p></div></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Front).toBe("<div><p>Outer <span>inner</span></p></div>");
  });

  test("preserves <br> as line break", () => {
    const xml = `<anki><note type="Basic"><front>line1<br>line2</front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("line1<br>line2");
  });

  test("preserves HTML entities verbatim (no double-escape)", () => {
    const xml = `<anki><note type="Basic"><front>a &amp; b &lt; c</front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("a &amp; b &lt; c");
  });

  test("preserves attributes on nested tags", () => {
    const xml = `<anki><note type="Basic"><front><a href="https://example.com" title="ex">link</a></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe('<a href="https://example.com" title="ex">link</a>');
  });
});

// ─── Field extraction: CDATA ───────────────────────────────────────────────

describe("parseNotes: CDATA handling", () => {
  test("escapes bare & but keeps &lt; etc. verbatim", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[a & b &lt; c]]></front><back><![CDATA[OK]]></back></note></anki>`;
    const r = validate(xml);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Front).toBe("a &amp; b &lt; c");
    expect(r.notes[0]!.fields.Back).toBe("OK");
  });

  test("preserves numeric entities inside CDATA", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[&#39;]]></front><back><![CDATA[&#x27;]]></back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("&#39;");
    expect(r.notes[0]!.fields.Back).toBe("&#x27;");
  });

  test("escapes & not followed by an entity pattern", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[Tom & Jerry &amp; friends]]></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("Tom &amp; Jerry &amp; friends");
  });

  test("keeps CDATA contents that look like markup as text", () => {
    // If a field is wholly CDATA, no nested tags should be parsed.
    const xml = `<anki><note type="Basic"><front><![CDATA[<not><really><markup/>]]></front><back><![CDATA[done]]></back></note></anki>`;
    const r = validate(xml);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Front).toBe("&lt;not&gt;&lt;really&gt;&lt;markup/&gt;");
  });

  test("supports CDATA + nested markup in the same field", () => {
    const xml = `<anki><note type="Basic"><front>prefix <![CDATA[<unparsed/>]]> suffix</front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("prefix &lt;unparsed/&gt; suffix");
  });

  test("ignores markup-looking text inside CDATA when matching close tags", () => {
    // The CDATA contains </front> as literal text. The matching </front>
    // should be the one AFTER the CDATA. The space between `]]>` and
    // `real` is significant: it survives as the boundary between the
    // CDATA body and the trailing text node.
    const xml = `<anki><note type="Basic"><front><![CDATA[contains </front> as text]]> real</front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Front).toBe("contains &lt;/front&gt; as text real");
  });
});

// ─── Field extraction: MathJax ─────────────────────────────────────────────

describe("parseNotes: MathJax preservation", () => {
  test("preserves inline \\(...\\) inside CDATA", () => {
    // JS template literals strip unknown backslash escapes (`\(` -> `(`),
    // so we double the backslashes here to land real backslashes in the
    // CDATA body. The expected string uses doubled backslashes too, so
    // the parser is expected to round-trip them unchanged.
    const xml = `<anki><note type="Basic"><front><![CDATA[Solve \\(x^2 = 4\\).]]></front><back><![CDATA[\\(x = \\pm 2\\)]]></back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("Solve \\(x^2 = 4\\).");
    expect(r.notes[0]!.fields.Back).toBe("\\(x = \\pm 2\\)");
  });

  test("preserves display \\[...\\] inside CDATA across newlines", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[
Compute:
\\[
\\int_0^1 x^2\\,dx
\\]
]]></front><back><![CDATA[\\[
\\frac{1}{3}
\\]]]></back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toContain("\\int_0^1 x^2\\,dx");
    expect(r.notes[0]!.fields.Back).toContain("\\frac{1}{3}");
  });

  test("preserves backslashes literally inside CDATA", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[\\alpha + \\beta]]></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("\\alpha + \\beta");
  });
});

// ─── Field extraction: native Anki [latex] ─────────────────────────────────

describe("parseNotes: native Anki LaTeX", () => {
  test("preserves [latex]...[/latex] inside CDATA", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[Use [latex]E = mc^2[/latex]]]></front><back><![CDATA[
[latex]
\\sum_{i=1}^n i = \\frac{n(n+1)}{2}
[/latex]]]></back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("Use [latex]E = mc^2[/latex]");
    expect(r.notes[0]!.fields.Back).toContain("\\sum_{i=1}^n i");
  });

  test("preserves [latex] outside CDATA as XML", () => {
    const xml = `<anki><note type="Basic"><front>The identity [latex]a^2+b^2=c^2[/latex] is ...</front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("The identity [latex]a^2+b^2=c^2[/latex] is ...");
  });
});

// ─── Field extraction: whitespace ──────────────────────────────────────────

describe("parseNotes: whitespace", () => {
  test("leading/trailing whitespace inside field is preserved in raw form, then trimmed by builder", () => {
    const xml = `<anki><note type="Basic"><front>
      Hello
    </front><back>    world    </back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("Hello");
    expect(r.notes[0]!.fields.Back).toBe("world");
  });

  test("preserves internal whitespace between text and tags", () => {
    const xml = `<anki><note type="Basic"><front>foo<b>bar</b>baz</front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("foo<b>bar</b>baz");
  });
});

// ─── Per-model structural validation ───────────────────────────────────────

describe("validateNotes: Basic", () => {
  test("accepts a complete Basic note", () => {
    const r = validate(`<anki><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    expect(r.errors).toHaveLength(0);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]!.modelName).toBe("Basic");
  });

  test("rejects Basic missing <front>", () => {
    const r = validate(`<anki><note type="Basic"><back>A</back></note></anki>`);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.errors.some((e) => /<front>/.test(e.message))).toBe(true);
  });

  test("rejects Basic with empty <front>", () => {
    const r = validate(`<anki><note type="Basic"><front>   </front><back>A</back></note></anki>`);
    expect(r.errors.some((e) => /empty/.test(e.message))).toBe(true);
  });

  test("rejects Basic using <text> instead of <front>", () => {
    const r = validate(`<anki><note type="Basic"><text>Q</text><back>A</back></note></anki>`);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  test("rejects Basic with <addReverse>", () => {
    const r = validate(`<anki><note type="Basic"><front>Q</front><back>A</back><addReverse>yes</addReverse></note></anki>`);
    expect(r.errors.some((e) => /addReverse/.test(e.message))).toBe(true);
  });
});

describe("validateNotes: Basic (and reversed card)", () => {
  test("accepts front + back", () => {
    const r = validate(`<anki><note type="Basic (and reversed card)"><front>Q</front><back>A</back></note></anki>`);
    expect(r.errors).toHaveLength(0);
  });

  test("rejects missing back", () => {
    const r = validate(`<anki><note type="Basic (and reversed card)"><front>Q</front></note></anki>`);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe("validateNotes: Basic (optional reversed card)", () => {
  test("accepts addReverse=yes", () => {
    const r = validate(`<anki><note type="Basic (optional reversed card)"><front>Q</front><back>A</back><addReverse>yes</addReverse></note></anki>`);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields["Add Reverse"]).toBe("yes");
  });

  test("accepts addReverse=no", () => {
    const r = validate(`<anki><note type="Basic (optional reversed card)"><front>Q</front><back>A</back><addReverse>no</addReverse></note></anki>`);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields["Add Reverse"]).toBe("no");
  });

  test("accepts extra when addReverse=yes", () => {
    const r = validate(`<anki><note type="Basic (optional reversed card)"><front>Q</front><back>A</back><addReverse>yes</addReverse><extra>hint</extra></note></anki>`);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Extra).toBe("hint");
  });

  test("rejects missing addReverse", () => {
    const r = validate(`<anki><note type="Basic (optional reversed card)"><front>Q</front><back>A</back></note></anki>`);
    expect(r.errors.some((e) => /addReverse/.test(e.message))).toBe(true);
  });

  test("rejects invalid addReverse value", () => {
    const r = validate(`<anki><note type="Basic (optional reversed card)"><front>Q</front><back>A</back><addReverse>maybe</addReverse></note></anki>`);
    // The literal text "yes or no" with a space never appears in the
    // message; the validator emits `"yes" or "no"` with quotes. Use a
    // flexible regex that matches any chars between the two words.
    expect(r.errors.some((e) => /yes.*no/.test(e.message))).toBe(true);
  });

  test("addReverse inside CDATA counts as text 'yes'", () => {
    const r = validate(`<anki><note type="Basic (optional reversed card)"><front>Q</front><back>A</back><addReverse><![CDATA[yes]]></addReverse></note></anki>`);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields["Add Reverse"]).toBe("yes");
  });
});

describe("validateNotes: Basic (type in the answer)", () => {
  test("accepts front + back", () => {
    const r = validate(`<anki><note type="Basic (type in the answer)"><front>Q</front><back>A</back></note></anki>`);
    expect(r.errors).toHaveLength(0);
  });
});

describe("validateNotes: Cloze", () => {
  test("accepts a cloze with markers", () => {
    const r = validate(`<anki><note type="Cloze"><text>The {{c1::Moon}}.</text></note></anki>`);
    expect(r.errors).toHaveLength(0);
    expect(r.notes[0]!.fields.Text).toBe("The {{c1::Moon}}.");
  });

  test("rejects cloze without markers", () => {
    const r = validate(`<anki><note type="Cloze"><text>No markers here.</text></note></anki>`);
    expect(r.errors.some((e) => /cloze/i.test(e.message) || /c\d/.test(e.message))).toBe(true);
  });

  test("rejects cloze using <front>", () => {
    const r = validate(`<anki><note type="Cloze"><front>{{c1::x}}</front></note></anki>`);
    expect(r.errors.some((e) => /front|back/.test(e.message))).toBe(true);
  });

  test("accepts cloze with extra", () => {
    const r = validate(`<anki><note type="Cloze"><text>{{c1::answer}}</text><extra>hint</extra></note></anki>`);
    expect(r.notes[0]!.fields.Extra).toBe("hint");
  });

  test("accepts multiple cloze markers c1 and c2", () => {
    const r = validate(`<anki><note type="Cloze"><text>{{c1::a}} and {{c2::b}}</text></note></anki>`);
    expect(r.errors).toHaveLength(0);
  });
});

// ─── Deck inheritance and per-note override ─────────────────────────────────

describe("validateNotes: deck inheritance", () => {
  test("falls back to <anki deck=...>", () => {
    const r = validate(`<anki deck="Root::A"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    expect(r.notes[0]!.deckName).toBe("Root::A");
  });

  test("per-note deck wins over default", () => {
    const r = validate(`<anki deck="Root::A"><note type="Basic" deck="Override::B"><front>Q</front><back>A</back></note></anki>`);
    expect(r.notes[0]!.deckName).toBe("Override::B");
  });

  test("errors when neither deck is set", () => {
    const r = validate(`<anki deck=""><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    expect(r.errors.some((e) => /no deck/.test(e.message))).toBe(true);
  });
});

// ─── Tag parsing ───────────────────────────────────────────────────────────

describe("validateNotes: tags", () => {
  test("space-separated tags", () => {
    const r = validate(`<anki deck="D"><note type="Basic" tags="foo bar baz"><front>Q</front><back>A</back></note></anki>`);
    expect(r.notes[0]!.tags).toEqual(["foo", "bar", "baz"]);
  });

  test("missing tags attribute -> []", () => {
    const r = validate(`<anki deck="D"><note type="Basic"><front>Q</front><back>A</back></note></anki>`);
    expect(r.notes[0]!.tags).toEqual([]);
  });

  test("collapses extra whitespace", () => {
    const r = validate(`<anki deck="D"><note type="Basic" tags="  a   b  "><front>Q</front><back>A</back></note></anki>`);
    expect(r.notes[0]!.tags).toEqual(["a", "b"]);
  });
});

// ─── Mixed CDATA + nested tags inside a single field ────────────────────────

describe("parseNotes: mixed CDATA and tags", () => {
  test("CDATA at start, markup at end", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[hello]]> <b>world</b></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("hello <b>world</b>");
  });

  test("markup at start, CDATA at end", () => {
    const xml = `<anki><note type="Basic"><front><b>hello</b> <![CDATA[world & friends]]></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("<b>hello</b> world &amp; friends");
  });

  test("multiple CDATA sections", () => {
    const xml = `<anki><note type="Basic"><front><![CDATA[a]]>-<![CDATA[b]]></front><back>x</back></note></anki>`;
    const r = validate(xml);
    expect(r.notes[0]!.fields.Front).toBe("a-b");
  });
});

// ─── Multiple notes ────────────────────────────────────────────────────────

describe("parseNotes: multi-note documents", () => {
  test("numbers notes 1-based", () => {
    const xml = `<anki deck="D">
      <note type="Basic"><front>1</front><back>1</back></note>
      <note type="Basic"><front>2</front><back>2</back></note>
      <note type="Cloze"><text>{{c1::3}}</text></note>
    </anki>`;
    const r = validate(xml);
    expect(r.notes.map((n) => n.number)).toEqual([1, 2, 3]);
  });

  test("mixes errors across notes", () => {
    const xml = `<anki deck="D">
      <note type="Basic"><front>1</front><back>1</back></note>
      <note type="Basic"><back>only back</back></note>
      <note type="Cloze"><text>no markers</text></note>
    </anki>`;
    const r = validate(xml);
    expect(r.notes).toHaveLength(1);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("rejects duplicate field tags", () => {
    const xml = `<anki deck="D"><note type="Basic"><front>Q1</front><front>Q2</front><back>A</back></note></anki>`;
    const r = validate(xml);
    expect(r.errors.some((e) => /more than once/.test(e.message))).toBe(true);
  });
});
