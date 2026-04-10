# Change log

All notable changes to this project will be documented in this file.

## main branch

- No longer blurs days with contributions from unknown sources after data is
  fully loaded. This makes days with contributions to private repositories
  easier to understand.
- Reduced max lightness from 99% to 96%, since 99% looked white.
- Removed refresh/reload distinction because the new multi-year capable data
  model does not support it.

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
