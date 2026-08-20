// repoyear-backend executable.

import type { Command } from "./params.ts";
import { parseParams } from "./params.ts";
import { createLogger, Level, type Logger } from "./logging.ts";
import { getPackageVersion, getVersion } from "./version.ts";
import { configRepoIter, parseConfig } from "./repos/config.ts";
import { scanRepo, scanRepoPath } from "./repos/scan.ts";
import { serve } from "./server.ts";
import { createApp } from "./api/app.ts";
import type { AppState } from "./api/handlers.ts";

/** Run one `scan`/`scan-repo`-style pass over a config, as JSON to stdout. */
async function scanConfigToStdout(
  configPath: string,
  logger: Logger,
): Promise<void> {
  const config = parseConfig(await Deno.readTextFile(configPath));
  const result: Record<string, number[]> = {};
  for await (const item of configRepoIter(config)) {
    if ("error" in item) {
      logger.warn(item.error.message);
      continue;
    }
    try {
      result[item.name] = await scanRepo(item.path);
    } catch (error) {
      logger.warn(String(error));
    }
  }
  console.log(JSON.stringify(result));
}

async function run(command: Command, logger: Logger): Promise<void> {
  const version = await getVersion();

  switch (command.kind) {
    case "serve": {
      const scanConfig = command.scanConfig
        ? parseConfig(await Deno.readTextFile(command.scanConfig))
        : null;
      const state: AppState = {
        githubClientId: command.githubClientId,
        githubClientSecret: command.githubClientSecret,
        scanConfig,
        version,
        logger,
      };
      await serve(command.bind, state).finished;
      return;
    }

    case "scan":
      await scanConfigToStdout(command.config, logger);
      return;

    case "scan-repo": {
      const result: Record<string, number[]> = {};
      for (const path of command.repositories) {
        try {
          result[path] = await scanRepoPath(path);
        } catch (error) {
          logger.error(`Error in ${JSON.stringify(path)}: ${error}`);
        }
      }
      console.log(JSON.stringify(result));
      return;
    }

    case "openapi": {
      // Only the route shapes matter for the spec; the state's
      // credentials/config are never consulted while generating it. Uses the
      // package version (deno.jsonc), not the git-describe `version`.
      const state: AppState = {
        githubClientId: "",
        githubClientSecret: "",
        scanConfig: null,
        version: await getPackageVersion(),
        logger,
      };
      const res = await createApp(state).request("/api/openapi.json");
      const json = `${JSON.stringify(await res.json(), null, 2)}\n`;
      if (command.output !== undefined) {
        await Deno.writeTextFile(command.output, json);
      } else {
        console.log(json);
      }
      return;
    }

    case "version":
      console.log(version);
      return;
  }
}

async function main(): Promise<void> {
  try {
    const command = parseParams(Deno.args);
    await run(command, createLogger(Level.Info));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Deno.stderr.writeSync(new TextEncoder().encode(`Error: ${message}\n`));
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
