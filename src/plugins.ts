/**
 * Plugin hooks (P4.9) — **deferred**.
 *
 * Per `docs/roadmap.md`, plugins are not implemented until 3 real
 * plugin requests materialize. The plugin system is a security
 * surface (a plugin runs code in our process) and a maintenance
 * burden (every command has to play nice with arbitrary third-party
 * additions), and there is no current demand.
 *
 * This file documents the *shape* the future system would take so
 * the conversation about plugins is grounded in concrete tradeoffs.
 * It exports nothing today and is not wired into the command
 * registry.
 *
 * When the time comes, the design is:
 *
 *   1. **Plugin discovery** — read `~/.config/anki-xml/plugins/*.ts`
 *      at startup. Plugins export a `Plugin` object:
 *
 *      ```ts
 *      export const plugin: Plugin = {
 *        name: "deck-stats",
 *        version: "0.1.0",
 *        commands: [myCmd],   // a Command<T> from src/cli/command.ts
 *        hooks: { beforeImport: async (ctx) => {...} },
 *      };
 *      ```
 *
 *   2. **Command injection** — the plugin's `commands` array is
 *      merged into `COMMANDS` (in `src/cli/registry.ts`). The CLI's
 *      --help, completion, and dispatch all pick them up
 *      automatically (this is the dividend of the registry work in
 *      commit 2).
 *
 *   3. **Hook points** — `beforeImport` / `afterImport` /
 *      `beforeExport` / `afterExport`. Each receives a typed
 *      context and may return a modified version. Hooks are async.
 *
 *   4. **Sandboxing** — plugins run in the same Bun process. We do
 *      not attempt to isolate them; this is the same trust model as
 *      npm scripts. Users who need isolation can run the CLI in a
 *      container.
 *
 *   5. **Versioning** — plugins declare a `minCliVersion`. The CLI
 *      refuses to load a plugin built against a newer major version.
 *
 * Why we are not building this now:
 *
 *   - No real demand. Adding plugin support costs ~2 weeks of design
 *     + impl + tests. Spending that on speculation is wrong.
 *   - It locks us in. Once plugins exist, every refactor has to
 *     preserve their public surface.
 *   - The registry is already extensible: a `Command<T>` is a
 *     data-driven object. Anyone who needs a one-off command can
 *     PR a real command into this repo and get the same UX.
 *
 * When to revisit:
 *
 *   - When 3 distinct users ask for a command that doesn't belong
 *     in the core (e.g. "I want my own my-vendor-stats command").
 *   - When the core's surface area is too large to navigate and
 *     plugins become a way to opt out of features.
 *   - When Bun ships stable WebAssembly component support and we
 *     can offer a sandboxed plugin runtime.
 */

export {}; // intentionally empty
