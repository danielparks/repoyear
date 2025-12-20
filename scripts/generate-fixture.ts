#!/usr/bin/env -S deno run -A
/**
 * Generate a fixture file from real GitHub API data.
 *
 * Usage:
 *   GITHUB_READONLY_TOKEN=ghp_xxx deno run -A scripts/generate-fixture.ts [username]
 *   npm run generate:fixture [username]
 *
 * The token can also be passed via command line:
 *   deno run -A scripts/generate-fixture.ts --token=ghp_xxx [username]
 *
 * Environment variables (in order of precedence):
 *   GITHUB_READONLY_TOKEN - preferred to avoid conflicts with gh CLI
 *   GITHUB_TOKEN - fallback
 */

import { type Contributions, GitHub } from "../src/github/api.ts";

function parseArgs() {
  const args = Deno.args;
  let token = Deno.env.get("GITHUB_READONLY_TOKEN") ||
    Deno.env.get("GITHUB_TOKEN");
  let username: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--token=")) {
      token = arg.slice(8);
    } else if (!arg.startsWith("--")) {
      username = arg;
    }
  }

  if (!token) {
    console.error("Error: GitHub token required");
    console.error(
      "Provide via GITHUB_READONLY_TOKEN or GITHUB_TOKEN environment variable, or --token=xxx argument",
    );
    Deno.exit(1);
  }

  return { token, username };
}

async function main() {
  const { token, username } = parseArgs();

  console.log("Fetching contributions from GitHub...");
  if (username) {
    console.log(`Username: ${username}`);
  } else {
    console.log("Username: (authenticated user)");
  }

  const github = new GitHub(token);
  const contributions: Contributions[] = [];

  for await (const contribution of github.queryBase(username)) {
    contributions.push(contribution);
    console.log(
      `Received update ${contributions.length} (${contribution.commits.length} commit repos, ` +
        `${contribution.issues.length} issues, ${contribution.prs.length} PRs)`,
    );
  }

  console.log(`\nTotal updates received: ${contributions.length}`);

  const fixturePath = new URL(
    "../src/__fixtures__/github-contributions.json",
    import.meta.url,
  );

  await Deno.mkdir(new URL("../src/__fixtures__/", import.meta.url), {
    recursive: true,
  });

  await Deno.writeTextFile(
    fixturePath,
    JSON.stringify(contributions, null, 2),
  );

  console.log(`\nFixture saved to: ${fixturePath.pathname}`);
  console.log(`File size: ${(await Deno.stat(fixturePath)).size} bytes`);

  Deno.exit(0);
}

main().catch((error) => {
  console.error("Error:", error);
  Deno.exit(1);
});
