// CLI argument parsing.
//
// Hand-rolled rather than pulled from a library: the surface is small
// (five subcommands, a handful of flags each) and this is a
// single-developer tool, so a generic CLI-parsing dependency isn't worth
// the weight. Doesn't implement --help/usage text -- not worth building
// out for the one person who runs this.

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

export interface Params {
  quiet: number;
  command: Command;
}

export class ArgError extends Error {}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (value === undefined) {
    throw new ArgError(`${flag} requires a value`);
  }
  return value;
}

/** Parse `argv` (i.e. `Deno.args`) into `Params`. */
export function parseParams(
  argv: string[],
  env: Record<string, string | undefined> = Deno.env.toObject(),
): Params {
  let quiet = 0;
  let i = 0;

  // Global flags are only recognized before the subcommand, unlike clap's
  // `global = true` (which allows them anywhere) -- a reasonable
  // simplification for this tool's actual usage.
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--quiet") {
      quiet += 1;
      i += 1;
    } else if (/^-q+$/.test(arg)) {
      quiet += arg.length - 1;
      i += 1;
    } else {
      break;
    }
  }
  if (quiet > 3) {
    throw new ArgError("-q or --quiet is only allowed up to 3 times.");
  }

  const [subcommand, ...subArgs] = argv.slice(i);
  return { quiet, command: parseCommand(subcommand, subArgs, env) };
}

function parseCommand(
  subcommand: string | undefined,
  args: string[],
  env: Record<string, string | undefined>,
): Command {
  switch (subcommand) {
    case "serve":
      return parseServe(args, env);
    case "scan":
      return parseScan(args);
    case "scan-repo":
      return parseScanRepo(args);
    case "openapi":
      return parseOpenapi(args);
    case "version":
      if (args.length > 0) {
        throw new ArgError(`Unknown argument: ${args[0]}`);
      }
      return { kind: "version" };
    case undefined:
      throw new ArgError(
        "A subcommand is required: serve, scan, scan-repo, openapi, version",
      );
    default:
      throw new ArgError(`Unknown subcommand: ${subcommand}`);
  }
}

function parseServe(
  args: string[],
  env: Record<string, string | undefined>,
): Command {
  let bind = env.BIND ?? "127.0.0.1:3000";
  let githubClientId = env.GITHUB_CLIENT_ID;
  let githubClientSecret = env.GITHUB_CLIENT_SECRET;
  let scanConfig = env.SCAN_CONFIG;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--bind") bind = requireValue(args, ++i, arg);
    else if (arg === "--github-client-id") {
      githubClientId = requireValue(args, ++i, arg);
    } else if (arg === "--github-client-secret") {
      githubClientSecret = requireValue(args, ++i, arg);
    } else if (arg === "--scan-config") {
      scanConfig = requireValue(args, ++i, arg);
    } else throw new ArgError(`Unknown argument: ${arg}`);
  }

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
  if (args.length !== 1) {
    throw new ArgError("Usage: scan <config>");
  }
  return { kind: "scan", config: args[0] };
}

function parseScanRepo(args: string[]): Command {
  if (args.length === 0) {
    throw new ArgError("Usage: scan-repo <repository>...");
  }
  return { kind: "scan-repo", repositories: args };
}

function parseOpenapi(args: string[]): Command {
  let output: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-o" || arg === "--output") {
      output = requireValue(args, ++i, arg);
    } else throw new ArgError(`Unknown argument: ${arg}`);
  }
  return { kind: "openapi", output };
}
