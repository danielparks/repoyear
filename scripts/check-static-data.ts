#!/usr/bin/env -S deno run --allow-read

import {
  getQueryHash,
  STATIC_DATA_SCHEMA_VERSION,
  type StaticDataFile,
} from "../src/staticData.ts";

async function main() {
  if (Deno.args.length !== 1) {
    console.error("check-static-data.ts: expected a path");
    Deno.exit(1);
  }

  const path = Deno.args[0];
  try {
    const data = JSON.parse(await Deno.readTextFile(path)) as StaticDataFile;

    if (
      // Check format
      typeof data.schemaVersion !== "number" ||
      typeof data.queryHash !== "string" ||
      typeof data.generatedAt !== "string" ||
      !Array.isArray(data.contributions) ||
      // Check version information
      data.schemaVersion !== STATIC_DATA_SCHEMA_VERSION ||
      data.queryHash !== await getQueryHash()
    ) {
      Deno.exit(1);
    }

    Deno.exit(0);
  } catch {
    Deno.exit(1);
  }
}

main();
