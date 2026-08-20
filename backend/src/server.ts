// Server startup and configuration.

import { createApp } from "./api/app.ts";
import type { AppState } from "./api/handlers.ts";

/** Parse a `host:port` (or `[ipv6]:port`) bind address. */
export function parseBindAddress(
  bind: string,
): { hostname: string; port: number } {
  let hostname: string;
  let portStr: string;

  if (bind.startsWith("[")) {
    const closeIdx = bind.indexOf("]");
    if (closeIdx === -1 || bind[closeIdx + 1] !== ":") {
      throw new Error(`Invalid bind address: ${bind}`);
    }
    hostname = bind.slice(1, closeIdx);
    portStr = bind.slice(closeIdx + 2);
  } else {
    const idx = bind.lastIndexOf(":");
    if (idx === -1) {
      throw new Error(`Invalid bind address: ${bind}`);
    }
    hostname = bind.slice(0, idx);
    portStr = bind.slice(idx + 1);
  }

  const port = Number.parseInt(portStr, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid bind address: ${bind}`);
  }
  return { hostname, port };
}

/** Start the API web server. */
export function serve(bind: string, state: AppState): Deno.HttpServer {
  const { hostname, port } = parseBindAddress(bind);
  const app = createApp(state);

  return Deno.serve(
    {
      hostname,
      port,
      onListen: () => {
        state.logger.info(
          `Server ${state.version} running on http://${bind}`,
        );
      },
    },
    app.fetch,
  );
}
