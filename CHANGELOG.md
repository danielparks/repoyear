# Change log

All notable changes to this project will be documented in this file.

## main branch

- No longer blurs days with contributions from unknown sources after data is
  fully loaded. This makes days with contributions to private repositories
  easier to understand.
- Reduced max lightness from 99% to 96%, since 99% looked white.
- Removed refresh/reload distinction because the new multi-year capable data
  model does not support it.
- Now displays “Loading…” instead of “No contributions data” when loading data
  from GitHub before any data has arrived.
- No longer loses cached data when the GitHub token refreshes.
- Extend calendar map to the edges of the screen in narrow windows or on mobile.

### Security fixes

- Updated [git2] version to avoid two vulnerabilities ([RUSTSEC-2026-0183] and
  [RUSTSEC-2026-0184]).

[git2]: https://crates.io/crates/git2
[RUSTSEC-2026-0183]: https://rustsec.org/advisories/RUSTSEC-2026-0183
[RUSTSEC-2026-0184]: https://rustsec.org/advisories/RUSTSEC-2026-0184

## 0.8.1 (2026-03-07)

- Bugfix: if local contributions were displayed with GitHub contributions some
  high activity days would appear blank.

## 0.8.0 (2026-02-14)

- You can now select multiple days to get a summary of those days.
- Lightness function is now logarithmic.
- Other users’ contributions can now be displayed with `?user=username`.

## 0.7.0 (2026-01-04)

- Now able to scan and visualize contributions on local repositories.
- GitHub authorization now allows collecting data about private repos.
- Significant UI improvements.
