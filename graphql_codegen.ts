/**
 * Configure GraphQL type code generation.
 *
 * `deno run generate:graphql`
 */

import type { CodegenConfig } from "@graphql-codegen/cli";

const config: CodegenConfig = {
  schema: "src/github/schema.graphql",
  noSilentErrors: true,
  generates: {
    "src/github/gql.ts": {
      config: {
        defaultScalarType: "string",
        useTypeImports: true,
      },
      plugins: [
        "typescript",
      ],
    },
  },
  // deno fmt will be passed src/github/gql.ts
  hooks: { afterAllFileWrite: ["deno fmt"] },
};
export default config;
