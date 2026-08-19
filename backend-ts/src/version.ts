// Application version.

/**
 * Get the application version.
 *
 * Prefers `REPOYEAR_VERSION` (meant to be baked in at `deno compile` time,
 * the TS equivalent of the Rust build's `GIT_VERSION` env-at-compile-time
 * trick), then falls back to `git describe` for local development, then
 * `"unknown"`.
 */
export async function getVersion(): Promise<string> {
  const envVersion = Deno.env.get("REPOYEAR_VERSION");
  if (envVersion) return envVersion;

  try {
    const command = new Deno.Command("git", {
      args: ["describe", "--tags", "--always", "--dirty"],
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "piped",
      stderr: "null",
    });
    const { success, stdout } = await command.output();
    if (success) {
      const version = new TextDecoder().decode(stdout).trim();
      if (version.length > 0) return version;
    }
  } catch {
    // `git` not available, or this isn't a git checkout; fall through.
  }

  return "unknown";
}
