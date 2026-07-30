# anki-import (`anki-xml`)

Import Anki notes from XML using AnkiConnect.

**Current release: `0.0.3`**

XML is the canonical card format. JSON is used only for output and checkpoints.

## Install

```bash
npm install -g anki-xml@0.0.3
# or
npx anki-xml@0.0.3 doctor
```

Bins: `anki-import` and `anki-xml`. Requires **Node 20+**.

Contributor setup (from source): see [CONTRIBUTING.md](CONTRIBUTING.md).

## Quick start

Workflow: doctor → validate → import → rollback.

```bash
anki-import doctor
anki-import validate cards.xml
anki-import import cards.xml --dry-run
anki-import import cards.xml --stream
```

```xml
<anki deck="Spanish">
  <note type="Basic">
    <field name="Front">Hola</field>
    <field name="Back">Hello</field>
  </note>
</anki>
```

Run `anki-import --help` for commands and flags.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## License

MIT
