/**
 * `doctor` command — verify the environment is ready to use.
 *
 * An AI agent should run `anki-xml doctor` before doing real work
 * to confirm:
 *
 *   1. AnkiConnect is reachable at the configured URL.
 *   2. AnkiConnect reports a version we understand.
 *   3. The collection has at least one deck.
 *   4. The collection has at least one model.
 *
 * Each check returns a structured pass/fail with diagnostic detail.
 * The command exits 0 when every check passes and 1 when any fails.
 *
 * `doctor` is read-only and never mutates state.
 */

import { AnkiConnectClient, AnkiConnectError } from "./anki-connect.ts";

export interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface DoctorOptions {
  ankiConnectUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface DoctorResult {
  url: string;
  checks: DoctorCheck[];
  /** True when every check passed. */
  ok: boolean;
}

export async function runDoctor(opts: DoctorOptions): Promise<DoctorResult> {
  const url = opts.ankiConnectUrl ?? "http://127.0.0.1:8765";
  const client = new AnkiConnectClient({ url, fetchImpl: opts.fetchImpl });
  const checks: DoctorCheck[] = [];

  // Check 1: connectivity + version.
  try {
    const version = await client.version();
    checks.push({
      name: "anki-connect-reachable",
      ok: true,
      detail: `connected to ${url}; AnkiConnect version ${version}`,
    });
  } catch (err) {
    const detail = err instanceof AnkiConnectError
      ? `failed to reach ${url}: ${err.message}`
      : `failed to reach ${url}: ${(err as Error).message}`;
    checks.push({
      name: "anki-connect-reachable",
      ok: false,
      detail,
    });
    // No point running further checks; bail with what we have.
    return { url, checks, ok: false };
  }

  // Check 2: minimum supported version. AnkiConnect is versioned; older
  // builds lack methods we depend on (canAddNotes, addNotes with options,
  // modelFieldNames). The cutoff is intentionally low (5 = the API shape
  // we rely on was stable by then).
  try {
    const version = await client.version();
    const ok = version >= 5;
    checks.push({
      name: "anki-connect-version",
      ok,
      detail: ok
        ? `AnkiConnect version ${version} is supported`
        : `AnkiConnect version ${version} is too old; minimum is 5`,
    });
  } catch {
    checks.push({
      name: "anki-connect-version",
      ok: false,
      detail: "could not read AnkiConnect version",
    });
  }

  // Check 3: collection has decks.
  try {
    const decks = await client.deckNames();
    checks.push({
      name: "collection-has-decks",
      ok: decks.length > 0,
      detail: decks.length > 0
        ? `collection has ${decks.length} deck(s)`
        : "collection has no decks; create one in Anki first",
    });
  } catch (err) {
    checks.push({
      name: "collection-has-decks",
      ok: false,
      detail: `could not list decks: ${(err as Error).message}`,
    });
  }

  // Check 4: collection has models.
  try {
    const models = await client.modelNames();
    checks.push({
      name: "collection-has-models",
      ok: models.length > 0,
      detail: models.length > 0
        ? `collection has ${models.length} model(s) (e.g. ${models.slice(0, 3).join(", ")})`
        : "collection has no models; this is unusual",
    });
  } catch (err) {
    checks.push({
      name: "collection-has-models",
      ok: false,
      detail: `could not list models: ${(err as Error).message}`,
    });
  }

  return {
    url,
    checks,
    ok: checks.every((c) => c.ok),
  };
}