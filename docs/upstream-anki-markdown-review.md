# Review of `terkelg/anki-markdown`

This is a research snapshot of the public
[`terkelg/anki-markdown` issue tracker](https://github.com/terkelg/anki-markdown/issues)
and repository. It answers two different questions:

1. What has the upstream Markdown **reviewer/editor add-on** implemented?
2. Which reports should influence this XML **bulk importer**?

The projects are complementary, not interchangeable. `anki-markdown` owns an
Anki note type, editor behavior, Markdown rendering, Shiki highlighting, and
reviewer CSS. `anki-xml` currently creates Anki's five built-in note types and
transports field HTML through AnkiConnect. It does not render Markdown or alter
Anki's editor/reviewer.

## Review scope

The API snapshot contained 48 tracker entries through #48:

- **17 issues** (all reviewed below)
- **31 pull requests**

Upstream source was inspected at commit
[`cb7946955ed20917b1467beb2181e36291dbdcf3`](https://github.com/terkelg/anki-markdown/commit/cb7946955ed20917b1467beb2181e36291dbdcf3)
(`fix: preserve raw template field text (#44)`). Statuses below are a snapshot,
not a promise that the live tracker has not changed.

## What upstream has implemented

At the reviewed commit, upstream includes:

- Markdown rendering through `markdown-exit`, plus `markdown-it-mark` and
  GitHub-style alerts.
- Shiki code highlighting with configurable downloaded language/theme modules,
  separate light/dark themes, plain-text fallback, line/word highlighting,
  focus annotations, warning/error annotations, inline `` `code`{lang} ``, a
  reveal action, and a copy action.
- `Anki Markdown` and `Anki Markdown Cloze` note types. The Cloze implementation
  handles repeated ordinals, nested markers, hints, a custom `blur` hint, and
  comma-separated ordinals in its renderer.
- Plain-text Anki editor fields, HTML auto-close disabled, rich-input/image
  controls hidden where they conflict, and CodeMirror highlighting currently
  set to `mode: "null"`.
- Progressive rendering while Shiki modules load, mobile media sync, dark-mode
  normalization, responsive card styling, and an optional cardless mode.
- A small on-save HTML-to-Markdown converter for images, bold, italic, and
  `<br>`. It is not a collection-wide migration tool.
- An AnkiConnect-oriented AI agent skill and a kitchen-sink `.apkg` fixture.

Important renderer boundary: upstream allows only `img`, `a`, `b`, `i`, `em`,
`strong`, `br`, and `kbd` raw HTML tags in Markdown output. Other raw HTML is
stripped by its renderer.

## Every upstream issue

| Issue | Snapshot | What upstream does | Relevance to `anki-xml` |
|---|---|---|---|
| [#4 User-configurable languages and color schemes](https://github.com/terkelg/anki-markdown/issues/4) | Closed | Implemented by PR #5: settings UI, per-language/theme downloads, JavaScript regex engine, and media sync. | Renderer feature. Keep out of the built-in-model importer; revisit with custom note types. |
| [#9 Editor fields shrink/disappear](https://github.com/terkelg/anki-markdown/issues/9) | Closed | Editor CSS/plain-text visibility was repaired; existing and newly created fields are marked `plainText`. | No editor webview exists here. AnkiConnect-created values are covered by payload tests instead. |
| [#10 Anki auto-closes tags inside code](https://github.com/terkelg/anki-markdown/issues/10) | Closed | Markdown editor activation disables `setCloseHTMLTags`; upstream also explored preserving encoded tags through decode/render. | Directly relevant to generated XML. Tests cover entity-escaped code and CDATA code-looking text without invented closing tags. |
| [#11 Card margins/container](https://github.com/terkelg/anki-markdown/issues/11) | Closed | Responsive styling, dark-mode fixes, and cardless configuration were added. | Reviewer/template styling is not owned by this importer. |
| [#12 Rendering resets session/local storage](https://github.com/terkelg/anki-markdown/issues/12) | Closed | Renderer now updates designated field containers rather than replacing the whole document. | The importer preserves nested scripts verbatim, but whether scripts/storage run is controlled by Anki's reviewer and card template. |
| [#19 Scrolling issues](https://github.com/terkelg/anki-markdown/issues/19) | Closed | Reviewer overflow/overscroll CSS was changed; mobile code scrolling is documented. | CSS/UI-only. Long content is preserved, but this CLI cannot guarantee reviewer scrolling. |
| [#23 Markdown syntax highlighting in editor](https://github.com/terkelg/anki-markdown/issues/23) | Open | Not implemented. Current code forces CodeMirror mode to `null`; the issue proposes vendoring CM5 GFM mode. | No editor integration. |
| [#27 Live Markdown preview](https://github.com/terkelg/anki-markdown/issues/27) | Open | Not on main; exploration exists in open PR #24/branches. | No editor integration. A CLI HTML preview could be a separate future feature. |
| [#28 Migrate to markdown-exit](https://github.com/terkelg/anki-markdown/issues/28) | Closed | Implemented in commit `6306e8a`; current `render.ts` uses `createMarkdownExit`. | Do not copy the dependency unless this project intentionally adds Markdown rendering. |
| [#33 Cloze support](https://github.com/terkelg/anki-markdown/issues/33) | Closed | Implemented by PR #35 with dedicated templates/parser/styles and tests for code-rich clozes. | Directly relevant. This project targets built-in `Cloze`, preserves code/markers, and validates the field before import. It does not use upstream's custom blur renderer. |
| [#34 Bulk-convert HTML cards to Markdown](https://github.com/terkelg/anki-markdown/issues/34) | Open | Only a small on-save `html_to_markdown()` converter exists; there is no bulk preview/migration action. | This importer accepts HTML as input but cannot read/update an existing collection. Migration belongs in future work. |
| [#36 Document comma-separated Cloze ordinals](https://github.com/terkelg/anki-markdown/issues/36) | Open | Renderer parser supports `{{c1,2::text}}`; upstream docs intentionally wait for a released Anki version that creates those cards correctly. | Accepted and documented here with a version warning. Malformed comma lists are rejected. |
| [#39 Markdown rendering for type-in answers](https://github.com/terkelg/anki-markdown/issues/39) | Open | Not on main; open PR #40 proposes support. | This project already creates built-in `Basic (type in the answer)` notes with HTML fields, but that is not upstream Markdown type-in support. |
| [#42 Shortcuts/buttons disabled](https://github.com/terkelg/anki-markdown/issues/42) | Open | Still unresolved. Upstream intentionally disables HTML-oriented UI and may have disabled Cloze controls as a side effect. | AnkiConnect imports do not use editor buttons or shortcuts. AI should emit complete Cloze markers itself. |
| [#43 List rendering incorrect](https://github.com/terkelg/anki-markdown/issues/43) | Closed | PRs #44/#45 changed templates to carry raw field text in `text/plain` scripts and preserve indentation. | Directly relevant. Raw field slicing and regression tests preserve ordered/nested-list indentation. Built-in models require HTML lists for rendered list structure. |
| [#46 Template displays “Default”](https://github.com/terkelg/anki-markdown/issues/46) | Open | Existing basic template is created with the name `Default`; no main-branch fix was present. | Anki UI metadata only; no effect on imported field values. |
| [#48 `<br>` in table not working](https://github.com/terkelg/anki-markdown/issues/48) | Open | Raw `<br>` is allow-listed, but the table interaction remains open. | Directly relevant at transport level. Tests and `examples/issue-cases.xml` prove `<table>` and both `<br>`/`<br/>` survive unchanged; final rendering is Anki/template-owned. |

## Pull requests that materially explain the issue history

The issue page interleaves pull requests with issues. These are the high-signal
ones for this review:

- #1 inline code highlighting
- #2 code toolbar/copy/reveal
- #3 GitHub alerts
- #5 configurable Shiki languages/themes (closes #4)
- #6 disable HTML auto-close
- #13 disable conflicting editor settings
- #14 restore plain-text editor visibility
- #15 responsive/customizable card layout
- #16 progressive Shiki rendering
- #20 overscroll behavior
- #22 disable CodeMirror HTML highlighting
- #24 live preview (open)
- #25 image-drop editor handling
- #29 AI/Anki skill
- #35 Cloze support (closes #33)
- #40 type-in support (open)
- #41 AnkiWeb light-mode fix
- #44 raw template field transport
- #45 indentation preservation
- #47 direct image paste (open)

## What was converted into local tests

[`tests/upstream-regressions.test.ts`](../tests/upstream-regressions.test.ts)
contains executable coverage for the cross-project cases:

- strict rejection of malformed AI-authored XML;
- HTML-looking strings inside code (#10);
- script/storage source preservation (#12);
- code-rich, nested, repeated, hinted, and comma-ordinal Cloze notes (#33/#36);
- rich built-in type-in prompts (#39);
- raw indentation and nested lists (#43/#44/#45);
- `<br>` inside tables (#48);
- links, attribute entities, media references, split CDATA terminators; and
- a 250-note ordered bulk request.

[`examples/issue-cases.xml`](../examples/issue-cases.xml) is the human-readable,
importable counterpart to those tests.

UI-only cases are not represented by fake XML tests. A test asserting that XML
changes card margins, scrolling, editor controls, preview panes, theme choices,
or template labels would be misleading because this process never owns those
surfaces.

## Main design conclusion

Do not silently turn `anki-xml` into `anki-markdown`.

For current built-in note types, generate **HTML field content** and use XML
CDATA only for literal text. If future custom-model support targets upstream's
`Anki Markdown` models, add an explicit source mode/model mapping so Markdown is
transported as Markdown without applying the current CDATA-to-HTML escape rules
by accident. That work is tracked separately in
[`FUTURE_FEATURES.md`](../FUTURE_FEATURES.md).
