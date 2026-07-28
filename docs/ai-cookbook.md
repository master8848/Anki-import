# AI cookbook (recipes for agent loops)

This document extends [`xml-cookbook.md`](./xml-cookbook.md) with patterns
specifically aimed at AI agents writing in a loop. It assumes the agent
shell with `anki-xml` in `$PATH` and Anki running with AnkiConnect.

## The five-loop pattern

Most AI authoring situations follow the same five-loop shape:

```bash
# 1. Generate content (the agent's job).
draft=$(cat <<'EOF'
<anki version="1" deck="AI Import::Spanish">
  <note type="Basic" tags="greetings">
    <front>Hola</front>
    <back>Hello</back>
  </note>
  <note type="Basic" tags="greetings">
    <front>Adiós</front>
    <back>Goodbye</back>
  </note>
</anki>
EOF
)

# 2. Validate before sending. Fastest feedback loop.
echo "$draft" > /tmp/draft.xml
if ! anki-xml validate /tmp/draft.xml --json --quiet; then
  # 3. On failure, read the structured errors and fix the draft.
  anki-xml validate /tmp/draft.xml --json-legacy | jq '.errors[]'
  exit 1
fi

# 4. Dry-run to confirm AnkiConnect will accept the batch.
anki-xml import /tmp/draft.xml --dry-run --json --quiet

# 5. Commit (only after the dry-run succeeded).
anki-xml import /tmp/draft.xml --json --quiet
```

The `--json --quiet` pairing is the agent's favorite: machine-readable,
silent on success, and exit-code only on failure.

## Read the envelope

Every command's `--json` output is wrapped in the v1 envelope:

```json
{
  "version": 1,
  "command": "validate",
  "ok": true,
  "args": { "file": "/tmp/draft.xml" },
  "data": {
    "valid": true,
    "noteCount": 2,
    "errors": [],
    "warnings": [],
    "decks": ["AI Import::Spanish"]
  },
  "meta": { "duration_ms": 4, "timestamp": "2024-...", "version": "0.1.0" }
}
```

Pattern-match on `version` first, then on `command`, then on `data`.
Failure shapes have `ok: false` and an `error` object:

```json
{
  "version": 1,
  "command": "import",
  "ok": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation errors: 1 note(s) failed",
    "details": { "errors": [...] }
  }
}
```

Use `--json-legacy` for the raw payload if you want to skip the
envelope (e.g. feeding straight into `jq`):

```bash
anki-xml validate /tmp/draft.xml --json-legacy | jq '.errors[]'
```

## Switch on error codes

Don't grep `message`. Use `error.code` for stable branching:

```bash
result=$(anki-xml import /tmp/draft.xml --json)
code=$(echo "$result" | jq -r '.error.code // empty')
case "$code" in
  VALIDATION_ERROR)  echo "fix the XML and retry" ;;
  ANKICONNECT_ERROR) echo "Anki isn't reachable; check Anki + AnkiConnect" ;;
  FILE_NOT_FOUND)    echo "the file path is wrong" ;;
  *)                 echo "unknown error code: $code" ;;
esac
```

The full code list is in [`ai-integration.md`](./ai-integration.md).

## Iterate on a single note

When one note is wrong, isolate it before re-running the whole file:

```bash
# Pull the failing note number from the previous error.
anki-xml validate /tmp/draft.xml --json | jq '.data.errors[0].noteNumber'
# -> 2

# Save just the first note into a new file for inspection.
csplit -z -f /tmp/note- /tmp/draft.xml '/<note>/' '/<\/note>/' '{*}' 2>/dev/null
anki-xml validate /tmp/note-02.xml --json --quiet
```

## The find-and-update pipeline

Search → batch update is a two-step pipeline:

```bash
# Find all notes mentioning "serendipity" in the English deck.
ids=$(anki-xml search "serendipity" --deck "English" --json --json-legacy \
  | jq -r '.hits[].noteId' | paste -sd,)

# If the search returned nothing, abort.
if [ -z "$ids" ]; then
  echo "no matches; nothing to update"
  exit 0
fi

# Update them all in one shot.
anki-xml update --ids "$ids" --field Extra="see also: <i>happy chance</i>"
```

The pipeline is the model for any "act on the result of a query"
pattern. The same plumbing works for `tag` (Phase 4) and `delete`
(Phase 4) commands.

## Stream large result sets

For very large collections, `--limit` on `search` caps the number of
notes returned. Pair with paging if you write your own loop:

```bash
# Iterate over matches in chunks of 100.
offset=0
while :; do
  ids=$(anki-xml search "phrase" --limit 100 --json --json-legacy \
        | jq -r --argjson off "$offset" '.hits[$off:].noteId' | paste -sd,)
  [ -z "$ids" ] && break
  anki-xml update --ids "$ids" --field Foo="bar"
  offset=$((offset + 100))
done
```

Phase 3 commits a dedicated `stream` flag (`--format ndjson`) for
one-record-per-line output. Until then, the `--json` envelope is the
canonical machine format.

## Composable commands

Every command is a black box that takes JSON in (via `--json-legacy`)
and emits JSON out (via `--json`). Pipeline them:

```bash
# Make a backup of all notes in a deck, then audit their tags.
anki-xml search "" --deck "Spanish" --json --json-legacy \
  | jq '[.hits[] | {noteId, tags}]' > /tmp/audit.json

# Validate the audit file (it's not XML, so this just confirms jq didn't lose data).
jq -r '.[] | .noteId' /tmp/audit.json | wc -l
```

## Stable retries

`import` is atomic at the validation boundary but per-note failures
(bad field content, AnkiConnect rejection) are returned in the
envelope. To handle transient failures:

```bash
# Retry up to 3 times with exponential backoff.
attempt=0
while [ $attempt -lt 3 ]; do
  if anki-xml import /tmp/draft.xml --json --quiet; then
    break
  fi
  attempt=$((attempt + 1))
  sleep $((2 ** attempt))
done
```

## Don't do this

- Don't loop `import` over individual notes. The CLI is designed for
  batched input; per-note imports serialize badly.
- Don't read `error.message` to switch on. Use `error.code`.
- Don't pipe the JSON envelope into `jq` without first calling
  `--json-legacy` (or `.data` first). The envelope is great for
  agents, awkward for `jq` pipelines.
- Don't pass `--allow-duplicate` blindly. It exists for the rare
  re-import case where you genuinely want a duplicate; the default
  is to reject duplicates so a corrected second run doesn't collide
  with notes created by a partially successful first run.
