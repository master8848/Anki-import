# JavaScript API reference

The public API surface, per package. Signatures are copied from the
source (`packages/<pkg>/src/index.ts` and the files it re-exports) and
are accurate for v0.0.4. Types come from `@anki-xml/utils` unless noted.

All packages are ESM and export `.ts`-style named exports from their
`src/index.ts`.

---

## `@anki-xml/utils` (no dependencies)

Shared in-memory types and helpers. "XML remains the canonical
interchange format; these types are in-memory only."

**Types** (`types.ts`):

```ts
export type SupportedModel = string;          // "Supported Anki note type name (built-in or custom)"
export type XmlFieldName = string;            // XML field tag or normalized field key
export type LogLevel = "error" | "warn" | "info" | "debug";

export interface ParsedField {
  name: XmlFieldName;
  displayName?: string;        // Anki display name when provided via <field name="...">
  html: string;                // raw HTML; entities never decoded
}

export interface ParsedNote {
  number: number;              // 1-based index across the document
  id?: number;                 // optional positive Anki note id (update target)
  type: string;
  deck: string;
  tags: string;                // whitespace-separated
  fields: ParsedField[];
  sourceOffset?: number;
  fieldSourceOffsets?: number[];
  unknownElements?: string[];
  line?: number;               // 1-based line of the <note> start tag
}

export interface NoteValidationError {
  noteNumber: number;
  message: string;
  line?: number;
  column?: number;
}

export interface ValidatedNote {
  number: number;
  id?: number;
  deckName: string;
  modelName: SupportedModel;
  fields: Record<string, string>;
  tags: string[];
  line?: number;
}

export interface ValidationResult {
  notes: ValidatedNote[];
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
}

export interface AnkiConnectNote {
  deckName: string;
  modelName: SupportedModel;
  fields: Record<string, string>;
  tags: string[];
  options: { allowDuplicate: boolean };
}

export interface AnkiConnectResponse<T> {
  result: T | null;
  error: string | null;
}

export interface ImportResult {
  created: number;
  failed: { noteNumber: number; reason: string }[];
  noteIds: number[];
}

export interface Checkpoint {
  id: string;
  deck: string;
  created: string;
  noteIds: number[];
}
```

**Functions** (`files.ts`, `hash.ts`, `retry.ts`, `format.ts`):

```ts
export function fileExistsSync(p: string): boolean;
export async function readTextFile(p: string): Promise<string>;
export async function writeTextFile(p: string, content: string): Promise<void>;

export function sha1Hex(input: string): string;        // stable content hash
export function shortId(prefix?: string): string;      // e.g. "id-a1b2c3d4"

export interface RetryOptions {
  retries?: number;
  backoffMs?: number;
  shouldAbort?: (err: unknown) => boolean;   // true stops retrying
}
export async function withRetries<T>(fn: (attempt: number) => Promise<T>, opts?: RetryOptions): Promise<T>;
export function chunkArray<T>(arr: readonly T[], size: number): T[][];
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]>;

export function fmtBytes(n: number): string;
export function fmtDuration(ms: number): string;
export function fmtCount(n: number, singular: string, plural?: string): string;
```

---

## `@anki-xml/logger`

```ts
import type { LogLevel } from "@anki-xml/utils";

export interface LoggerOptions {
  level?: LogLevel;
  quiet?: boolean;   // level = "error"
  verbose?: boolean; // level = "debug"
  debug?: boolean;   // level = "debug" (highest precedence)
}

export class Logger {
  constructor(opts?: LoggerOptions);
  error(msg: string): void;   // → stderr
  warn(msg: string): void;    // → stderr
  info(msg: string): void;    // → stdout
  debug(msg: string): void;   // → stdout
}
export function createLogger(opts?: LoggerOptions): Logger;
```

---

## `@anki-xml/checkpoint`

```ts
export type { Checkpoint } from "@anki-xml/utils";

export function checkpointDir(): string;
// $XDG_DATA_HOME/anki-import/checkpoints, else ~/.local/share/anki-import/checkpoints

export async function createCheckpoint(opts: { id: string; deck: string; noteIds: number[] }): Promise<Checkpoint>;
export async function loadCheckpoint(id: string): Promise<Checkpoint>;   // throws "Checkpoint not found: <id>" on ENOENT
export async function listCheckpoints(): Promise<Checkpoint[]>;           // sorted by created; skips corrupt files
export async function deleteCheckpoint(id: string): Promise<void>;        // unlink, errors swallowed
```

---

## `@anki-xml/config`

```ts
export interface AnkiConfig { deck?: string; model?: string; url?: string; }
export const CONFIG_FILE_NAMES: readonly ["anki.config.json", "anki.config.yaml", "anki.config.yml"];

export async function findConfig(startDir?: string): Promise<string | null>;  // walks up to fs root
export async function loadConfig(opts?: { cwd?: string }): Promise<AnkiConfig>;
```

---

## `@anki-xml/anki`

The only package allowed to talk to AnkiConnect.

**Errors** (`errors.ts`):

```ts
export const ANKICONNECT_ADDON_CODE = "2055492159";
export const DEFAULT_URL = "http://127.0.0.1:8765";

export type ConnectCause = "refused" | "timeout" | "http" | "bad-json" | "network" | "ok" | "unknown";

export interface ConnectDiagnosis {
  reachable: boolean;
  cause: ConnectCause;       // branch on this, never on message text
  url: string;
  detail: string;
  hints: string[];           // ordered, actionable steps
  suggestion?: string;       // e.g. "anki-import doctor"
}

export function classifyConnectError(err: unknown, url: string): ConnectDiagnosis;
```

**Client** (`ankiconnect.ts`):

```ts
export interface AnkiConnectNoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  fields: Record<string, { value: string; order: number }>;
  cards: number[];
  deckName?: string;
}
export interface AnkiConnectUpdateNote { id: number; fields: Record<string, string>; tags?: string[]; }
export interface DeckCardCounts { new: number; learning: number; review: number; suspended: number; buried: number; }

export interface AnkiClientOptions {
  url?: string;             // default http://127.0.0.1:8765
  fetchImpl?: typeof fetch; // test injection point
  timeout?: number;         // default 10_000 ms
  retries?: number;         // default 3
  backoffMs?: number;       // default 100 (exponential: backoff * 2^(attempt-1))
}

export class AnkiConnectError extends Error {
  override cause?: string;        // stable cause code, e.g. "refused"
  hints?: string[];               // actionable fix steps
  suggestion?: string;            // suggested follow-up command
  diagnosis?: ConnectDiagnosis;
  constructor(message: string, diagnosis?: ConnectDiagnosis);
}

export class AnkiClient {
  constructor(options?: AnkiClientOptions);
  async version(): Promise<number>;
  async addNotes(notes: AnkiConnectNote[]): Promise<(number | null)[]>;
  async canAddNotes(notes: AnkiConnectNote[]): Promise<boolean[]>;
  async updateNoteFields(note: AnkiConnectUpdateNote): Promise<void>;
  async createDeck(name: string): Promise<number>;
  async deckNames(): Promise<string[]>;
  async modelNames(): Promise<string[]>;
  async modelFieldNames(modelName: string): Promise<string[]>;
  async modelTemplates(modelName: string): Promise<Record<string, Record<string, string>>>;
  async findNotes(query: string): Promise<number[]>;
  async deleteNotes(noteIds: number[]): Promise<void>;
  async notesInfo(noteIds: number[]): Promise<(AnkiConnectNoteInfo | null)[]>;
  async getAddons(): Promise<Record<string, boolean>>;
  async getTags(): Promise<string[]>;
  async addTags(noteIds: number[], tags: string[]): Promise<void>;    // tags joined with " "
  async removeTags(noteIds: number[], tags: string[]): Promise<void>;
  async storeMedia(filename: string, data: Buffer): Promise<string>;   // base64-encoded internally
  async retrieveMedia(filename: string): Promise<Buffer>;
  async deleteMedia(filename: string): Promise<void>;
  async mediaList(): Promise<string[]>;
  async cardCounts(decks: string[]): Promise<Record<string, DeckCardCounts>>;
  async diagnose(): Promise<ConnectDiagnosis>;                         // never throws
}
/** @deprecated Use AnkiClient */
export const AnkiConnectClient: typeof AnkiClient;
```

All requests use AnkiConnect `version: 6`. Envelope errors (Anki
`error` field) are thrown as `AnkiConnectError` without retrying.

---

## `@anki-xml/models`

**Registry** (`models.ts`):

```ts
import type { ParsedField, ParsedNote, XmlFieldName } from "@anki-xml/utils";

export interface NoteModel {
  name: string;
  accepts: ReadonlySet<XmlFieldName>;
  required: ReadonlySet<XmlFieldName>;
  optional: ReadonlySet<XmlFieldName>;
  fieldNames: Partial<Record<XmlFieldName, string>>;
  checkContent?: boolean;
  validateExtras?: (parsed: ParsedNote) => string[];
  buildFields: (fields: ParsedField[]) => Record<string, string>;
}

export function hasMeaningfulContent(html: string): boolean;
export function hasClozeMarkers(html: string): boolean;       // /\{\{c\d+(?:,\d+)*::/
export function normalizeFieldKey(name: string): string;      // "Front"→"front", "Add Reverse"/"addreverse"→"addReverse"

export const MODELS: ReadonlyMap<string, NoteModel>;          // Basic, Basic (and reversed card),
                                                              // Basic (optional reversed card),
                                                              // Basic (type in the answer), Cloze
export const SUPPORTED_MODEL_NAMES: string[];
export const DEFAULT_MODEL_NAME = "Basic";
export function getModel(name: string): NoteModel | undefined;
```

**Anki introspection** (`anki.ts`):

```ts
export interface ModelInfo { name: string; fields: string[]; }
export async function listModels(client: AnkiClient): Promise<ModelInfo[]>;
```

---

## `@anki-xml/parser`

**Tokenizing / CDATA** (`tokenize.ts`, `cdata.ts`):

```ts
export class XmlParseError extends Error {
  line?: number;
  column?: number;
  constructor(message: string, loc?: { line?: number; column?: number });
}

export type XmlToken =
  | { kind: "start"; name: string; tagStart: number; tagEnd: number; contentStart: number; attrs: Record<string, string> }
  | { kind: "selfClose"; name: string; tagStart: number; tagEnd: number; attrs: Record<string, string> }
  | { kind: "end"; name: string; tagStart: number; tagEnd: number }
  | { kind: "cdata"; tagStart: number; contentStart: number; contentEnd: number; tagEnd: number }
  | { kind: "comment"; tagStart: number; tagEnd: number }
  | { kind: "pi"; tagStart: number; tagEnd: number }
  | { kind: "markupDecl"; tagStart: number; tagEnd: number }
  | { kind: "text"; start: number; end: number };

export function tokenizeXml(source: string): XmlToken[];   // never decodes entities
export function sourceLocation(source: string, offset: number): { line: number; column: number };
export function offsetOfLine(source: string, line: number): number;

export function escapeCdataForHtml(s: string): string;     // escapes bare & < >, keeps existing entities
export const HTML_VOID_TAGS: readonly string[];            // br hr img input meta link area base col embed param source track wbr
```

**Full-document XML** (`xml-parser.ts`):

```ts
export interface ParsedDocument { notes: ParsedNote[]; defaultDeck: string; version: string; }

export function parseDocument(source: string): ParsedDocument;
// validates well-formedness (fast-xml-parser, unpairedTags = HTML_VOID_TAGS),
// tokenizes, enforces <anki version="1"> root, handles nested <deck>,
// <tag> children, <field name=...> and legacy short tags (front/back/text/extra/addreverse)
export function extractFieldContent(source: string, tokens: XmlToken[], openIdx: number): { html: string };
export function parseDocument as parseXml(source: string): ParsedDocument;  // alias
```

**Streaming XML** (`xml-stream.ts`):

```ts
export interface StreamParseOptions { defaultDeck?: string; }

export async function* parseXmlStream(
  input: Readable | AsyncIterable<string | Buffer>,
  opts?: StreamParseOptions,
): AsyncGenerator<ParsedNote, void, unknown>;

export async function* parseXmlFileStream(
  path: string,
  opts?: StreamParseOptions,
): AsyncGenerator<ParsedNote, void, unknown>;
```

**Other formats** (`structured.ts`, `yaml-parser.ts`, `json-parser.ts`,
`csv-parser.ts`, `markdown-parser.ts`) — all return
`{ notes: ParsedNote[]; defaultDeck: string }` and never decode XML
entities:

```ts
export interface StructuredNote { deck?: string; model?: string; tags?: string | string[]; [field: string]: unknown; }
export interface StructuredDocument { deck?: string; model?: string; tags?: string | string[]; notes: StructuredNote[]; }
export function structuredToNotes(doc: StructuredDocument): { notes: ParsedNote[]; defaultDeck: string };
// default model "Basic"; non-string field values JSON.stringify'd

export function parseYaml(source: string): { notes: ParsedNote[]; defaultDeck: string };
export function parseJson(source: string): { notes: ParsedNote[]; defaultDeck: string };
export interface CsvParseOptions { defaultDeck?: string; defaultModel?: string; }
export function parseCsv(source: string, opts?: CsvParseOptions): { notes: ParsedNote[]; defaultDeck: string };
export interface MarkdownParseOptions { defaultDeck?: string; }
export function parseMarkdown(source: string, opts?: MarkdownParseOptions): { notes: ParsedNote[]; defaultDeck: string };
export function escapeHtml(s: string): string;   // same rule as escapeCdataForHtml
```

---

## `@anki-xml/validation`

```ts
import * as v from "valibot";

export const FieldSchema: v.ObjectSchema<...>;  // { name: minLength(1), html: string, displayName?: string }
export const NoteSchema: v.ObjectSchema<...>;   // number/type/deck/tags/fields + optional id≥1, line, sourceOffset, fieldSourceOffsets, unknownElements
export type NoteSchemaInput = v.InferInput<typeof NoteSchema>;

export function validateNote(
  note: ParsedNote,
  defaultDeck: string,
  source?: string,
): { note?: ValidatedNote; errors: NoteValidationError[]; warnings: NoteValidationError[] };

export function validateNotes(
  notes: ParsedNote[],
  defaultDeck: string,
  source?: string,
): ValidationResult;   // adds "No <note> elements" error on empty; duplicate-id errors

export function formatValidationError(err: NoteValidationError): string;  // "Line N:\nmessage"
```

---

## `@anki-xml/planner`

```ts
import { AnkiClient } from "@anki-xml/anki";
import type { Logger } from "@anki-xml/logger";
import type { AnkiConnectNote, ValidatedNote } from "@anki-xml/utils";

export function toAnkiConnectNote(note: ValidatedNote, allowDuplicate?: boolean): AnkiConnectNote;

export interface PlannedUpdate {
  id: number;
  note: ValidatedNote;
  changedFields: string[];   // field display names whose values differ
}
export interface ImportPlan {
  add: ValidatedNote[];
  update: PlannedUpdate[];
  remove: { id: number }[];         // reserved; always empty for now
  duplicates: ValidatedNote[];
  unchanged: number;
}
export interface PlannerOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;        // default 500
  allowDuplicate?: boolean;
  logger?: Logger;
}

export async function buildPlan(notes: ValidatedNote[], opts?: PlannerOptions): Promise<ImportPlan>;
// notes with id → notesInfo: update / unchanged / add (when missing)
// notes without id → canAddNotes: add / duplicates
```

---

## `@anki-xml/diff`

```ts
import type { ValidatedNote } from "@anki-xml/utils";

export interface FieldDiff { field: string; from?: string; to?: string; }
export interface NoteDiff {
  noteNumber: number;
  id?: number;
  kind: "added" | "removed" | "changed" | "unchanged";
  changes: FieldDiff[];
  deckChanged?: { from?: string; to?: string };
  modelChanged?: { from?: string; to?: string };
  tagsChanged?: { added: string[]; removed: string[] };
}

export function diffTags(a: string[], b: string[]): { added: string[]; removed: string[] };
export function diffDecks(collection: string[], expected: string[]): { missing: string[]; extra: string[] };
export function diffNote(a: ValidatedNote, b: ValidatedNote): NoteDiff;
export function diffNoteLists(before: ValidatedNote[], after: ValidatedNote[]): NoteDiff[];
// matched by id when both sides have one, otherwise by number
```

---

## `@anki-xml/sync`

```ts
import type { Logger } from "@anki-xml/logger";
import type { ImportPlan } from "@anki-xml/planner";

export interface SyncApplyOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;          // default 500
  autoCreateDeck?: boolean;    // default true
  allowDuplicate?: boolean;
  checkpointId?: string;
  logger?: Logger;
}
export interface SyncApplyResult {
  created: number;
  updated: number;
  failed: { noteNumber: number; reason: string }[];
  checkpointId?: string;
}
export interface DriftEntry { id: number; exists: boolean; }

export async function applyPlan(plan: ImportPlan, opts?: SyncApplyOptions): Promise<SyncApplyResult>;
export async function driftFromCheckpoint(
  checkpointId: string,
  opts?: { url?: string; fetchImpl?: typeof fetch },
): Promise<DriftEntry[]>;
```

---

## `@anki-xml/rollback`

```ts
import type { Checkpoint } from "@anki-xml/utils";

export interface RollbackOptions {
  checkpointId: string;
  url?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
  keepCheckpoint?: boolean;   // default false — checkpoint file is deleted
}
export interface RollbackResult { checkpoint: Checkpoint; deleted: number; dryRun: boolean; }

export async function rollback(opts: RollbackOptions): Promise<RollbackResult>;
```

---

## `@anki-xml/tags`

```ts
import type { AnkiClient } from "@anki-xml/anki";

export function parseTagList(raw: string): string[];             // split whitespace, trim, drop empties
export async function listTags(client: AnkiClient): Promise<string[]>;   // sorted
export async function addTags(client: AnkiClient, noteIds: number[], tags: string[]): Promise<void>;    // chunks of 500
export async function removeTags(client: AnkiClient, noteIds: number[], tags: string[]): Promise<void>;
```

---

## `@anki-xml/media`

```ts
import type { AnkiClient } from "@anki-xml/anki";

export async function storeMedia(client: AnkiClient, filename: string, data: Buffer): Promise<string>;
export async function storeMediaFile(client: AnkiClient, filePath: string, filename?: string): Promise<string>;
export async function retrieveMedia(client: AnkiClient, filename: string): Promise<Buffer>;
export async function retrieveMediaToFile(client: AnkiClient, filename: string, outPath: string): Promise<void>;
export async function deleteMedia(client: AnkiClient, filename: string): Promise<void>;
export async function listMedia(client: AnkiClient): Promise<string[]>;
```

---

## `@anki-xml/stats`

```ts
import type { AnkiClient } from "@anki-xml/anki";

export interface DeckCounts { new: number; learning: number; review: number; suspended: number; buried: number; }
export interface CollectionStats {
  decks: number;
  models: number;
  notes: number;                       // findNotes("deck:*").length
  cards: number;
  perDeck: Record<string, DeckCounts>;
}

export async function deckStats(client: AnkiClient, deck?: string): Promise<Record<string, DeckCounts>>;
export async function collectionStats(client: AnkiClient): Promise<CollectionStats>;
```

---

## `@anki-xml/core`

Orchestration and the plugin API.

**Import pipeline** (`importer/import.ts`):

```ts
export interface ImportOptions {
  inputPath: string;
  url?: string;
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
  stream?: boolean;              // XML streaming fast path
  batchSize?: number;            // default 500
  autoCreateDeck?: boolean;      // default true
  allowDuplicate?: boolean;
  checkpointId?: string;
  deck?: string;                 // fill empty decks
  model?: string;                // fill empty model types
  logger?: Logger;
}
export interface ImportOutcome {
  result: ImportResult;          // { created, failed, noteIds }
  validationErrors: NoteValidationError[];
  warnings: NoteValidationError[];
  validCount: number;
  checkpointId?: string;
}
export async function importFromFile(opts: ImportOptions): Promise<ImportOutcome>;
// notes with id= are rejected as update targets ("use 'sync'"); import creates only
```

**Doctor** (`doctor.ts`):

```ts
export const MATHJAX_ADDON_CODE = "1610307553";

export interface DoctorCheck {
  name: string;       // anki-connect-reachable | anki-connect-version | collection-has-decks | collection-has-models | addons-queryable | mathjax-addon-installed
  ok: boolean;
  detail: string;
  hints: string[];    // ordered fix steps
  suggestion?: string;
}
export interface DoctorOptions { url?: string; fetchImpl?: typeof fetch; }
export interface DoctorResult { url: string; checks: DoctorCheck[]; ok: boolean; }

export async function runDoctor(opts?: DoctorOptions): Promise<DoctorResult>;
// requires AnkiConnect API >= 6
```

**Plan / sync / diff / watch pipelines** (`plan.ts`, `sync-file.ts`, `diff-file.ts`, `watch.ts`):

```ts
export interface PlanFileOptions extends PlannerOptions {
  stream?: boolean;
  deck?: string;
  model?: string;
  logger?: Logger;
}
export interface PlanFileResult {
  plan: ImportPlan;
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
  validated: ValidatedNote[];
  noteCount: number;
}
export function applyOverrides(notes: ParsedNote[], opts: { deck?: string; model?: string }): void;
export async function planFile(file: string, opts?: PlanFileOptions): Promise<PlanFileResult>;

export interface SyncFileOptions extends PlanFileOptions, SyncApplyOptions { dryRun?: boolean; }
export interface SyncFileResult {
  plan: PlanFileResult["plan"];
  applied: SyncApplyResult;
  errors: PlanFileResult["errors"];
  warnings: PlanFileResult["warnings"];
}
export async function syncFile(file: string, opts?: SyncFileOptions): Promise<SyncFileResult>;
export interface SyncStatusResult { checkpoint: Checkpoint | null; drift: DriftEntry[]; }
export async function syncStatus(opts?: { checkpointId?: string; url?: string; fetchImpl?: typeof fetch }): Promise<SyncStatusResult>;

export interface DiffFileResult {
  noteDiffs: NoteDiff[];
  deckDiff: { missing: string[]; extra: string[] };
  plan: PlanFileResult["plan"];
  errors: NoteValidationError[];
  warnings: NoteValidationError[];
}
export async function diffFile(file: string, opts?: PlanFileOptions): Promise<DiffFileResult>;

export interface WatchSummary { add: number; update: number; duplicates: number; unchanged: number; }
export interface WatchOptions {
  url?: string;
  fetchImpl?: typeof fetch;
  batchSize?: number;
  autoCreateDeck?: boolean;
  allowDuplicate?: boolean;
  checkpointId?: string;
  logger?: Logger;
  confirm?: (summary: WatchSummary) => Promise<boolean> | boolean;  // false skips applying
}
export async function watchFile(file: string, opts?: WatchOptions): Promise<{ stop: () => Promise<void> }>;
```

**Plugin API** (`plugins/types.ts`, `plugins/registry.ts`, `plugins/xml-plugin.ts`, `plugins/exporter-json.ts`):

```ts
import type { Readable } from "node:stream";

export interface ImportPlugin {
  name: string;
  supports(ext: string): boolean;                       // matches file extensions
  parse(input: Readable): AsyncIterable<ParsedNote>;
}
export interface ExporterPlugin {
  name: string;
  supports(format: string): boolean;
  export(notes: ValidatedNote[]): string;
}
export interface ValidatorPlugin {
  name: string;
  validate(note: ParsedNote): NoteValidationError[];
}
export interface TransformerPlugin {
  name: string;
  transform(note: ParsedNote): ParsedNote;
}

export class XmlImportPlugin implements ImportPlugin;   // name "xml", supports .xml, streams

export const YAML_IMPORTER: ImportPlugin;    // .yaml .yml
export const JSON_IMPORTER: ImportPlugin;    // .json
export const CSV_IMPORTER: ImportPlugin;     // .csv
export const MARKDOWN_IMPORTER: ImportPlugin;// .md .markdown
export const JsonExporterPlugin: ExporterPlugin;   // name "json"

export function registerImporter(plugin: ImportPlugin): void;
export function registerExporter(plugin: ExporterPlugin): void;
export function registerValidator(plugin: ValidatorPlugin): void;
export function registerTransformer(plugin: TransformerPlugin): void;
export function getImporterFor(filePath: string): ImportPlugin | undefined;  // by file extension
export function listImporters(): ImportPlugin[];
export function listExporters(): ExporterPlugin[];
export function listValidators(): ValidatorPlugin[];
export function listTransformers(): TransformerPlugin[];
export function applyTransformers(note: ParsedNote): ParsedNote;             // all transformers in order
export function runValidatorPlugins(note: ParsedNote): NoteValidationError[];
// built-ins registered at module load: XmlImportPlugin + yaml/json/csv/markdown importers + JsonExporterPlugin
```

---

## `@anki-xml/cli`

```ts
export function main(argv?: string[]): Promise<number>;   // process exit code
export { parseArgs, CliError } from "./args.ts";

export class CliError extends Error { constructor(message: string); }

export interface GlobalFlags {
  url: string;        // default "http://127.0.0.1:8765"
  json: boolean;
  quiet: boolean;
  verbose: boolean;
  debug: boolean;
  dryRun: boolean;
  help: boolean;
  version: boolean;
}
export interface ParsedArgs {
  command: string | null;
  positional: string[];
  flags: GlobalFlags;
  rest: Record<string, string | boolean>;   // per-command flags
}
export function parseArgs(argv: string[]): ParsedArgs;
export function flagString(rest: Record<string, string | boolean>, key: string): string | undefined;
export function flagBool(rest: Record<string, string | boolean>, key: string): boolean;
export function flagNumber(rest: Record<string, string | boolean>, key: string, fallback: number): number;
```

---

## `@anki-xml/mcp`

```ts
export interface McpServerOptions { url?: string; fetchImpl?: typeof fetch; }
export async function startMcpServer(opts?: McpServerOptions): Promise<void>;
// reads JSON-RPC lines from stdin, writes responses to stdout

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (params: Record<string, unknown>, ctx: McpContext) => Promise<unknown>;
}
export interface McpContext { url: string; fetchImpl?: typeof fetch; }
export const TOOLS: McpTool[];   // 18 tools — see mcp-design.md
export class McpToolError extends Error {}

export function toolErrorData(err: unknown): {
  code: string; message: string; hints?: string[]; suggestion?: string;
};
// AnkiConnectError → { code: "ANKICONNECT_ERROR", message, hints, suggestion }
// otherwise { code: "INTERNAL_ERROR", message }

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}
export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}
export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
export function success(id: number | string | null, result: unknown): JsonRpcResponse;
export function failure(id: number | string | null, code: number, message: string, data?: unknown): JsonRpcResponse;
export function parseRequest(raw: string):
  | { id: number | string | null; method: string; params: unknown }
  | null;   // null for invalid JSON, notifications, and batches
```
