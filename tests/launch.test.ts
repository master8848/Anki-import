import { describe, expect, it } from "vitest";
import { ankiLaunchCommand } from "@anki-xml/anki";

describe("ankiLaunchCommand", () => {
  it("gives a runnable command for macOS", () => {
    const c = ankiLaunchCommand("darwin");
    expect(c.command).toBe("open -a Anki");
    expect(c.alternatives).toContain("open /Applications/Anki.app");
  });

  it("gives a runnable command for Windows", () => {
    const c = ankiLaunchCommand("win32");
    expect(c.command).toBe('start "" "Anki"');
    expect(c.alternatives).toContain('"C:\\Program Files\\Anki\\anki.exe"');
  });

  it("gives a runnable command for Linux", () => {
    const c = ankiLaunchCommand("linux");
    expect(c.command).toBe("anki");
    expect(c.alternatives).toContain("flatpak run net.ankiweb.Anki");
  });

  it("never returns an empty command for unknown platforms", () => {
    const c = ankiLaunchCommand("freebsd");
    expect(c.command.length).toBeGreaterThan(0);
  });
});
