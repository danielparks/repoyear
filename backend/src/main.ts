// repoyear-backend executable.

import { type Color, type Params, parseParams } from "./params.ts";
import { createLogger, levelFromVerbosity, type Logger } from "./logging.ts";
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

async function run(params: Params, logger: Logger): Promise<void> {
  const version = await getVersion();

  switch (params.command.kind) {
    case "serve": {
      const scanConfig = params.command.scanConfig
        ? parseConfig(await Deno.readTextFile(params.command.scanConfig))
        : null;
      const state: AppState = {
        githubClientId: params.command.githubClientId,
        githubClientSecret: params.command.githubClientSecret,
        scanConfig,
        version,
        logger,
      };
      await serve(params.command.bind, state).finished;
      return;
    }

    case "scan":
      await scanConfigToStdout(params.command.config, logger);
      return;

    case "scan-repo": {
      const result: Record<string, number[]> = {};
      for (const path of params.command.repositories) {
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
      // credentials/config are never consulted while generating it. Uses
      // the package version (deno.jsonc), not the git-describe `version`
      // above -- matches the Rust `openapi` subcommand using
      // CARGO_PKG_VERSION rather than GIT_VERSION, so the spec's version
      // only changes on an actual release.
      const state: AppState = {
        githubClientId: "",
        githubClientSecret: "",
        scanConfig: null,
        version: await getPackageVersion(),
        logger,
      };
      const res = await createApp(state).request("/api/openapi.json");
      const json = `${JSON.stringify(await res.json(), null, 2)}\n`;
      if (params.command.output !== undefined) {
        await Deno.writeTextFile(params.command.output, json);
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

function printError(error: unknown, color: Color): void {
  const message = error instanceof Error ? error.message : String(error);
  const prefix = /^error/i.test(message) ? "" : "Error: ";
  const text = `${prefix}${message}\n`;
  const useColor = color === "always" ||
    (color === "auto" && Deno.stderr.isTerminal());
  const output = useColor ? `\x1b[1;31m${text}\x1b[0m` : text;
  Deno.stderr.writeSync(new TextEncoder().encode(output));
}

async function main(): Promise<void> {
  let params: Params;
  try {
    params = parseParams(Deno.args);
  } catch (error) {
    printError(error, "auto");
    Deno.exit(1);
  }

  const logger = createLogger(levelFromVerbosity(params.verbose));

  try {
    await run(params, logger);
  } catch (error) {
    printError(error, params.color);
    Deno.exit(1);
  }
}

if (import.meta.main) {
  await main();
}
