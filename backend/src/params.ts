// CLI argument parsing, built on Commander for flag/argument parsing
// mechanics (unknown-option/arity/missing-value checks). `--help` is
// disabled -- not worth building out for the one person who runs this.

import { Command as Program } from "commander";

export type Command =
  | {
    kind: "serve";
    bind: string;
    githubClientId: string;
    githubClientSecret: string;
    scanConfig?: string;
  }
  | { kind: "scan"; config: string }
  | { kind: "scan-repo"; repositories: string[] }
  | { kind: "openapi"; output?: string }
  | { kind: "version" };

export class ArgError extends Error {}

/** A bare Commander program for one subcommand, with errors surfaced as
 * `ArgError` (via a thrown exception) instead of printed + `process.exit`. */
function subcommand(name: string): Program {
  return new Program(name)
    .helpOption(false)
    .exitOverride((err) => {
      throw new ArgError(err.message.replace(/^error: /, ""));
    })
    .configureOutput({ writeErr: () => {} });
}

/** Parse `argv` (i.e. `Deno.args`) into a `Command`. */
export function parseParams(
  argv: string[],
  env: Record<string, string | undefined> = Deno.env.toObject(),
): Command {
  const [name, ...args] = argv;
  switch (name) {
    case "serve":
      return parseServe(args, env);
    case "scan":
      return parseScan(args);
    case "scan-repo":
      return parseScanRepo(args);
    case "openapi":
      return parseOpenapi(args);
    case "version":
      subcommand("version").parse(args, { from: "user" });
      return { kind: "version" };
    case undefined:
      throw new ArgError(
        "A subcommand is required: serve, scan, scan-repo, openapi, version",
      );
    default:
      throw new ArgError(`Unknown subcommand: ${name}`);
  }
}

function parseServe(
  args: string[],
  env: Record<string, string | undefined>,
): Command {
  const cmd = subcommand("serve")
    .option("--bind <addr>")
    .option("--github-client-id <id>")
    .option("--github-client-secret <secret>")
    .option("--scan-config <path>")
    .parse(args, { from: "user" });
  const opts = cmd.opts();

  const bind = opts.bind ?? env.BIND ?? "127.0.0.1:3000";
  const githubClientId = opts.githubClientId ?? env.GITHUB_CLIENT_ID;
  const githubClientSecret = opts.githubClientSecret ??
    env.GITHUB_CLIENT_SECRET;
  const scanConfig = opts.scanConfig ?? env.SCAN_CONFIG;

  if (githubClientId === undefined) {
    throw new ArgError(
      "--github-client-id (or GITHUB_CLIENT_ID) is required",
    );
  }
  if (githubClientSecret === undefined) {
    throw new ArgError(
      "--github-client-secret (or GITHUB_CLIENT_SECRET) is required",
    );
  }

  return {
    kind: "serve",
    bind,
    githubClientId,
    githubClientSecret,
    scanConfig,
  };
}

function parseScan(args: string[]): Command {
  const cmd = subcommand("scan").argument("<config>").parse(args, {
    from: "user",
  });
  return { kind: "scan", config: cmd.args[0] };
}

function parseScanRepo(args: string[]): Command {
  const cmd = subcommand("scan-repo").argument("<repositories...>").parse(
    args,
    { from: "user" },
  );
  return { kind: "scan-repo", repositories: cmd.args };
}

function parseOpenapi(args: string[]): Command {
  const cmd = subcommand("openapi").option("-o, --output <path>").parse(
    args,
    { from: "user" },
  );
  return { kind: "openapi", output: cmd.opts().output };
}
