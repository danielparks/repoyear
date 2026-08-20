import { assertEquals, assertThrows } from "@std/assert";
import { ArgError, parseParams } from "./params.ts";

const noEnv = {};

Deno.test("serve: defaults and required flags from argv", () => {
  const params = parseParams(
    [
      "serve",
      "--github-client-id",
      "id",
      "--github-client-secret",
      "secret",
    ],
    noEnv,
  );
  assertEquals(params, {
    color: "auto",
    quiet: 0,
    command: {
      kind: "serve",
      bind: "127.0.0.1:3000",
      githubClientId: "id",
      githubClientSecret: "secret",
      scanConfig: undefined,
    },
  });
});

Deno.test("serve: flags override env vars", () => {
  const params = parseParams(
    ["serve", "--github-client-id", "flag-id"],
    {
      GITHUB_CLIENT_ID: "env-id",
      GITHUB_CLIENT_SECRET: "env-secret",
      BIND: "0.0.0.0:8080",
    },
  );
  const command = params.command;
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
  const params = parseParams(["scan", "config.jsonc"], noEnv);
  assertEquals(params.command, { kind: "scan", config: "config.jsonc" });
});

Deno.test("scan: rejects zero or multiple args", () => {
  assertThrows(() => parseParams(["scan"], noEnv), ArgError);
  assertThrows(() => parseParams(["scan", "a", "b"], noEnv), ArgError);
});

Deno.test("scan-repo: takes one or more positional paths", () => {
  const params = parseParams(["scan-repo", "a", "b", "c"], noEnv);
  assertEquals(params.command, {
    kind: "scan-repo",
    repositories: ["a", "b", "c"],
  });
});

Deno.test("scan-repo: rejects zero args", () => {
  assertThrows(() => parseParams(["scan-repo"], noEnv), ArgError);
});

Deno.test("openapi: output is optional", () => {
  assertEquals(parseParams(["openapi"], noEnv).command, {
    kind: "openapi",
    output: undefined,
  });
  assertEquals(
    parseParams(["openapi", "-o", "out.json"], noEnv).command,
    { kind: "openapi", output: "out.json" },
  );
  assertEquals(
    parseParams(["openapi", "--output", "out.json"], noEnv).command,
    { kind: "openapi", output: "out.json" },
  );
});

Deno.test("version: takes no arguments", () => {
  assertEquals(parseParams(["version"], noEnv).command, {
    kind: "version",
  });
  assertThrows(() => parseParams(["version", "extra"], noEnv), ArgError);
});

Deno.test("no subcommand throws", () => {
  assertThrows(() => parseParams([], noEnv), ArgError, "subcommand");
});

Deno.test("unknown subcommand throws", () => {
  assertThrows(() => parseParams(["bogus"], noEnv), ArgError);
});

Deno.test("-q repeated counts quiet, up to 3", () => {
  assertEquals(
    parseParams(["-q", "version"], noEnv).quiet,
    1,
  );
  assertEquals(
    parseParams(["-q", "-q", "-q", "version"], noEnv).quiet,
    3,
  );
  assertEquals(
    parseParams(["--quiet", "--quiet", "version"], noEnv).quiet,
    2,
  );
});

Deno.test("-qq stacks like repeated -q", () => {
  assertEquals(parseParams(["-qq", "version"], noEnv).quiet, 2);
  assertEquals(parseParams(["-qqq", "version"], noEnv).quiet, 3);
});

Deno.test("more than three -q throws", () => {
  assertThrows(
    () => parseParams(["-qqqq", "version"], noEnv),
    ArgError,
    "only allowed up to 3",
  );
});

Deno.test("--color accepts auto/always/never", () => {
  assertEquals(
    parseParams(["--color", "always", "version"], noEnv).color,
    "always",
  );
  assertEquals(
    parseParams(["--color=never", "version"], noEnv).color,
    "never",
  );
});

Deno.test("--color rejects invalid values", () => {
  assertThrows(
    () => parseParams(["--color", "purple", "version"], noEnv),
    ArgError,
  );
});
