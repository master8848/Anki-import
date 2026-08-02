/**
 * AnkiConnect error classification.
 *
 * Turns raw fetch failures into actionable, machine-readable diagnostics
 * so both humans and AI agents know *why* AnkiConnect is unreachable and
 * what to do next.
 */

export const ANKICONNECT_ADDON_CODE = "2055492159";
export const DEFAULT_URL = "http://127.0.0.1:8765";

export type ConnectCause =
  | "refused"
  | "timeout"
  | "http"
  | "bad-json"
  | "network"
  | "ok"
  | "unknown";

export interface ConnectDiagnosis {
  /** Whether an AnkiConnect request succeeded. */
  reachable: boolean;
  /** Machine-readable cause. Branch on this, never on message text. */
  cause: ConnectCause;
  url: string;
  detail: string;
  /** Ordered, actionable steps for a human or agent to run. */
  hints: string[];
  /** Suggested follow-up command, if any. */
  suggestion?: string;
}

const REFUSED_HINTS = [
  `Start the Anki app — AnkiConnect is served from inside Anki and cannot run standalone.`,
  `Install the AnkiConnect add-on: in Anki, Tools → Add-ons → Get Add-ons → enter ${ANKICONNECT_ADDON_CODE}.`,
  `Restart Anki after installing or enabling the add-on (Tools → Add-ons → check it is enabled).`,
  `Confirm the URL is correct: AnkiConnect listens on ${DEFAULT_URL} by default; pass --url <addr> if you configured another port.`,
];

const TIMEOUT_HINTS = [
  `Anki is running but did not answer in time — it may be busy or frozen.`,
  `Restart Anki, or wait and retry.`,
  `If this persists, reinstall AnkiConnect: Tools → Add-ons → Browse/Remove → Get Add-ons → ${ANKICONNECT_ADDON_CODE}.`,
];

const HTTP_HINTS = [
  `AnkiConnect answered with an HTTP error — the URL likely points at a non-AnkiConnect service (proxy, another web app).`,
  `Check Anki's add-on settings for the configured port, then pass the matching --url.`,
];

const BAD_JSON_HINTS = [
  `Something else is listening on that port — it returned a non-AnkiConnect response.`,
  `Run "anki-import doctor" to re-check, or change the port in AnkiConnect settings and pass --url.`,
];

const NETWORK_HINTS = [
  `The host could not be reached at all (DNS, firewall, or wrong host).`,
  `AnkiConnect only listens on localhost; if Anki is on another machine, set up a reverse tunnel first.`,
  `Run "anki-import doctor" for a full diagnosis.`,
];

function nodeCode(err: unknown): string | undefined {
  if (err instanceof Error && "cause" in err) {
    const cause = err.cause;
    if (cause !== null && typeof cause === "object") {
      return (cause as { code?: string }).code;
    }
  }
  return undefined;
}

/** Classify a thrown fetch error against AnkiConnect. */
export function classifyConnectError(err: unknown, url: string): ConnectDiagnosis {
  const code = nodeCode(err);
  const msg = err instanceof Error ? err.message : String(err);

  if (code === "ECONNREFUSED" || code === "EPIPE" || code === "ECONNRESET") {
    return {
      reachable: false,
      cause: "refused",
      url,
      detail: `Connection refused at ${url}${code ? ` (${code})` : ""}.`,
      hints: REFUSED_HINTS,
      suggestion: "anki-import doctor",
    };
  }
  if (code === "ETIMEDOUT" || code === "EAI_AGAIN" || (err instanceof Error && err.name === "AbortError")) {
    return {
      reachable: false,
      cause: "timeout",
      url,
      detail: `Request to ${url} timed out${code ? ` (${code})` : ""}.`,
      hints: TIMEOUT_HINTS,
      suggestion: "anki-import doctor",
    };
  }
  if (code === "ENOTFOUND" || code === "EHOSTUNREACH" || code === "EADDRNOTAVAIL") {
    return {
      reachable: false,
      cause: "network",
      url,
      detail: `Could not resolve or reach ${url} (${code}).`,
      hints: NETWORK_HINTS,
      suggestion: "anki-import doctor",
    };
  }
  if (/invalid json/i.test(msg)) {
    return {
      reachable: false,
      cause: "bad-json",
      url,
      detail: `Non-AnkiConnect response from ${url}: ${msg}`,
      hints: BAD_JSON_HINTS,
      suggestion: "anki-import doctor",
    };
  }
  if (/http \d+/i.test(msg)) {
    return {
      reachable: false,
      cause: "http",
      url,
      detail: `AnkiConnect returned an HTTP error: ${msg}`,
      hints: HTTP_HINTS,
    };
  }
  return {
    reachable: false,
    cause: "unknown",
    url,
    detail: `Failed to reach AnkiConnect at ${url}: ${msg}`,
    hints: [`Run "anki-import doctor" for a full diagnosis.`],
    suggestion: "anki-import doctor",
  };
}
