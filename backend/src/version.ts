// Application version.

import { parse as parseJsonc } from "@std/jsonc";

/**
 * Get the package's own semver, from `deno.jsonc`'s `version` field.
 *
 * Used only for the generated OpenAPI spec's `info.version` -- the TS
 * equivalent of the Rust build's `CARGO_PKG_VERSION` (which is what the
 * Rust `openapi` subcommand used, deliberately *not* `GIT_VERSION`, so the
 * spec's version only changes on an actual release, not every commit).
 */
export async function getPackageVersion(): Promise<string> {
  const configUrl = new URL("../deno.jsonc", import.meta.url);
  const data = parseJsonc(await Deno.readTextFile(configUrl));
  const version = (data as Record<string, unknown>).version;
  if (typeof version !== "string") {
    throw new Error("deno.jsonc is missing a `version` field");
  }
  return version;
}

/**
 * Get the application's build/git identity.
 *
 * Prefers `REPOYEAR_VERSION` (meant to be baked in at `deno compile` time,
 * the TS equivalent of the Rust build's `GIT_VERSION` env-at-compile-time
 * trick), then falls back to `git describe` for local development, then
 * `"unknown"`. Used for the `version` CLI subcommand and `/api/version` --
 * *not* the OpenAPI spec, see `getPackageVersion`.
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
