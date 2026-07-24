/**
 * Tests for the shell completion script generators.
 */

import { describe, expect, test } from "bun:test";
import {
  COMMANDS,
  COMMAND_FLAGS,
  GLOBAL_FLAGS,
  SUPPORTED_SHELLS,
  generateCompletion,
} from "../src/completion.ts";

describe("completion metadata", () => {
  test("SUPPORTED_SHELLS contains bash, zsh, fish, powershell", () => {
    expect(SUPPORTED_SHELLS).toContain("bash");
    expect(SUPPORTED_SHELLS).toContain("zsh");
    expect(SUPPORTED_SHELLS).toContain("fish");
    expect(SUPPORTED_SHELLS).toContain("powershell");
  });

  test("COMMANDS includes all shipping commands", () => {
    expect(COMMANDS).toContain("import");
    expect(COMMANDS).toContain("decks");
    expect(COMMANDS).toContain("stats");
    expect(COMMANDS).toContain("search");
    expect(COMMANDS).toContain("update");
    expect(COMMANDS).toContain("validate");
    expect(COMMANDS).toContain("completion");
  });

  test("COMMAND_FLAGS covers every command", () => {
    for (const cmd of COMMANDS) {
      expect(COMMAND_FLAGS[cmd]).toBeDefined();
    }
  });

  test("GLOBAL_FLAGS includes --json, --help, --version, --url", () => {
    expect(GLOBAL_FLAGS).toContain("--json");
    expect(GLOBAL_FLAGS).toContain("--help");
    expect(GLOBAL_FLAGS).toContain("--version");
    expect(GLOBAL_FLAGS).toContain("--url");
  });
});

describe("generateCompletion", () => {
  test("bash output mentions every command", () => {
    const out = generateCompletion("bash");
    for (const cmd of COMMANDS) {
      expect(out).toContain(cmd);
    }
    expect(out).toContain("complete -F _anki_xml_commands");
  });

  test("zsh output is a #compdef script with every command", () => {
    const out = generateCompletion("zsh");
    expect(out.startsWith("#compdef")).toBe(true);
    expect(out).toContain("_anki-xml()");
    for (const cmd of COMMANDS) {
      expect(out).toContain(`${cmd}:description`);
    }
  });

  test("fish output has a complete line per command", () => {
    const out = generateCompletion("fish");
    for (const cmd of COMMANDS) {
      expect(out).toContain(`-a "${cmd}"`);
    }
    // Fish uses `-l <name>` instead of `--<name>`; check for the bare names.
    expect(out).toContain("-l help");
    expect(out).toContain("-l version");
    expect(out).toContain("-l json");
  });

  test("powershell output registers an argument completer", () => {
    const out = generateCompletion("powershell");
    expect(out).toContain("Register-ArgumentCompleter");
    expect(out).toContain("anki-xml");
    for (const cmd of COMMANDS) {
      expect(out).toContain(`'${cmd}'`);
    }
  });

  test("unknown shell throws", () => {
    expect(() => generateCompletion("elvish")).toThrow(/Unknown shell/);
  });
});