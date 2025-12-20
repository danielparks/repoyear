#!/usr/bin/env -S deno run -A

import { type Contributions, GitHub } from "../src/github/api.ts";
import * as path from "@std/path";

const USAGE = `Usage: generate-fixture.ts [options] [USERNAME]

or, more typically

  GITHUB_READONLY_TOKEN=ghp_xxx deno run generate:fixture [USERNAME]

Generates a fixture file from real GitHub API data.

Options:
  --token <TOKEN>  GitHub personal access (classic) token with minimal access.
                   May be passed with $GITHUB_READONLY_TOKEN or $GITHUB_TOKEN.
  --help           Show this output.`;

function parseArgs() {
  const args = Deno.args;
  let token = Deno.env.get("GITHUB_READONLY_TOKEN") ||
    Deno.env.get("GITHUB_TOKEN");
  let username: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") {
      console.log(USAGE);
      Deno.exit(0);
    } else if (arg === "--token") {
      i++;
      if (i >= args.length) {
        throw new Error(`${arg} requires an argument`);
      }
      token = args[i];
    } else if (arg.startsWith("-")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      if (username) {
        throw new Error(`Multiple usernames specified: ${username}, ${arg}`);
      }
      username = arg;
    }
  }

  if (!token) {
    console.error(`Error: GitHub token required\n\n${USAGE}`);
    Deno.exit(1);
  }

  return { token, username };
}

async function main() {
  const { token, username } = parseArgs();

  const fixturePath = path.join(
    import.meta.dirname || "scripts",
    "../src/__fixtures__/github-contributions.json",
  );

  const directory = path.dirname(fixturePath);
  try {
    if (!(await Deno.stat(directory)).isDirectory) {
      throw new Error(`${directory} is not a directory`);
    }
  } catch (error: unknown) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Fixtures directory (${directory}) does not exist`);
    }
    throw error;
  }

  if (username) {
    console.log(`Fetching contributions from GitHub for user ${username}`);
  } else {
    console.log(`Fetching contributions from GitHub for authenticated user`);
  }

  const github = new GitHub(token);
  const contributions: Contributions[] = [];

  for await (const contribution of github.queryBase(username)) {
    contributions.push(contribution);

    const commitCount = contribution.commits.map(
      ({ contributions }) =>
        (contributions.nodes ?? []).map(
          (node) => node?.commitCount ?? 0,
        ),
    ).flat().reduce((sum, n) => sum + n, 0);

    console.log(
      `Update ${contributions.length} (` +
        `${commitCount} commits, ` +
        `${contribution.issues.length} issues, ` +
        `${contribution.prs.length} PRs, ` +
        `${contribution.reviews.length} PR reviews, ` +
        `${contribution.repositories.length} new repos)`,
    );
  }

  await Deno.writeTextFile(
    fixturePath,
    JSON.stringify(contributions, null, 2) + "\n",
  );

  const { size } = await Deno.stat(fixturePath);
  console.log(`\nFixture saved to: ${fixturePath} (${size} bytes)`);

  Deno.exit(0);
}

main().catch((error) => {
  console.error("Error:", error instanceof Error ? error.message : error);
  Deno.exit(1);
});
