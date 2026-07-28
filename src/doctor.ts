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
 *   5. AnkiConnect can query installed add-ons (`getAddons`).
 *   6. The MathJax add-on (AnkiWeb code 1610307553) is installed and
 *      enabled. MathJax is required to render the inline `\(...\)` and
 *      display `\[...\]` delimiters. The native `[latex]...[/latex]`
 *      syntax renders without it; this check warns only if you might
 *      rely on the MathJax-only delimiters.
 *
 * Each check returns a structured pass/fail with diagnostic detail.
 * The command exits 0 when every check passes and 1 when any fails.
 *
 * `doctor` is read-only and never mutates state.
 */

import { AnkiConnectClient, AnkiConnectError } from "./anki-connect.ts";

/**
 * AnkiWeb add-on code for the MathJax add-on (by Alexander Prüfer).
 * Source: https://ankiweb.net/shared/info/1610307553
 *
 * MathJax is the canonical way to render LaTeX in Anki, but it is NOT
 * installed by default. Authors who write `\(...\)` or `\[...\]` in
 * their cards must have this add-on installed and enabled, or the
 * delimiters will appear as literal text in the reviewer.
 */
export const MATHJAX_ADDON_CODE = "1610307553";

/** Well-known AnkiWeb codes the doctor cares about, keyed by stable name. */
export const KNOWN_ADDONS: Record<string, { code: string; description: string }> = {
  mathjax: {
    code: MATHJAX_ADDON_CODE,
    description:
      "MathJax inline/display LaTeX rendering for \(...\) and \[...\]",
  },
};

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

  // Check 5: AnkiConnect can query installed add-ons. This is a soft
  // capability check -- older AnkiConnect builds do not expose
  // `getAddons`, so we report it as a check that may legitimately
  // fail on older installations without failing the whole doctor run.
  let installedAddons: Record<string, boolean> | null = null;
  try {
    installedAddons = await client.getAddons();
    const count = Object.keys(installedAddons).length;
    checks.push({
      name: "addons-queryable",
      ok: true,
      detail: `AnkiConnect reported ${count} add-on(s)`,
    });
  } catch (err) {
    checks.push({
      name: "addons-queryable",
      ok: false,
      detail:
        `AnkiConnect does not support add-on queries (likely an older build): ${(err as Error).message}`,
    });
    // Subsequent add-on checks need the addons map; bail on those.
    return { url, checks, ok: checks.every((c) => c.ok) };
  }

  // Check 6: MathJax add-on installed and enabled. Without it,
  // `\(...\)` and `\[...\]` show as literal text. The native Anki
  // `[latex]...[/latex]` syntax still works regardless, so this check
  // reports the situation but is informational about the rendering
  // paths that require it.
  const mathjaxEnabled = installedAddons[MATHJAX_ADDON_CODE] === true;
  const mathjaxInstalled = Object.prototype.hasOwnProperty.call(
    installedAddons,
    MATHJAX_ADDON_CODE,
  );
  if (mathjaxEnabled) {
    checks.push({
      name: "mathjax-addon-installed",
      ok: true,
      detail: `MathJax add-on ${MATHJAX_ADDON_CODE} is installed and enabled`,
    });
  } else if (mathjaxInstalled) {
    checks.push({
      name: "mathjax-addon-installed",
      ok: false,
      detail:
        `MathJax add-on ${MATHJAX_ADDON_CODE} is installed but disabled; enable it in Anki's add-ons screen, or use the native [latex]...[/latex] syntax which renders without MathJax`,
    });
  } else {
    checks.push({
      name: "mathjax-addon-installed",
      ok: false,
      detail:
        `MathJax add-on ${MATHJAX_ADDON_CODE} is not installed; run \`anki-xml addon install ${MATHJAX_ADDON_CODE}\` to install it, or use the native [latex]...[/latex] syntax which renders without MathJax`,
    });
  }

  return {
    url,
    checks,
    ok: checks.every((c) => c.ok),
  };
}