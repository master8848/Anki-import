# anki-import (`anki-xml`)

XML-first CLI for importing Anki flashcards via [AnkiConnect](https://foosoft.net/projects/anki-connect/).

**Current release: `0.0.3`**

XML is the source of truth. JSON is used only for logs, diagnostics, and checkpoints.

## Install

```bash
npm install -g anki-xml@0.0.3
# or
npx anki-xml@0.0.3 doctor
```

Bins: `anki-import` and `anki-xml`.

### From source (contributors)

```bash
pnpm install
pnpm build
node dist/cli.js doctor
```

Requires **Node 20+** and **pnpm 10+**. Package installs enforce a 14-day minimum release age.

## Quick start

```bash
anki-import doctor
anki-import validate cards.xml
anki-import import cards.xml --dry-run
anki-import import cards.xml --stream --batch-size 500
```

## XML example

```xml
<anki version="1">
  <deck name="Spanish">
    <note type="Basic">
      <field name="Front"><![CDATA[<h1>Hola</h1>]]></field>
      <field name="Back"><![CDATA[Hello]]></field>
      <tag>language</tag>
    </note>
  </deck>
</anki>
```

Legacy short tags (`<front>`, `<back>`) still work.

## Commands

| Command | Purpose |
|---|---|
| `doctor` | Environment check |
| `validate <file>` | Local XML validation |
| `import <file>` | Import to Anki |
| `checkpoint list` | List checkpoints |
| `rollback <id>` | Undo an import |
| `benchmark <file>` | Throughput report |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for `0.0.3` release notes.

## License

MIT
