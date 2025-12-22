import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import fs from "node:fs";
import { execSync } from "node:child_process";

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
          execSync("scripts/get-version.sh")
            .toString()
            .trim(),
        );
      },
    },
    {
      name: "serve-static-data",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/assets/contributions.json") {
            const path = resolve(__dirname, "dist/assets/contributions.json");
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
        main: resolve(__dirname, "index.html"),
        static: resolve(__dirname, "static.html"),
        compact: resolve(__dirname, "compact.html"),
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
