/**
 * Plugin registry — the single place where import/export/validate/
 * transform plugins are registered and looked up.
 */

import type { Readable } from "node:stream";
import { parseYaml, parseJson, parseCsv, parseMarkdown } from "@anki-xml/parser";
import type { NoteValidationError, ParsedNote } from "@anki-xml/utils";
import type {
  ExporterPlugin,
  ImportPlugin,
  TransformerPlugin,
  ValidatorPlugin,
} from "./types.ts";

const importers = new Map<string, ImportPlugin>();
const exporters = new Map<string, ExporterPlugin>();
const validators = new Map<string, ValidatorPlugin>();
const transformers = new Map<string, TransformerPlugin>();

/** Build an importer that reads the whole stream, then parses the text. */
function textImporter(
  name: string,
  exts: string[],
  parse: (source: string) => { notes: ParsedNote[]; defaultDeck: string },
): ImportPlugin {
  return {
    name,
    supports: (ext: string): boolean => exts.includes(ext.toLowerCase()),
    async *parse(input: Readable): AsyncIterable<ParsedNote> {
      let source = "";
      for await (const chunk of input) {
        source += typeof chunk === "string" ? chunk : chunk.toString("utf8");
      }
      yield* parse(source).notes;
    },
  };
}

export const YAML_IMPORTER = textImporter("yaml", [".yaml", ".yml"], parseYaml);
export const JSON_IMPORTER = textImporter("json", [".json"], parseJson);
export const CSV_IMPORTER = textImporter("csv", [".csv"], parseCsv);
export const MARKDOWN_IMPORTER = textImporter("markdown", [".md", ".markdown"], parseMarkdown);

export function registerImporter(plugin: ImportPlugin): void {
  importers.set(plugin.name, plugin);
}

export function registerExporter(plugin: ExporterPlugin): void {
  exporters.set(plugin.name, plugin);
}

export function registerValidator(plugin: ValidatorPlugin): void {
  validators.set(plugin.name, plugin);
}

export function registerTransformer(plugin: TransformerPlugin): void {
  transformers.set(plugin.name, plugin);
}

/** Resolve an importer by file extension (e.g. ".xml", "xml", "cards.yml"). */
export function getImporterFor(filePath: string): ImportPlugin | undefined {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return undefined;
  const ext = filePath.slice(dot).toLowerCase();
  for (const plugin of importers.values()) {
    if (plugin.supports(ext)) return plugin;
  }
  return undefined;
}

export function listImporters(): ImportPlugin[] {
  return [...importers.values()];
}

export function listExporters(): ExporterPlugin[] {
  return [...exporters.values()];
}

export function listValidators(): ValidatorPlugin[] {
  return [...validators.values()];
}

export function listTransformers(): TransformerPlugin[] {
  return [...transformers.values()];
}

/** Apply all registered transformers to a parsed note. */
export function applyTransformers(note: ParsedNote): ParsedNote {
  let out = note;
  for (const t of transformers.values()) out = t.transform(out);
  return out;
}

/** Run all registered validator plugins against a parsed note. */
export function runValidatorPlugins(note: ParsedNote): NoteValidationError[] {
  const errors: NoteValidationError[] = [];
  for (const v of validators.values()) errors.push(...v.validate(note));
  return errors;
}

import { XmlImportPlugin } from "./xml-plugin.ts";
import { JsonExporterPlugin } from "./exporter-json.ts";

// Built-in importers + exporters are registered at module load.
registerImporter(new XmlImportPlugin());
registerImporter(YAML_IMPORTER);
registerImporter(JSON_IMPORTER);
registerImporter(CSV_IMPORTER);
registerImporter(MARKDOWN_IMPORTER);
registerExporter(JsonExporterPlugin);
