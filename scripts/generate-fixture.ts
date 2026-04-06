#!/usr/bin/env -S deno run -A

import { type Contributions, GitHub } from "../src/github/api.ts";
import * as path from "@std/path";

const DEFAULT_OUTPUT = path.join(
  import.meta.dirname || ".",
  "../src/__fixtures__/github.json",
);

const USAGE = `Usage: generate-fixture.ts [options] [USERNAME]

or, more typically

  GITHUB_READONLY_TOKEN=ghp_xxx deno run generate:fixture [USERNAME]

Generates a fixture file from real GitHub API data.

Options:
  --token <TOKEN>  GitHub personal access (classic) token with minimal access.
                   May be passed with $GITHUB_READONLY_TOKEN or $GITHUB_TOKEN.
  --years <N>      Number of years to fetch (default: 1). Each year is a
                   rolling ~52-week window. Year 0 is the most recent data;
                   year 1 is the ~52 weeks before that, etc.
  --output <PATH>  Output path (default: src/__fixtures__/github.json).
  --help           Show this output.`;

function parseArgs() {
  const args = Deno.args;
  let token = Deno.env.get("GITHUB_READONLY_TOKEN") ||
    Deno.env.get("GITHUB_TOKEN");
  let username: string | undefined;
  let years = 1;
  let output: string | undefined;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help") {
      console.log(USAGE);
      Deno.exit(0);
    } else if (arg === "--token") {
      i++;
      if (i >= args.length) throw new Error(`${arg} requires an argument`);
      token = args[i];
    } else if (arg === "--years") {
      i++;
      if (i >= args.length) throw new Error(`${arg} requires an argument`);
      years = parseInt(args[i], 10);
      if (isNaN(years) || years < 1) {
        throw new Error(`--years must be a positive integer`);
      }
    } else if (arg === "--output") {
      i++;
      if (i >= args.length) throw new Error(`${arg} requires an argument`);
      output = args[i];
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

  return { token, username, years, output };
}

async function main() {
  const { token, username, years, output } = parseArgs();

  const fixturePath = output ? path.resolve(output) : DEFAULT_OUTPUT;

  const directory = path.dirname(fixturePath);
  try {
    if (!(await Deno.stat(directory)).isDirectory) {
      throw new Error(`${directory} is not a directory`);
    }
  } catch (error: unknown) {
    if (error instanceof Deno.errors.NotFound) {
      throw new Error(`Output directory (${directory}) does not exist`);
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
  let from: string | undefined;
  let to: string | undefined;

  for (let year = 0; year < years; year++) {
    if (year > 0) {
      console.log(`\nFetching year ${year} (${from} - ${to})`);
    }

    let calendarStart: string | undefined;

    for await (const contribution of github.queryBase(username, { from, to })) {
      contributions.push(contribution);

      // Extract the calendar start date from the first chunk so we can derive
      // the date range for the next (earlier) year.
      if (calendarStart === undefined && contribution.calendar) {
        calendarStart = contribution.calendar.weeks[0]?.contributionDays[0]
          ?.date;
      }

      const commitCount = contribution.commits.map(
        ({ contributions }) =>
          (contributions.nodes ?? []).map(
            (node) => node?.commitCount ?? 0,
          ),
      ).flat().reduce((sum, n) => sum + n, 0);

      console.log(
        `  chunk ${contributions.length} (` +
          `${commitCount} commits, ` +
          `${contribution.issues.length} issues, ` +
          `${contribution.prs.length} PRs, ` +
          `${contribution.reviews.length} PR reviews, ` +
          `${contribution.repositories.length} new repos)`,
      );
    }

    if (year + 1 < years) {
      if (!calendarStart) {
        throw new Error(
          `Could not determine calendar start date from year ${year} data`,
        );
      }
      // The next earlier year ends the day before this year's calendar start,
      // and spans 52 weeks (364 days) before that.
      const start = new Date(calendarStart + "T00:00:00Z");
      const prevEnd = new Date(start.getTime() - 1 * 86400_000);
      const prevStart = new Date(start.getTime() - 364 * 86400_000);
      from = prevStart.toISOString();
      to = prevEnd.toISOString();
    }
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
