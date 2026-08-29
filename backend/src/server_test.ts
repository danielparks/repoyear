import { assertEquals, assertThrows } from "@std/assert";
import { parseBindAddress, serve } from "./server.ts";
import { createLogger, Level } from "./logging.ts";

Deno.test("parseBindAddress: host:port", () => {
  assertEquals(parseBindAddress("127.0.0.1:3000"), {
    hostname: "127.0.0.1",
    port: 3000,
  });
  assertEquals(parseBindAddress("localhost:8080"), {
    hostname: "localhost",
    port: 8080,
  });
});

Deno.test("parseBindAddress: bracketed IPv6", () => {
  assertEquals(parseBindAddress("[::1]:3000"), {
    hostname: "::1",
    port: 3000,
  });
});

Deno.test("parseBindAddress: rejects missing port", () => {
  assertThrows(() => parseBindAddress("127.0.0.1"));
});

Deno.test("parseBindAddress: rejects out-of-range port", () => {
  assertThrows(() => parseBindAddress("127.0.0.1:99999"));
});

Deno.test("serve: actually serves the app on the given port", async () => {
  const server = serve("127.0.0.1:0", {
    githubClientId: "id",
    githubClientSecret: "secret",
    scanConfig: undefined,
    version: "test",
    logger: createLogger(Level.Silent),
  });

  try {
    const address = server.addr as Deno.NetAddr;
    const res = await fetch(`http://127.0.0.1:${address.port}/api/health`);
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { status: "ok" });
  } finally {
    await server.shutdown();
  }
});
