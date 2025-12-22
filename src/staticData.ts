import {
  type Contributions,
  CONTRIBUTIONS_QUERY_TEMPLATE,
} from "./github/api.ts";
import { encodeHex } from "@std/encoding/hex";

/**
 * Version number for the static data file format.
 */
export const STATIC_DATA_SCHEMA_VERSION = 2;

/**
 * Data format for the JSON file storing data for static mode.
 */
export interface StaticDataFile {
  schemaVersion: number;
  queryHash: string;
  generatedAt: string;
  contributions: Contributions[];
}

/**
 * Generates a SHA-256 hash of the contributions query template.
 */
export async function getQueryHash(): Promise<string> {
  const data = new TextEncoder().encode(CONTRIBUTIONS_QUERY_TEMPLATE);
  return encodeHex(await crypto.subtle.digest("SHA-256", data));
}
