# Security Policy

## Reporting a vulnerability

Please open a private security advisory at:
<https://github.com/master8848/Anki-import/security/advisories/new>

Do not file a public issue. Give us 7 days to respond before going
public.

## Threat model

`anki-xml` talks to AnkiConnect over HTTP. The threat model is:

- **Local-only by default.** The default `http://127.0.0.1:8765`
  binds AnkiConnect; the CLI cannot reach across the network
  unless pointed elsewhere with `--url`.
- **No credentials handled.** The CLI doesn't authenticate against
  Anki. Anything you can do via AnkiConnect, anyone on the local
  host can do.
- **XML files are untrusted input.** Every entry point parses XML
  from disk. The parser is strict (illegal `&`, illegal `<`, etc.
  rejected) and never executes the XML — there is no `eval`, no
  code injection vector.

## Update posture

- All write commands support `--dry-run`. Always dry-run first.
- All write commands write to `~/.local/share/anki-xml/audit.log`.
  Audit entries are JSONL, one event per line.
- Backups: `checkpoint` writes a JSON snapshot you can replay via
  `rollback --to`.
