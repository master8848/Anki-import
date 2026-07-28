# Commands

The `anki-xml` CLI has five commands. All commands accept the common
flags `--url <url>` (default `http://127.0.0.1:8765`) and `--json`
(where supported).

## `import <file>`

Create Anki notes from an XML file. This is the only command that
*writes* to Anki by default.

```bash
anki-xml import ./cards.xml
anki-xml import ./cards.xml --dry-run             # validate, don't send
anki-xml import ./cards.xml --no-auto-create-deck # fail if a deck is missing
```

See [`cli.md`](./cli.md) for full details. Bulk operations are atomic:
if any note is invalid, no notes are sent.

## `decks`

List every deck and subdeck with its card count (own + descendant
totals). Useful for AI to understand the structure of a collection
before generating or updating content.

```bash
anki-xml decks                 # human-readable tree
anki-xml decks --json          # flat list as JSON
```

Human output:

```
3 decks, 47 total cards

Languages  —  47 cards
  Languages::Spanish  —  25 cards (10 direct)  [#1234567890123]
  Languages::French   —  22 cards (8 direct)
  Languages::German   —  14 cards (6 direct)
```

`--json` output is a flat array of `{name, totalCards, ownCards, id?}`.

## `stats`

Count cards by Anki scheduler state. The mapping is:

- `new` + `learn` = **incomplete** (not yet graduated)
- `review` = **completed** (graduated into the review queue)
- `suspended` / `buried` = paused by user or scheduler

```bash
anki-xml stats                          # whole collection
anki-xml stats --deck "Languages::Spanish"   # one deck
anki-xml stats --json                   # machine-readable
```

Human output:

```
Collection
  Cards: 116
    new:       10
    learn:      3
    review:    100
    suspended:  2
    buried:     0
  Completed (review):    100
  Incomplete (new+learn): 13
  Notes: 80
```

Note: `--deck` uses Anki's own `deck:` search operator. Anki treats
`Languages::Spanish` as a prefix, so the count *includes* any
subdecks unless you also add `"-subdeck"` to the search. The current
CLI does not auto-include children, so pass the exact full name.

## `search <phrase>`

Full-text search across all notes. Uses Anki's own search engine
(so it understands HTML stripping, case-insensitivity, and Anki
operators like `is:new`, `tag:`, `deck:`). The phrase is quoted
for substring matching.

```bash
anki-xml search "serendipity"                    # phrase in any field
anki-xml search "hola" --deck "Spanish"          # within a deck
anki-xml search "hola" --tag "greeting" --tag "common"  # multiple tags
anki-xml search --query "deck:Spanish is:review" # raw Anki query
anki-xml search "x" --limit 50 --json            # cap results, JSON output
```

Each result includes:

- `noteId` — use this with `update --id`
- `cards` — Anki's card ids (a note generates 1..N cards)
- `modelName` and `tags`
- `snippet` and `snippetField` — the first matching field, truncated
- `plainText` — every field, HTML stripped, prefixed with `[FieldName]`

Human output:

```
2 matches:

Note 1234567890  (Basic)  [greeting spanish]
  cards: #1500000000001, #1500000000002
  Hola  (in Front)

Note 1234567891  (Basic)
  cards: #1500000000003
  Adios  (in Front)
```

## `update`

Change the fields of existing notes. Three input modes:

### Single note from the command line

```bash
anki-xml update --id 1234567890 --field Front="new Q" --field Back="new A"
```

You can pass multiple `--field Name=value` flags. Field names are
the Anki **display** names (`Front`, `Back`, `Text`, `Extra`).

### Multiple notes from one XML file

Each `<note>` carries its own `id="..."` attribute:

```xml
<anki>
  <note id="1234567890" type="Basic">
    <front>updated Q 1</front>
    <back>updated A 1</back>
  </note>
  <note id="1234567891" type="Basic">
    <front>updated Q 2</front>
    <back>updated A 2</back>
  </note>
</anki>
```

```bash
anki-xml update --file ./updates.xml
anki-xml update --file ./updates.xml --dry-run
```

### Multiple notes mapped from `--ids`

```bash
anki-xml update --ids "1,2,3" --file ./updates.xml
```

The first `<note>` in `updates.xml` is applied to id 1, the second to
id 2, etc. The counts must match — if they don't, the command exits
without contacting Anki.

### Update semantics

- Only the fields you name are changed. Unnamed fields keep their
  current Anki content.
- Tags are NOT touched. (A future `--tags` flag may add this.)
- The model of an existing note is NOT changed.
- The deck of an existing note is NOT changed.
- If one update fails (e.g. wrong field name), the others still run.
  Failures are listed at the end with the note id and the reason.

### Common workflow with `search`

```bash
# 1. Find a note
$ anki-xml search "hola" --json | jq '.[0].noteId'
1234567890

# 2. Edit it
$ anki-xml update --id 1234567890 --field Front="Hola, ¿qué tal?"
```

## Exit codes

All commands use the same three exit codes:

| code | meaning                                                      |
|------|--------------------------------------------------------------|
| `0`  | success — every operation completed cleanly                  |
| `1`  | partial failure (some updates/rejections, some succeeded)   |
| `2`  | fatal — file unreadable, malformed XML, no AnkiConnect, etc. |
