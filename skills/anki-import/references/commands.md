# Commands quick reference

`anki-xml` ships 34 commands. This is the agent-facing index.
Run `anki-xml <command> --help` for the full flag list.

## Discover (read-only schema)

```bash
anki-xml models                  # every note model + fields + templates
anki-xml fields <model>          # field names for one model
anki-xml tags                    # every tag with note counts
anki-xml decks                   # deck tree with card counts
```

## Inspect (read-only)

```bash
anki-xml search "<phrase>" --deck "Spanish" --limit 5
anki-xml search --query "deck:Spanish is:review"
anki-xml note-info <id>          # full fields + tags + cards + model
anki-xml sample 5 --seed 42      # deterministic random sample
anki-xml preview --query "deck:Spanish"   # open Anki's browser
anki-xml stats --field Front --top 10    # cardinality by field
anki-xml export "deck:Spanish" out.xml    # round-trip XML
```

## Validate (no mutation)

```bash
anki-xml validate ./cards.xml             # structural, offline
anki-xml validate ./cards.xml --strict    # warnings → errors
anki-xml schema-validate ./cards.xml      # + live collection schema
anki-xml plan ./cards.xml                 # preflight: duplicates + schema
anki-xml plan ./cards.xml --no-preflight  # offline plan
anki-xml diff ./cards.xml                 # file vs. live collection
anki-xml doctor                           # connectivity + add-ons
anki-xml addon check                      # just the add-on portion
```

## Write (mutate)

```bash
# Create
anki-xml import ./cards.xml
anki-xml import ./cards.xml --dry-run
anki-xml import ./cards.xml --no-auto-create-deck
anki-xml import ./cards.xml --allow-duplicate

# Update
anki-xml update --id <id> --field Front="x" --field Back="y"
anki-xml update --id <id> --tags "a b" --add-tags "c" --remove-tags "d"
anki-xml update --file ./updates.xml
anki-xml update --ids "1,2,3" --file ./updates.xml   # mapped by position
anki-xml update --rename-field Fron=Front --ids 1,2,3

# Tag / untag
anki-xml tag --ids 1,2,3 reading
anki-xml untag --query "deck:Tmp tag:scratch" scratch

# Delete / move / suspend
anki-xml delete --ids 1,2,3 --cards-too --yes
anki-xml delete --query "deck:Tmp tag:scratch" --yes
anki-xml rename-deck "Old" "New"
anki-xml delete-deck "Tmp" --yes --cards-too
anki-xml move-notes "Languages::Verbs" --ids 1,2,3
anki-xml suspend --ids 1,2,3
anki-xml unsuspend --ids 1,2,3
anki-xml bury --ids 1,2,3

# Reconcile
anki-xml sync ./cards.xml --yes
anki-xml sync ./cards.xml --json --dry-run
```

## Schema discovery during dev

```bash
anki-xml migrate assign-guids ./cards.xml   # add <note id="..."> for stable diffs
anki-xml migrate v1-to-v2 ./cards.xml --out ./cards-v2.xml
```

## Lifecycle

```bash
anki-xml addon list
anki-xml addon install 1610307553      # MathJax
anki-xml addon enable  1610307553
anki-xml addon disable 1610307553

anki-xml profile add work http://10.0.0.42:8765
anki-xml profile list
anki-xml --profile work doctor
```

## Recovery

```bash
anki-xml checkpoint create pre-batch --ids 1,2,3
anki-xml checkpoint list
anki-xml checkpoint show pre-batch
anki-xml checkpoint delete pre-batch

anki-xml rollback --to pre-batch --dry-run
anki-xml rollback --to pre-batch

anki-xml audit-log
anki-xml audit-log --limit 100 --json
anki-xml audit-log --command import
```

## Exit codes

| code | meaning |
|---|---|
| 0 | success — every operation completed |
| 1 | partial failure (some succeeded, some failed) |
| 2 | fatal — file unreadable, malformed XML, no AnkiConnect, etc. |

## Global flags

```text
--url <url>             AnkiConnect endpoint (default http://127.0.0.1:8765)
--json                  Emit v1 JSON envelope
--json-legacy           Emit raw payload (skip envelope)
--format <ndjson>       Stream one record per line
--dry-run               Validate; never mutate
--quiet                 Summary only; no per-op detail
--no-color              Strip ANSI color
--profile <name>        Use a named URL profile
--config <path>         Use a custom config file
--batch-id <id>         Wrap writes in a named atomic batch
--rollback-on-partial   Auto-rollback the batch on any failure
--idempotency-key <k>   Skip if this key already succeeded
--resume-from <name>    Skip notes already in this checkpoint
--help, -h              Show help
--version, -v           Print version
```
