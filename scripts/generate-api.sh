#!/bin/sh

set -e

deno run -A npm:@oxide/openapi-gen-ts@0.12.0 openapi.json src/api

# Sloppy imports aren't supported, so we need to rewrite them. sed in-place
# isn't portable without creating backup files, and PCRE is nicer anyway:
perl -pi -e 's,(['\'\"'])(\./(?:Api|http-client|util))\g1,$1$2.ts$1,g' \
  src/api/{Api,http-client,util}.ts
