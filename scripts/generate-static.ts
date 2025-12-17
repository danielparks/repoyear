#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net --allow-env

import { GitHub } from "../src/github/api.ts";
import type { Contributions } from "../src/github/api.ts";

interface Args {
  username: string;
  tokenFile: string;
  verbose: boolean;
  outputFile: string;
}

const USAGE = `Usage: generate-static.ts [options] <username>

Options:
  -t, --token-file <file>  Path to file containing GitHub token
                           (default: .github-token)
  -o, --output <file>      Path to JSON file to generate
                           (default: dist/assets/contributions.json)
  -v, --verbose            Enable verbose output
  --help                   Show this output.`;

/**
 * Parses command-line arguments.
 */
function parseArgs(): Args {
  const args = Deno.args;
  let username = "";
  let tokenFile = ".github-token";
  let verbose = false;
  let outputFile = "dist/assets/contributions.json";

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") {
      console.log(USAGE);
      Deno.exit(0);
    } else if (arg === "--verbose" || arg === "-v") {
      verbose = true;
    } else if (arg === "--token-file" || arg === "-t") {
      i++;
      if (i >= args.length) {
        throw new Error(`${arg} requires an argument`);
      }
      tokenFile = args[i];
    } else if (arg === "--output" || arg === "-o") {
      i++;
      if (i >= args.length) {
        throw new Error(`${arg} requires an argument`);
      }
      outputFile = args[i];
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (username) {
        throw new Error(`Multiple usernames specified: ${username}, ${arg}`);
      }
      username = arg;
    }
  }

  if (!username) {
    console.error(USAGE);
    Deno.exit(1);
  }

  return { username, tokenFile, verbose, outputFile };
}

/**
 * Reads a GitHub personal access token from a file.
 */
async function readToken(tokenFile: string): Promise<string> {
  const token = (await Deno.readTextFile(tokenFile)).trim();
  if (!token) {
    throw new Error(`Token file ${tokenFile} is empty`);
  }
  return token;
}

/**
 * Fetches all contributions for a GitHub user.
 */
async function fetchContributions(
  token: string,
  username: string,
  verbose: boolean,
): Promise<Contributions[]> {
  if (verbose) {
    console.log(`Fetching contributions for ${username}...`);
  }
  const gh = new GitHub(token);
  if (verbose) {
    gh.installRateLimitReport();
  }

  const contributions: Contributions[] = [];
  for await (const contribution of gh.queryBase(username)) {
    contributions.push(contribution);
  }

  if (verbose) {
    console.log(`Fetched ${contributions.length} contribution batches`);
  }
  return contributions;
}

/**
 * Writes content to a file atomically using a temp file and rename.
 *
 * This ensures the target file is never partially written.
 */
async function atomicWrite(path: string, content: string) {
  let attempt = 1;
  let tempPath = `${path}.temp`;

  while (true) {
    try {
      await Deno.writeTextFile(tempPath, content, { createNew: true });
      break;
    } catch (error: unknown) {
      if (error instanceof Deno.errors.AlreadyExists) {
        attempt++;
        tempPath = `${path}.temp_${attempt.toString()}`;
      } else {
        throw error;
      }
    }
  }

  await Deno.rename(tempPath, path);
}

async function main() {
  try {
    const { username, tokenFile, verbose, outputFile } = parseArgs();

    if (verbose) {
      console.log(`Reading token from ${tokenFile}...`);
    }
    const token = await readToken(tokenFile);

    await atomicWrite(
      outputFile,
      JSON.stringify(await fetchContributions(token, username, verbose)),
    );

    if (verbose) {
      console.log(`Generated ${outputFile}`);
    }
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : error);
    Deno.exit(1);
  }
  Deno.exit(0);
}

main();
