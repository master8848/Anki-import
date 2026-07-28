/**
 * Regression and compatibility cases derived from the public
 * terkelg/anki-markdown issue tracker.
 *
 * anki-xml is not a Markdown renderer or an editor add-on, so UI-only
 * upstream reports are documented rather than simulated here. These tests
 * pin the cases that do cross our boundary: raw source preservation, HTML,
 * code-looking text, cloze syntax, tables, indentation, and large batches.
 *
 * Upstream references:
 *   #10  HTML-like text in code
 *   #12  custom script/storage content
 *   #33  code-rich cloze notes
 *   #36  comma-separated cloze ordinals
 *   #39  type-in answers
 *   #43  nested list layout
 *   #44  raw template field text (PR)
 *   #45  field indentation (PR)
 *   #48  <br> inside tables
 */

import { afterEach, describe, expect, test } from "bun:test";
import { importFromFile } from "../src/import.ts";
import { parseDocument, parseNotes, validateNotes, XmlParseError } from "../src/xml.ts";
import type { ValidationResult } from "../src/types.ts";

function validate(source: string): ValidationResult {
  const doc = parseDocument(source);
  return validateNotes(doc.notes, doc.defaultDeck || "D");
}

function fields(source: string): Record<string, string> {
  const result = validate(source);
  expect(result.errors).toHaveLength(0);
  expect(result.notes).toHaveLength(1);
  return result.notes[0]!.fields;
}

const tempFiles: string[] = [];

afterEach(async () => {
  await Promise.all(tempFiles.splice(0).map((path) => Bun.file(path).delete()));
});

describe("strict XML boundaries for AI-authored files", () => {
  test("rejects a missing </note> instead of recovering a different tree", () => {
    const source =
      '<anki><note type="Basic"><front>Q</front><back>A</back></anki>';
    expect(() => parseNotes(source)).toThrow(XmlParseError);
    expect(() => parseNotes(source)).toThrow(/Expected closing tag 'note'/);
  });

  test("rejects a mismatched field close tag", () => {
    const source =
      '<anki><note type="Basic"><front>Q</front><back>A</front></note></anki>';
    expect(() => parseNotes(source)).toThrow(XmlParseError);
  });

  test("rejects an entity-like ampersand without a semicolon", () => {
    const source =
      '<anki><note type="Basic"><front>Tom &broken Jerry</front><back>A</back></note></anki>';
    expect(() => parseNotes(source)).toThrow(/Malformed XML|Illegal '&'/);
  });

  test("accepts self-closing empty <anki/>", () => {
    expect(parseNotes("<anki/>")).toEqual([]);
  });
});

describe("code and raw text preservation (#10, #44, #45)", () => {
  test("preserves HTML-looking JavaScript as entities inside real <pre><code>", () => {
    const result = fields(`<anki deck="Code"><note type="Basic">
      <front>What does this create?</front>
      <back><pre><code>$( "&lt;a&gt;", {
  html: "This is a &lt;strong&gt;new&lt;/strong&gt; link",
  href: "foo.html"
});</code></pre></back>
    </note></anki>`);

    expect(result.Back).toBe(`<pre><code>$( "&lt;a&gt;", {
  html: "This is a &lt;strong&gt;new&lt;/strong&gt; link",
  href: "foo.html"
});</code></pre>`);
    expect(result.Back).not.toContain("</a>");
  });

  test("CDATA is the concise way to preserve a literal fenced-code string", () => {
    const result = fields(`<anki deck="Code"><note type="Basic">
      <front>Literal source</front>
      <back><![CDATA[\`\`\`js
const link = "<a>";
const ok = 1 < 2 && 3 > 2;
\`\`\`]]></back>
    </note></anki>`);

    expect(result.Back).toBe(
      '```js\nconst link = "&lt;a&gt;";\nconst ok = 1 &lt; 2 &amp;&amp; 3 &gt; 2;\n```',
    );
  });

  test("preserves Markdown list indentation byte-for-byte inside the field", () => {
    const markdown = `1. 短期
   - NAT
   - L4, L7 反向代理
1. 中/长期
   - 逐步重新规划 IP`;
    const result = fields(`<anki deck="Lists"><note type="Basic">
      <front>Plan</front><back><![CDATA[${markdown}]]></back>
    </note></anki>`);
    expect(result.Back).toBe(markdown);
  });

  test("preserves a nested HTML list when the target is a built-in Anki model", () => {
    const result = fields(`<anki deck="Lists"><note type="Basic">
      <front>Plan</front>
      <back><ol><li>Short term<ul><li>NAT</li><li>L4 proxy</li></ul></li><li>Long term</li></ol></back>
    </note></anki>`);
    expect(result.Back).toBe(
      "<ol><li>Short term<ul><li>NAT</li><li>L4 proxy</li></ul></li><li>Long term</li></ol>",
    );
  });

  test("embeds a literal ]]> by splitting adjacent CDATA sections", () => {
    const result = fields(`<anki deck="Code"><note type="Basic">
      <front>CDATA terminator</front>
      <back><![CDATA[literal ]]]]><![CDATA[> token]]></back>
    </note></anki>`);
    expect(result.Back).toBe("literal ]]&gt; token");
  });
});

describe("HTML fields and reviewer-owned behavior (#12, #48)", () => {
  test("preserves a table containing <br> and <br/>", () => {
    const result = fields(`<anki deck="Tables"><note type="Basic">
      <front>Ports</front>
      <back><table><thead><tr><th>Protocol</th><th>Ports</th></tr></thead><tbody><tr><td>Web</td><td>80<br>443<br/>8443</td></tr></tbody></table></back>
    </note></anki>`);
    expect(result.Back).toContain("<table>");
    expect(result.Back).toContain("80<br>443<br/>8443");
    expect(result.Back).toContain("</table>");
  });

  test("preserves query-string entities in nested HTML attributes", () => {
    const result = fields(`<anki deck="Links"><note type="Basic">
      <front>Reference</front>
      <back><a href="https://example.test/?a=1&amp;b=2">open</a></back>
    </note></anki>`);
    expect(result.Back).toBe(
      '<a href="https://example.test/?a=1&amp;b=2">open</a>',
    );
  });

  test("does not delete custom sessionStorage/localStorage scripts", () => {
    const result = fields(`<anki deck="Scripts"><note type="Basic">
      <front>Draft widget</front>
      <back><textarea id="draft"></textarea><script>
const saved = sessionStorage.getItem("currentDraft");
localStorage.setItem("lastDraft", saved || "");
</script></back>
    </note></anki>`);
    expect(result.Back).toContain('<textarea id="draft"></textarea>');
    expect(result.Back).toContain('sessionStorage.getItem("currentDraft")');
    expect(result.Back).toContain('localStorage.setItem("lastDraft"');
  });

  test("preserves media references but does not pretend to upload files", () => {
    const result = fields(`<anki deck="Media"><note type="Basic">
      <front>Identify this: <img src="diagram.png" alt="diagram"/></front>
      <back>Diagram A [sound:explanation.mp3]</back>
    </note></anki>`);
    expect(result.Front).toContain('<img src="diagram.png" alt="diagram"/>');
    expect(result.Back).toContain("[sound:explanation.mp3]");
  });
});

describe("Cloze and type-in compatibility (#33, #36, #39)", () => {
  test("preserves code-rich built-in Cloze fields", () => {
    const result = fields(`<anki deck="Rust"><note type="Cloze">
      <text><pre><code>pub enum {{c2::Entry}}&lt;...&gt; {
    {{c1::Occupied}}({{c1::OccupiedEntry&lt;...&gt;}}),
    {{c1::Vacant}}({{c1::VacantEntry&lt;...&gt;}}),
}</code></pre></text>
      <extra>Rust enum variants</extra>
    </note></anki>`);
    expect(result.Text).toContain("{{c2::Entry}}&lt;...&gt;");
    expect(result.Text).toContain("{{c1::OccupiedEntry&lt;...&gt;}}");
    expect(result.Extra).toBe("Rust enum variants");
  });

  test("accepts repeated, hinted, and nested clozes in one note", () => {
    const result = fields(`<anki deck="Cloze"><note type="Cloze">
      <text>{{c1::Canberra was {{c2::founded}}}} in {{c3::1913::year}}; {{c1::Canberra}} is the capital.</text>
    </note></anki>`);
    expect(result.Text).toContain("{{c1::Canberra was {{c2::founded}}}}");
    expect(result.Text).toContain("{{c3::1913::year}}");
  });

  test("accepts well-formed comma-separated cloze ordinals", () => {
    const result = fields(`<anki deck="Cloze"><note type="Cloze">
      <text>{{c1,2,10::shared answer}}</text>
    </note></anki>`);
    expect(result.Text).toBe("{{c1,2,10::shared answer}}");
  });

  test.each(["{{c,1::bad}}", "{{c1,::bad}}", "{{c1,,2::bad}}", "{{c,,,::bad}}"])(
    "rejects malformed comma-separated ordinal syntax: %s",
    (marker) => {
      const result = validate(
        `<anki deck="Cloze"><note type="Cloze"><text>Text ${marker}</text></note></anki>`,
      );
      expect(result.notes).toHaveLength(0);
      expect(result.errors.some((error) => /must contain/.test(error.message))).toBe(true);
    },
  );

  test("supports rich HTML in Basic (type in the answer)", () => {
    const result = fields(`<anki deck="Rust"><note type="Basic (type in the answer)">
      <front>Which trait provides <code>Future::map</code>?<pre><code>future.map(transform)</code></pre></front>
      <back>FutureExt</back>
    </note></anki>`);
    expect(result.Front).toContain("<code>Future::map</code>");
    expect(result.Front).toContain("<pre><code>future.map(transform)</code></pre>");
    expect(result.Back).toBe("FutureExt");
  });
});

describe("large AI-generated batches", () => {
  test("sends 250 validated notes in one ordered addNotes request", async () => {
    const count = 250;
    const notes = Array.from(
      { length: count },
      (_, index) =>
        `<note type="Basic" tags="generated batch"><front>Question ${index + 1}</front><back>Answer ${index + 1}</back></note>`,
    ).join("\n");
    const path = `/tmp/anki-xml-upstream-batch-${crypto.randomUUID()}.xml`;
    tempFiles.push(path);
    await Bun.write(path, `<anki deck="AI::Bulk">${notes}</anki>`);

    let addCalls = 0;
    let posted: Array<{ fields: Record<string, string> }> = [];
    const fetchImpl = (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const request = JSON.parse(String(init?.body));
      if (request.action === "createDeck") {
        return new Response(JSON.stringify({ result: 1, error: null }));
      }
      addCalls++;
      posted = request.params.notes;
      return new Response(
        JSON.stringify({
          result: posted.map((_, index) => 1_000_000 + index),
          error: null,
        }),
      );
    }) as unknown as typeof fetch;

    const outcome = await importFromFile({ inputPath: path, fetchImpl });
    expect(outcome.result.created).toBe(count);
    expect(addCalls).toBe(1);
    expect(posted).toHaveLength(count);
    expect(posted[0]!.fields.Front).toBe("Question 1");
    expect(posted[count - 1]!.fields.Back).toBe(`Answer ${count}`);
  });
});
