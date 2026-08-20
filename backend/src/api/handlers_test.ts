import { assertEquals } from "@std/assert";
import { getContributions } from "./handlers.ts";
import { createLogger, Level } from "../logging.ts";
import { Home, tempDir } from "../test/fixtures.ts";

const baseState = {
  githubClientId: "id",
  githubClientSecret: "secret",
  version: "test",
  logger: createLogger(Level.Silent),
};

Deno.test("getContributions with no scan config returns empty", async () => {
  assertEquals(
    await getContributions({ ...baseState, scanConfig: null }),
    {},
  );
});

Deno.test("getContributions scans configured repos", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);

  const result = await getContributions({
    ...baseState,
    scanConfig: { repos: [{ root: repo.path, replaceRoot: "BASE" }] },
  });

  assertEquals(Object.keys(result), ["BASE"]);
  assertEquals(result.BASE.length, 1);
});

Deno.test("getContributions skips repos that fail to scan", async () => {
  const home = await Home.init(await tempDir());
  const good = await home.gitInit("good");
  await good.makeCommit(0);
  const empty = await home.gitInit("empty"); // no commits: fails to scan

  const result = await getContributions({
    ...baseState,
    scanConfig: {
      repos: [
        { root: good.path, replaceRoot: "GOOD" },
        { root: empty.path, replaceRoot: "EMPTY" },
      ],
    },
  });

  assertEquals(Object.keys(result), ["GOOD"]);
});
