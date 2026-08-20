import { assertEquals, assertMatch } from "@std/assert";
import { getPackageVersion, getVersion } from "./version.ts";

Deno.test("getPackageVersion reads deno.jsonc's version field", async () => {
  assertMatch(await getPackageVersion(), /^\d+\.\d+\.\d+$/);
});

Deno.test("getVersion prefers REPOYEAR_VERSION", async () => {
  Deno.env.set("REPOYEAR_VERSION", "v9.9.9-test");
  try {
    assertEquals(await getVersion(), "v9.9.9-test");
  } finally {
    Deno.env.delete("REPOYEAR_VERSION");
  }
});
