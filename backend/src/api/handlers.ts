// Business logic behind the API endpoints.

import type { Config } from "../repos/config.ts";
import { configRepoIter } from "../repos/config.ts";
import { scanRepo } from "../repos/scan.ts";
import type { Logger } from "../logging.ts";

export interface AppState {
  githubClientId: string;
  githubClientSecret: string;
  scanConfig: Config | undefined;
  version: string;
  logger: Logger;
}

/** Get contributions for all locally-configured repositories. */
export async function getContributions(
  state: AppState,
): Promise<Record<string, number[]>> {
  if (state.scanConfig === undefined) {
    return {};
  }

  const result: Record<string, number[]> = {};
  for await (const item of configRepoIter(state.scanConfig)) {
    if ("error" in item) {
      state.logger.warn(item.error.message);
      continue;
    }
    try {
      result[item.name] = await scanRepo(item.path);
    } catch (error) {
      state.logger.warn(String(error));
    }
  }
  return result;
}
