import { CliError, parseArgs, type ParsedArgs } from "./args.ts";
import { printHelp, printCommandHelp, VERSION, BIN_NAME } from "./help.ts";
import { createLogger } from "@anki-xml/logger";
import { AnkiConnectError, isAnkiConnectAborted } from "@anki-xml/anki";
import { printAnkiConnectError } from "./errors.ts";
import { runDoctorCommand } from "./commands/doctor.ts";
import { runOpenCommand } from "./commands/open.ts";
import { runValidate } from "./commands/validate.ts";
import { runImportCommand } from "./commands/import.ts";
import { runPlanCommand } from "./commands/plan.ts";
import { runDiffCommand } from "./commands/diff.ts";
import { runSyncCommand } from "./commands/sync.ts";
import { runCheckpointCommand } from "./commands/checkpoint.ts";
import { runRollbackCommand } from "./commands/rollback.ts";
import { runBenchmarkCommand } from "./commands/benchmark.ts";
import { runTagsCommand } from "./commands/tags.ts";
import { runStatsCommand } from "./commands/stats.ts";
import { runModelsCommand } from "./commands/models.ts";
import { runMediaCommand } from "./commands/media.ts";
import { runWatchCommand } from "./commands/watch.ts";
import { runMcpCommand } from "./commands/mcp.ts";

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    if (err instanceof CliError) {
      console.error(`Error: ${err.message}`);
      console.error(`Tip: run 'anki-import --help' to see how to use it.`);
      return 2;
    }
    throw err;
  }

  const log = createLogger({
    quiet: args.flags.quiet || args.flags.json,
    verbose: args.flags.verbose,
    debug: args.flags.debug,
  });

  if (args.flags.help) {
    if (args.command && printCommandHelp(args.command)) return 0;
    printHelp();
    return 0;
  }

  if (args.flags.version) {
    console.log(`${BIN_NAME} v${VERSION}`);
    return 0;
  }

  if (!args.command) {
    printHelp();
    return 0;
  }

  try {
    switch (args.command) {
      case "doctor":
        return await runDoctorCommand(args.flags, log);
      case "open":
        return await runOpenCommand(args.flags, log);
      case "validate":
        return await runValidate(requireFile("validate", args), args, log);
      case "import":
        return await runImportCommand(requireFile("import", args), args, log);
      case "plan":
        return await runPlanCommand(requireFile("plan", args), args, log);
      case "diff":
        return await runDiffCommand(requireFile("diff", args), args, log);
      case "sync":
        return await runSyncCommand(args.positional[0], args, log);
      case "checkpoint": {
        const sub = args.positional[0];
        return await runCheckpointCommand(
          sub,
          args.positional.slice(1),
          args.rest,
          args.flags,
          log,
        );
      }
      case "rollback": {
        const id = args.positional[0];
        if (!id) throw new CliError("rollback requires a checkpoint id");
        return await runRollbackCommand(id, args.rest, args.flags, log);
      }
      case "benchmark":
        return await runBenchmarkCommand(requireFile("benchmark", args), args.rest, args.flags, log);
      case "tags":
        return await runTagsCommand(
          args.positional[0],
          args.positional.slice(1),
          args.rest,
          args.flags,
          log,
        );
      case "stats":
        return await runStatsCommand(args.rest, args.flags, log);
      case "models":
        return await runModelsCommand(args.flags, log);
      case "media":
        return await runMediaCommand(
          args.positional[0],
          args.positional.slice(1),
          args.rest,
          args.flags,
          log,
        );
      case "watch":
        return await runWatchCommand(requireFile("watch", args), args, log);
      case "mcp":
        return await runMcpCommand();
      default:
        console.error(`Unknown command: '${args.command}'`);
        console.error(`Run '${BIN_NAME} --help' to see available commands.`);
        return 2;
    }
  } catch (err) {
    if (err instanceof CliError) {
      if (args.flags.json) {
        console.log(JSON.stringify({ ok: false, error: { code: "USAGE_ERROR", message: err.message } }));
      } else {
        console.error(`Error: ${err.message}`);
      }
      return 2;
    }
    if (err instanceof AnkiConnectError) {
      // Ctrl+C aborted the in-flight request — exit quietly with 130;
      // printing a fake "failure" would just add noise.
      if (isAnkiConnectAborted()) return 130;
      return printAnkiConnectError(err, args.flags, log);
    }
    const parseCode = parseErrorCode(err);
    if (parseCode) {
      const msg = err instanceof Error ? err.message : String(err);
      if (args.flags.json) {
        const error: Record<string, unknown> = { code: parseCode, message: msg };
        const loc = err as { line?: unknown; column?: unknown };
        if (typeof loc.line === "number") error["line"] = loc.line;
        if (typeof loc.column === "number") error["column"] = loc.column;
        console.log(JSON.stringify({ ok: false, error }));
      } else if (args.flags.debug) {
        console.error(err);
      } else {
        console.error(`parse error: ${msg}`);
      }
      return 1;
    }
    if (args.flags.json) {
      console.log(
        JSON.stringify({
          ok: false,
          error: { code: "FATAL", message: (err as Error).message },
        }),
      );
    } else if (args.flags.debug) {
      console.error(err);
    } else {
      console.error(`fatal: ${(err as Error).message}`);
    }
    return 2;
  }
}

/** Stable parse-error codes surfaced in --json like XML_PARSE_ERROR. */
const PARSE_ERROR_CODES = new Set([
  "XML_PARSE_ERROR",
  "JSON_PARSE_ERROR",
  "CSV_PARSE_ERROR",
  "YAML_PARSE_ERROR",
  "MD_PARSE_ERROR",
]);

function parseErrorCode(err: unknown): string | undefined {
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && PARSE_ERROR_CODES.has(code) ? code : undefined;
}

function requireFile(command: string, args: ParsedArgs): string {
  const file = args.positional[0];
  if (!file) throw new CliError(`${command} requires a file path`);
  return file;
}
