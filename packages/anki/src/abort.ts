/**
 * Global abort for in-flight AnkiConnect requests.
 * The CLI wires SIGINT to this so Ctrl+C interrupts a hung request
 * instead of waiting out every retry and timeout.
 */

let controller = new AbortController();

/** Abort any in-flight AnkiConnect fetch (new requests abort immediately too). */
export function abortAnkiConnect(): void {
  if (!controller.signal.aborted) controller.abort();
}

/** True after abortAnkiConnect() — callers can skip error noise on Ctrl+C. */
export function isAnkiConnectAborted(): boolean {
  return controller.signal.aborted;
}

/** Signal wired into every AnkiClient fetch. */
export function ankiConnectAbortSignal(): AbortSignal {
  return controller.signal;
}

/** Reset after an abort (mainly for tests). */
export function resetAnkiConnectAbort(): void {
  if (controller.signal.aborted) controller = new AbortController();
}
