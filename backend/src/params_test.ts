import { assertEquals, assertThrows } from "@std/assert";
import { ArgError, parseParams } from "./params.ts";

const noEnv = {};

Deno.test("serve: defaults and required flags from argv", () => {
  const command = parseParams(
    [
      "serve",
      "--github-client-id",
      "id",
      "--github-client-secret",
      "secret",
    ],
    noEnv,
  );
  assertEquals(command, {
    kind: "serve",
    bind: "127.0.0.1:3000",
    githubClientId: "id",
    githubClientSecret: "secret",
    scanConfig: undefined,
  });
});

Deno.test("serve: flags override env vars", () => {
  const command = parseParams(
    ["serve", "--github-client-id", "flag-id"],
    {
      GITHUB_CLIENT_ID: "env-id",
      GITHUB_CLIENT_SECRET: "env-secret",
      BIND: "0.0.0.0:8080",
    },
  );
  if (command.kind !== "serve") throw new Error("expected serve");
  assertEquals(command.githubClientId, "flag-id");
  assertEquals(command.githubClientSecret, "env-secret");
  assertEquals(command.bind, "0.0.0.0:8080");
});

Deno.test("serve: missing client id throws", () => {
  assertThrows(
    () => parseParams(["serve", "--github-client-secret", "secret"], noEnv),
    ArgError,
    "GITHUB_CLIENT_ID",
  );
});

Deno.test("serve: missing client secret throws", () => {
  assertThrows(
    () => parseParams(["serve", "--github-client-id", "id"], noEnv),
    ArgError,
    "GITHUB_CLIENT_SECRET",
  );
});

Deno.test("scan: takes exactly one positional config path", () => {
  const command = parseParams(["scan", "config.jsonc"], noEnv);
  assertEquals(command, { kind: "scan", config: "config.jsonc" });
});

Deno.test("scan: rejects zero or multiple args", () => {
  assertThrows(() => parseParams(["scan"], noEnv), ArgError);
  assertThrows(() => parseParams(["scan", "a", "b"], noEnv), ArgError);
});

Deno.test("scan-repo: takes one or more positional paths", () => {
  const command = parseParams(["scan-repo", "a", "b", "c"], noEnv);
  assertEquals(command, {
    kind: "scan-repo",
    repositories: ["a", "b", "c"],
  });
});

Deno.test("scan-repo: rejects zero args", () => {
  assertThrows(() => parseParams(["scan-repo"], noEnv), ArgError);
});

Deno.test("openapi: output is optional", () => {
  assertEquals(parseParams(["openapi"], noEnv), {
    kind: "openapi",
    output: undefined,
  });
  assertEquals(
    parseParams(["openapi", "-o", "out.json"], noEnv),
    { kind: "openapi", output: "out.json" },
  );
  assertEquals(
    parseParams(["openapi", "--output", "out.json"], noEnv),
    { kind: "openapi", output: "out.json" },
  );
});

Deno.test("version: takes no arguments", () => {
  assertEquals(parseParams(["version"], noEnv), { kind: "version" });
  assertThrows(() => parseParams(["version", "extra"], noEnv), ArgError);
});

Deno.test("no subcommand throws", () => {
  assertThrows(() => parseParams([], noEnv), ArgError, "subcommand");
});

Deno.test("unknown subcommand throws", () => {
  assertThrows(() => parseParams(["bogus"], noEnv), ArgError);
});
