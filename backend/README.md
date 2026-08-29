# repoyear-backend

The RepoYear backend: scans local git repositories for contribution history not
visible to GitHub, and proxies GitHub OAuth token exchange for the frontend.
Written in TypeScript, runs on [Deno][deno].

## Installation

### Binaries

Download binaries directly from the [GitHub releases page][releases]. Just
extract the archive and copy the file inside into your `$PATH`, e.g.
`/usr/local/bin`. The most common ones are:

- Linux:
  [x86-64](https://github.com/danielparks/repoyear/releases/latest/download/repoyear-x86_64-unknown-linux-gnu.tar.gz),
  [ARM64](https://github.com/danielparks/repoyear/releases/latest/download/repoyear-aarch64-unknown-linux-gnu.tar.gz)
- macOS:
  [Intel](https://github.com/danielparks/repoyear/releases/latest/download/repoyear-x86_64-apple-darwin.tar.gz),
  [Apple silicon](https://github.com/danielparks/repoyear/releases/latest/download/repoyear-aarch64-apple-darwin.tar.gz)
- Windows:
  [x86-64](https://github.com/danielparks/repoyear/releases/latest/download/repoyear-x86_64-pc-windows-msvc.zip),
  [ARM64](https://github.com/danielparks/repoyear/releases/latest/download/repoyear-aarch64-pc-windows-msvc.zip)

These are `deno compile`d standalone binaries with no runtime dependency (not
even Deno itself).

### source

With [Deno][deno] installed:

```sh
deno run --allow-read --allow-write --allow-run --allow-net --allow-env \
  src/main.ts <subcommand>
```

## Development status

This is in active development. I am open to [suggestions][issues].

## License

Unless otherwise noted, this project is dual-licensed under the Apache 2 and MIT
licenses. You may choose to use either.

- [Apache License, Version 2.0](LICENSE-APACHE)
- [MIT license](LICENSE-MIT)

### Contributions

Unless you explicitly state otherwise, any contribution you submit as defined in
the Apache 2.0 license shall be dual licensed as above, without any additional
terms or conditions.

[deno]: https://deno.com/
[releases]: https://github.com/danielparks/repoyear/releases
[issues]: https://github.com/danielparks/repoyear/issues
