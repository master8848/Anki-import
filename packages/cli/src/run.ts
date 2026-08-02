import { CliError, parseArgs } from "./args.ts";
import { printHelp, printCommandHelp, VERSION, BIN_NAME } from "./help.ts";
import { createLogger } from "@anki-xml/logger";
import { AnkiConnectError } from "@anki-xml/anki";
import { printAnkiConnectError } from "./errors.ts";
import { runDoctorCommand } from "./commands/doctor.ts";
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
      console.error(`error: ${err.message}`);
      return 2;
    }
    throw err;
  }

  const log = createLogger({
    quiet: args.flags.quiet,
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
      case "validate": {
        const file = args.positional[0];
        if (!file) throw new CliError("validate requires a file path");
        return await runValidate(file, args, log);
      }
      case "import": {
        const file = args.positional[0];
        if (!file) throw new CliError("import requires a file path");
        return await runImportCommand(file, args, log);
      }
      case "plan": {
        const file = args.positional[0];
        if (!file) throw new CliError("plan requires a file path");
        return await runPlanCommand(file, args, log);
      }
      case "diff": {
        const file = args.positional[0];
        if (!file) throw new CliError("diff requires a file path");
        return await runDiffCommand(file, args, log);
      }
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
      case "benchmark": {
        const file = args.positional[0];
        if (!file) throw new CliError("benchmark requires a file path");
        return await runBenchmarkCommand(file, args.rest, args.flags, log);
      }
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
      case "watch": {
        const file = args.positional[0];
        if (!file) throw new CliError("watch requires a file path");
        return await runWatchCommand(file, args, log);
      }
      case "mcp":
        return await runMcpCommand();
      default:
        console.error(`error: unknown command '${args.command}'`);
        console.error(`Run '${BIN_NAME} --help' for usage.`);
        return 2;
    }
  } catch (err) {
    if (err instanceof CliError) {
      if (args.flags.json) {
        console.log(JSON.stringify({ ok: false, error: { code: "USAGE_ERROR", message: err.message } }));
      } else {
        console.error(`error: ${err.message}`);
      }
      return 2;
    }
    if (err instanceof AnkiConnectError) {
      return printAnkiConnectError(err, args.flags, log);
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
