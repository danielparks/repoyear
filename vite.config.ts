import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";
import process from "node:process";

// https://vite.dev/config/
export default defineConfig({
  base: "",
  plugins: [
    react(),
    {
      name: "inject-version",
      transformIndexHtml(html) {
        return html.replace(
          /@APP-VERSION@/g,
          process.env["APP_VERSION"] || execSync("scripts/get-version.sh")
            .toString()
            .trim(),
        );
      },
    },
    {
      name: "serve-static-data",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/assets/") && req.url?.endsWith(".json")) {
            // This does not protect against /../ since it’s only for dev mode.
            const path = resolve(import.meta.dirname!, `dist${req.url}`);
            if (fs.existsSync(path)) {
              res.setHeader("Content-Type", "application/json");
              fs.createReadStream(path).pipe(res);
              return;
            }
          }
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname!, "index.html"),
        static: resolve(import.meta.dirname!, "static.html"),
        compact: resolve(import.meta.dirname!, "compact.html"),
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "happy-dom",
    include: ["**/*.vitest.?(c|m)[jt]s?(x)"],
  },
});
