/**
 * Static shell completion scripts.
 *
 * Each generator emits a self-contained script that knows the current
 * `anki-xml` subcommand and flag vocabulary. Re-run `anki-xml completion
 * <shell>` after upgrading to pick up new commands.
 *
 * Note: shell scripts need raw `$`, `\`, and backtick characters, none
 * of which can appear inside a JavaScript template literal without
 * escaping. We build scripts out of string arrays instead.
 */

export const SUPPORTED_SHELLS = ["bash", "zsh", "fish", "powershell"] as const;
export type SupportedShell = (typeof SUPPORTED_SHELLS)[number];

export const COMMANDS = [
  "import",
  "decks",
  "stats",
  "search",
  "update",
  "validate",
  "completion",
] as const;

export const GLOBAL_FLAGS = [
  "--url",
  "--json",
  "--dry-run",
  "--no-color",
  "--quiet",
  "--help",
  "--version",
] as const;

/** Map of command → flags it accepts (beyond the globals). */
export const COMMAND_FLAGS: Record<(typeof COMMANDS)[number], readonly string[]> = {
  import: ["--auto-create-deck", "--no-auto-create-deck"],
  decks: [],
  stats: ["--deck"],
  search: ["--deck", "--tag", "--limit", "--query"],
  update: ["--id", "--ids", "--file", "--field", "--tags"],
  validate: ["--strict"],
  completion: ["--shell"],
};

export function generateCompletion(shell: string): string {
  switch (shell) {
    case "bash":
      return bashCompletion();
    case "zsh":
      return zshCompletion();
    case "fish":
      return fishCompletion();
    case "powershell":
      return powershellCompletion();
    default:
      throw new Error(`Unknown shell: ${shell}`);
  }
}

function bashCompletion(): string {
  const commands = COMMANDS.join(" ");
  const flags = GLOBAL_FLAGS.join(" ");
  // bash completion uses $compgen / $COMP_WORDS / $COMP_CWORD /
  // $COMPREPLY — these must remain literal in the output.
  const lines: string[] = [
    "# bash completion for anki-xml",
    "# Source this file:  source <(anki-xml completion bash)",
    "",
    "_anki_xml_commands() {",
    '  local cur="${COMP_WORDS[COMP_CWORD]}"',
    '  if [ "${COMP_WORDS[1]}" = "" ]; then',
    `    COMPREPLY=( $(compgen -W "${commands}" -- "$cur") )`,
    "    return 0",
    "  fi",
    '  case "${COMP_WORDS[1]}" in',
    `    import)   COMPREPLY=( $(compgen -W "${flags} --auto-create-deck --no-auto-create-deck <file>" -- "$cur") ) ;;`,
    `    decks)    COMPREPLY=( $(compgen -W "${flags}" -- "$cur") ) ;;`,
    `    stats)    COMPREPLY=( $(compgen -W "${flags} --deck" -- "$cur") ) ;;`,
    `    search)   COMPREPLY=( $(compgen -W "${flags} --deck --tag --limit --query <phrase>" -- "$cur") ) ;;`,
    `    update)   COMPREPLY=( $(compgen -W "${flags} --id --ids --file --field --tags" -- "$cur") ) ;;`,
    `    validate) COMPREPLY=( $(compgen -W "${flags} --strict <file>" -- "$cur") ) ;;`,
    `    completion) COMPREPLY=( $(compgen -W "bash zsh fish powershell" -- "$cur") ) ;;`,
    "    *)        COMPREPLY=() ;;",
    "  esac",
    "  return 0",
    "}",
    "",
    "complete -F _anki_xml_commands anki-xml",
    "",
  ];
  return lines.join("\n");
}

function zshCompletion(): string {
  // zsh completion needs $state, $words, $fpath, etc. to survive
  // unescaped into the output script.
  const commandEntries = COMMANDS.map((c) => `  ${c}:description`).join("\n");
  const lines: string[] = [
    "#compdef anki-xml",
    "# zsh completion for anki-xml",
    "# Place in a directory on $fpath, then run 'compdef _anki-xml anki-xml'.",
    "",
    "_anki-xml() {",
    "  local -a commands",
    "  commands=(",
    commandEntries,
    "  )",
    "  _arguments -C \\",
    "    '1: :->command' \\",
    "    '*:: :->args' \\",
    "    '--url[AnkiConnect URL]:url:' \\",
    "    '--json[Emit JSON]' \\",
    "    '--dry-run[Do not mutate]' \\",
    "    '--no-color[Strip ANSI]' \\",
    "    '--quiet[Summary only]' \\",
    "    '(-h --help)'{-h,--help}'[Show help]' \\",
    "    '(-v --version)'{-v,--version}'[Show version]'",
    "",
    "  case $state in",
    "    command)",
    "      _describe 'command' commands",
    "      ;;",
    "    args)",
    "      case $words[1] in",
    "        import)",
    "          _arguments '--auto-create-deck[Create missing decks]' '--no-auto-create-deck[Fail on missing decks]' '*:file:_files'",
    "          ;;",
    "        stats)",
    "          _arguments '--deck[Deck name]:deck:'",
    "          ;;",
    "        search)",
    "          _arguments '--deck[Deck name]:deck:' '--tag[Tag]:tag:' '--limit[Limit]:n:' '--query[Query]:query:' '*:phrase:'",
    "          ;;",
    "        update)",
    "          _arguments '--id[Note id]:id:' '--ids[Note ids]:ids:' '--file[File]:file:_files' '--field[Field]:field:' '--tags[Tags]:tags:'",
    "          ;;",
    "        validate)",
    "          _arguments '--strict[Strict mode]' '*:file:_files'",
    "          ;;",
    "        completion)",
    "          _arguments '1:shell:(bash zsh fish powershell)'",
    "          ;;",
    "      esac",
    "      ;;",
    "  esac",
    "}",
    "",
    "_anki-xml \"$@\"",
    "",
  ];
  return lines.join("\n");
}

function fishCompletion(): string {
  const lines: string[] = ["# fish completion for anki-xml", ""];

  for (const cmd of COMMANDS) {
    lines.push(`complete -c anki-xml -n "__fish_use_subcommand" -a "${cmd}"`);
  }

  // Global flags (available on every subcommand).
  lines.push(`complete -c anki-xml -l url -d "AnkiConnect URL"`);
  lines.push(`complete -c anki-xml -l json -d "Emit JSON"`);
  lines.push(`complete -c anki-xml -l dry-run -d "Do not mutate"`);
  lines.push(`complete -c anki-xml -l no-color -d "Strip ANSI"`);
  lines.push(`complete -c anki-xml -l quiet -d "Summary only"`);
  lines.push(`complete -c anki-xml -l help -d "Show help" -s h`);
  lines.push(`complete -c anki-xml -l version -d "Show version" -s v`);

  // Per-command flags.
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from import" -l auto-create-deck`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from import" -l no-auto-create-deck`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from stats search" -l deck`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from search" -l tag`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from search" -l limit`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from search" -l query`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from update" -l id`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from update" -l ids`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from update" -l file -r`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from update" -l field -r`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from update" -l tags -r`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from validate" -l strict`);
  lines.push(`complete -c anki-xml -n "__fish_seen_subcommand_from completion" -l shell`);

  lines.push("");
  return lines.join("\n");
}

function powershellCompletion(): string {
  const commands = COMMANDS.map((c) => `'${c}'`).join(", ");
  const flags = GLOBAL_FLAGS.map((f) => `'${f}'`).join(", ");
  // PowerShell uses `$wordToComplete`, `$commandAst`, `$cursorPosition`,
  // `$tokens`, `$PROFILE` etc. — these must remain literal in the output.
  const lines: string[] = [
    "# powershell completion for anki-xml",
    "# Add to your $PROFILE:",
    "#   anki-xml completion powershell | Out-String | Invoke-Expression",
    "",
    "Register-ArgumentCompleter -Native -CommandName 'anki-xml' -ScriptBlock {",
    "  param($wordToComplete, $commandAst, $cursorPosition)",
    "",
    `  $commands = @(${commands})`,
    `  $flags = @(${flags})`,
    "",
    "  $tokens = $commandAst.Tokenize()",
    "  if ($tokens.Count -le 2) {",
    `    $commands | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {`,
    "      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)",
    "    }",
    "  } else {",
    `    $flags | Where-Object { $_ -like "$wordToComplete*" } | ForEach-Object {`,
    "      [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterName', $_)",
    "    }",
    "  }",
    "}",
    "",
  ];
  return lines.join("\n");
}