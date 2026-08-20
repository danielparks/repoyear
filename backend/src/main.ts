// repoyear-backend executable.

import { Command, Option } from "commander";
import { createLogger, Level, type Logger } from "./logging.ts";
import { getPackageVersion, getVersion } from "./version.ts";
import { type Config, configRepoIter, parseConfig } from "./repos/config.ts";
import { scanRepo, scanRepoPath } from "./repos/scan.ts";
import { serve } from "./server.ts";
import { createApp } from "./api/app.ts";

/** Run one `scan`/`scan-repo`-style pass over a config, as JSON to stdout. */
async function scanConfigToStdout(
  config: Config,
  logger: Logger,
): Promise<void> {
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

async function main(): Promise<void> {
  const logger = createLogger(Level.Info);
  const version = await getVersion();
  const program = new Command()
    .name("repoyear-backend")
    .version(version);
  program.command("serve")
    .addOption(
      new Option("--bind <addr>", "address to bind to").env("BIND").default(
        "127.0.0.1:3000",
      ),
    )
    .addOption(
      new Option("--github-client-id <id>", "GitHub client ID").env(
        "GITHUB_CLIENT_ID",
      ).makeOptionMandatory(),
    )
    .addOption(
      new Option("--github-client-secret <secret>", "GitHub client secret").env(
        "GITHUB_CLIENT_SECRET",
      ).makeOptionMandatory(),
    )
    .addOption(
      new Option("--scan-config <path>", "Configuration file").env(
        "SCAN_CONFIG",
      ).argParser((path: string) => parseConfig(Deno.readTextFileSync(path))),
    )
    .action(
      async (
        { bind, ...options }: {
          bind: string;
          githubClientId: string;
          githubClientSecret: string;
          scanConfig: Config | undefined;
        },
      ) => {
        await serve(bind, {
          ...options,
          version,
          logger,
        }).finished;
      },
    );

  program.command("scan").argument("<config>").action(
    async (config: string) => {
      await scanConfigToStdout(
        parseConfig(await Deno.readTextFile(config)),
        logger,
      );
    },
  );

  program.command("scan-repo").argument("<repositories...>").action(
    async (repositories: string[]) => {
      const result: Record<string, number[]> = {};
      for (const path of repositories) {
        try {
          result[path] = await scanRepoPath(path);
        } catch (error) {
          logger.error(`Error in ${JSON.stringify(path)}: ${error}`);
        }
      }
      console.log(JSON.stringify(result));
    },
  );

  program.command("openapi").option("-o, --output <path>").action(
    async ({ output }: { output: string | undefined }) => {
      // Only the route shapes matter for the spec; the state's
      // credentials/config are never consulted while generating it. Uses the
      // package version (deno.jsonc), not the git-describe `version`.
      const response = await createApp({
        githubClientId: "",
        githubClientSecret: "",
        scanConfig: undefined,
        version: await getPackageVersion(),
        logger,
      }).request("/api/openapi.json");
      const json = `${JSON.stringify(await response.json(), null, 2)}\n`;
      if (output !== undefined) {
        await Deno.writeTextFile(output, json);
      } else {
        console.log(json);
      }
    },
  );

  program.command("version").action(() => console.log(version));

  await program.parseAsync();
}

if (import.meta.main) {
  await main();
}
