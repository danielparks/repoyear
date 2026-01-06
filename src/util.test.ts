import { assertArrayIncludes, assertEquals } from "@std/assert";
import { chunk } from "./util.ts";

/**
 * Return `[1, ..., max]`.
 */
function sequence(max: number) {
  const out = new Array(max);
  for (let i = 0; i < max; i++) {
    out[i] = i + 1;
  }
  return out;
}

/**
 * Make chunks easier to compare in debug output.
 */
function strify(chunks: number[][]): string[] {
  return chunks.map((chunk) => chunk.join(""));
}

Deno.test("chunk(sequence(5), 1) returns 1 chunk", () => {
  assertEquals(strify(chunk(sequence(5), 1)), ["12345"]);
});

Deno.test("chunk(sequence(5), 2) returns roughly even chunk sizes", () => {
  assertEquals(strify(chunk(sequence(5), 2)), ["123", "45"]);
});

Deno.test("chunk(sequence(5), 3) returns roughly even chunk sizes", () => {
  assertEquals(strify(chunk(sequence(5), 3)), ["12", "3", "45"]);
});

Deno.test("chunk(sequence(5), 4) returns roughly even chunk sizes", () => {
  assertEquals(strify(chunk(sequence(5), 4)), ["1", "23", "4", "5"]);
});

Deno.test("chunk(sequence(5), 5) returns even chunk sizes", () => {
  assertEquals(strify(chunk(sequence(5), 5)), ["1", "2", "3", "4", "5"]);
});

Deno.test("chunk(sequence(5), 10) returns only 5 chunks", () => {
  assertEquals(strify(chunk(sequence(5), 10)), ["1", "2", "3", "4", "5"]);
});

Deno.test("chunk(sequence(1009), n) returns even chunk sizes", () => {
  const max = 1009;
  const input = sequence(max);
  for (let i = 1; i <= max; i++) {
    const chunked = chunk(input, i);
    assertEquals(chunked.length, i, "number of chunks");
    const minChunkSize = Math.floor(max / i);
    const maxChunkSize = Math.ceil(max / i);
    for (const chunk of chunked) {
      assertArrayIncludes(
        [minChunkSize, maxChunkSize],
        [chunk.length],
        `expected chunk lengths for ${i} chunks`,
      );
    }
  }
});
