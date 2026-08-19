import { assertEquals } from "@std/assert";
import { exchangeOAuthToken, refreshOAuthToken } from "./github.ts";
import { createLogger, Level } from "../logging.ts";

const credentials = {
  githubClientId: "client-id",
  githubClientSecret: "client-secret",
};

const silentLogger = createLogger(Level.Silent);

function withFetch<T>(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

Deno.test("exchangeOAuthToken success", async () => {
  const result = await withFetch(
    (_input, init) => {
      const body = JSON.parse(init?.body as string);
      assertEquals(body, {
        client_id: "client-id",
        client_secret: "client-secret",
        code: "the-code",
      });
      return Promise.resolve(
        new Response(
          JSON.stringify({
            access_token: "abc123",
            refresh_token: "refresh123",
            expires_in: 28_800,
            refresh_token_expires_in: 15_897_600,
          }),
        ),
      );
    },
    () => exchangeOAuthToken(credentials, "the-code", silentLogger),
  );

  assertEquals(result, {
    ok: true,
    value: {
      access_token: "abc123",
      refresh_token: "refresh123",
      expires_in: 28_800,
      refresh_token_expires_in: 15_897_600,
    },
  });
});

Deno.test("exchangeOAuthToken GitHub error", async () => {
  const result = await withFetch(
    () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: "bad_verification_code",
            error_description: "The code passed is incorrect or expired.",
          }),
        ),
      ),
    () => exchangeOAuthToken(credentials, "bad-code", silentLogger),
  );

  assertEquals(result, {
    ok: false,
    error: "The code passed is incorrect or expired.",
  });
});

Deno.test("exchangeOAuthToken GitHub error without description", async () => {
  const result = await withFetch(
    () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: "server_error" })),
      ),
    () => exchangeOAuthToken(credentials, "code", silentLogger),
  );

  assertEquals(result, { ok: false, error: "OAuth failed" });
});

Deno.test("exchangeOAuthToken network failure", async () => {
  const result = await withFetch(
    () => Promise.reject(new Error("network down")),
    () => exchangeOAuthToken(credentials, "code", silentLogger),
  );

  assertEquals(result, {
    ok: false,
    error: "Service temporarily unavailable",
  });
});

Deno.test("exchangeOAuthToken unparsable response", async () => {
  const result = await withFetch(
    () => Promise.resolve(new Response("not json")),
    () => exchangeOAuthToken(credentials, "code", silentLogger),
  );

  assertEquals(result, { ok: false, error: "Internal server error" });
});

Deno.test("exchangeOAuthToken missing access_token", async () => {
  const result = await withFetch(
    () => Promise.resolve(new Response(JSON.stringify({}))),
    () => exchangeOAuthToken(credentials, "code", silentLogger),
  );

  assertEquals(result, { ok: false, error: "Internal server error" });
});

Deno.test("refreshOAuthToken sends grant_type and refresh_token", async () => {
  const result = await withFetch(
    (_input, init) => {
      const body = JSON.parse(init?.body as string);
      assertEquals(body, {
        client_id: "client-id",
        client_secret: "client-secret",
        grant_type: "refresh_token",
        refresh_token: "the-refresh-token",
      });
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: "new-token" })),
      );
    },
    () => refreshOAuthToken(credentials, "the-refresh-token", silentLogger),
  );

  assertEquals(result, {
    ok: true,
    value: {
      access_token: "new-token",
      refresh_token: undefined,
      expires_in: undefined,
      refresh_token_expires_in: undefined,
    },
  });
});
