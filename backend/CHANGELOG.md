# Change log

All notable changes to this project will be documented in this file.

## main branch

### Changed

- Rewrote the backend in TypeScript/Deno (previously Rust). Local repo scanning
  now shells out to `git` instead of linking `libgit2`. The API contract
  (`openapi.json`) is unchanged.
