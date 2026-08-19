import { assertEquals } from "@std/assert";
import { createApp } from "./app.ts";
import { createLogger, Level } from "../logging.ts";
import { Home, tempDir } from "../test/fixtures.ts";

function baseState(
  scanConfig: { repos: { root: string; replaceRoot?: string }[] } | null = null,
) {
  return {
    githubClientId: "id",
    githubClientSecret: "secret",
    version: "1.2.3",
    logger: createLogger(Level.Silent),
    scanConfig,
  };
}

Deno.test("GET /api/health", async () => {
  const app = createApp(baseState());
  const res = await app.request("/api/health");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { status: "ok" });
});

Deno.test("GET /api/version", async () => {
  const app = createApp(baseState());
  const res = await app.request("/api/version");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { version: "1.2.3" });
});

Deno.test("GET /api/contributions with no scan config", async () => {
  const app = createApp(baseState());
  const res = await app.request("/api/contributions");
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { repos: {} });
});

Deno.test("GET /api/contributions scans configured repos", async () => {
  const home = await Home.init(await tempDir());
  const repo = await home.gitInit("repo");
  await repo.makeCommit(0);

  const app = createApp(
    baseState({ repos: [{ root: repo.path, replaceRoot: "BASE" }] }),
  );
  const res = await app.request("/api/contributions");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(Object.keys(body.repos), ["BASE"]);
  assertEquals(body.repos.BASE.length, 1);
});

Deno.test("GET /api/oauth/callback requires a code", async () => {
  const app = createApp(baseState());
  const res = await app.request("/api/oauth/callback");
  assertEquals(res.status, 400);
});

Deno.test("GET /api/oauth/callback surfaces GitHub errors as 400", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          error: "bad_verification_code",
          error_description: "expired",
        }),
      ),
    )) as typeof fetch;

  try {
    const app = createApp(baseState());
    const res = await app.request("/api/oauth/callback?code=bad");
    assertEquals(res.status, 400);
    const body = await res.json();
    assertEquals(body.message, "expired");
    assertEquals(typeof body.request_id, "string");
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("GET /api/oauth/callback returns the token on success", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ access_token: "abc123" })),
    )) as typeof fetch;

  try {
    const app = createApp(baseState());
    const res = await app.request("/api/oauth/callback?code=good");
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { access_token: "abc123" });
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("GET /api/openapi.json serves a spec", async () => {
  const app = createApp(baseState());
  const res = await app.request("/api/openapi.json");
  assertEquals(res.status, 200);
  const spec = await res.json();
  assertEquals(spec.info, { title: "RepoYear API", version: "1.2.3" });
  assertEquals(Object.keys(spec.paths).sort(), [
    "/api/contributions",
    "/api/health",
    "/api/oauth/callback",
    "/api/oauth/refresh",
    "/api/version",
  ]);
});
