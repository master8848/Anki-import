# Plugin system

Extension points for the import pipeline, living in
`packages/core/src/plugins/` (`types.ts`, `registry.ts`,
`xml-plugin.ts`, `exporter-json.ts`). XML stays canonical; plugins map
other formats onto the same in-memory note model, or add rules and
rewrites around it.

## The four registrations

```ts
export function registerImporter(plugin: ImportPlugin): void;
export function registerExporter(plugin: ExporterPlugin): void;
export function registerValidator(plugin: ValidatorPlugin): void;
export function registerTransformer(plugin: TransformerPlugin): void;
```

Each registry is a `Map<name, plugin>`; registering twice under the same
name replaces the previous plugin.

## Plugin interfaces (real signatures)

```ts
import type { Readable } from "node:stream";
import type { ParsedNote, NoteValidationError, ValidatedNote } from "@anki-xml/utils";

/** Parses an input stream into notes. `supports` matches file extensions. */
export interface ImportPlugin {
  name: string;
  supports(ext: string): boolean;
  parse(input: Readable): AsyncIterable<ParsedNote>;
}

/** Serializes validated notes to a format string. */
export interface ExporterPlugin {
  name: string;
  supports(format: string): boolean;
  export(notes: ValidatedNote[]): string;
}

/** Extra per-note rules run after built-in validation. */
export interface ValidatorPlugin {
  name: string;
  validate(note: ParsedNote): NoteValidationError[];
}

/** Rewrites parsed notes before validation. */
export interface TransformerPlugin {
  name: string;
  transform(note: ParsedNote): ParsedNote;
}
```

## Built-ins

Registered at module load (`registry.ts` bottom):

- **Importers**: `XmlImportPlugin` (name `"xml"`, supports `.xml`, uses
  the streaming `parseXmlStream`), `YAML_IMPORTER` (`.yaml`, `.yml`),
  `JSON_IMPORTER` (`.json`), `CSV_IMPORTER` (`.csv`),
  `MARKDOWN_IMPORTER` (`.md`, `.markdown`). The text importers read the
  whole stream and delegate to the parser package's `parseYaml` /
  `parseJson` / `parseCsv` / `parseMarkdown`.
- **Exporters**: `JsonExporterPlugin` (name `"json"`) serializes
  `ValidatedNote[]` to `{ notes: [{number, id?, deck, model, tags,
  fields}] }`. Export is read-only serialization for tools and agents;
  XML remains canonical for input.

Lookup helpers: `getImporterFor(filePath)` resolves by file extension
(uses `plugin.supports(ext)`), and `listImporters` / `listExporters` /
`listValidators` / `listTransformers` return the registered plugins.

## How the pipeline uses them

In `importFromFile` (`core/src/importer/import.ts`):

1. **Importer resolution** — `getImporterFor(inputPath)` picks the
   plugin by extension; unregistered extensions fail with "Unsupported
   file format: …".
2. **XML fast path** — the built-in `xml` plugin keeps its streaming
   path (`--stream`); other formats go through `plugin.parse()`.
3. **Transformers** — `applyTransformers(note)` runs every registered
   transformer in registration order over each parsed note **before
   validation** (both the streaming path and the non-streaming path).
4. **Validation** — built-in `validateNote`/`validateNotes` runs first,
   then `runValidatorPlugins(note)` appends validator-plugin errors
   (streaming path validates per note; the full path uses
   `validateWithPlugins`). Any error aborts the mutation.
5. **Apply** — `import` creates notes only; `sync` (via `planFile` +
   `applyPlan`) also updates.

`planFile` (`core/src/plan.ts`) applies transformers the same way
before validation, so plan/diff/import/sync all agree on transformed
notes.

## Example: register a YAML importer + a cloze transformer

The YAML importer is built in — this shows the shape of a custom one,
plus a transformer that rewrites notes before validation:

```ts
import { Readable } from "node:stream";
import {
  registerImporter,
  registerTransformer,
  type ImportPlugin,
  type TransformerPlugin,
} from "@anki-xml/core";
import { parseYaml } from "@anki-xml/parser";
import type { ParsedNote } from "@anki-xml/utils";

// Custom importer for a dialect that only differs in tag splitting.
registerImporter({
  name: "yaml-semicolon-tags",
  supports: (ext: string) => ext === ".yaml" || ext === ".yml",
  async *parse(input: Readable): AsyncIterable<ParsedNote> {
    let source = "";
    for await (const chunk of input) {
      source += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    }
    const { notes } = parseYaml(source);
    for (const note of notes) {
      note.tags = note.tags.replaceAll(";", " ");
      yield note;
    }
  },
});

// Transformer: auto-wrap bare text fields as cloze deletions.
const clozeTransformer: TransformerPlugin = {
  name: "cloze-first-deletion",
  transform(note: ParsedNote): ParsedNote {
    if (note.type !== "Cloze") return note;
    const text = note.fields.find((f) => f.name === "text");
    if (text && !/\{\{c\d+::/.test(text.html)) {
      text.html = `{{c1::${text.html}}}`;
    }
    return note;
  },
};
registerTransformer(clozeTransformer);
```

Registering the importer under the same `.yaml`/`.yml` extensions
**replaces** the built-in YAML importer in the registry (the map is
keyed by name; resolution iterates registered importers and asks
`supports`). Registering `name: "yaml"` would replace the built-in by
name.

## Loading plugins from config

Plugin loading from a config file is a **future hook** — today the
registry is programmatic only: plugins must be registered in code
(module load) before `importFromFile` / `planFile` are called. There is
no `plugins:` key in `anki.config.{json,yaml,yml}` (config keys today:
`deck`, `model`, `url`). A future version may load user plugins from
config or a plugins directory; the registry API is already the stable
contract for that.
