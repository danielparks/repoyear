#!/bin/sh

# Make sure the index matches what’s on disk. Without this the version might
# contain "-dirty" even if there are no apparent changes in `git status``.
git update-index --refresh -q &>/dev/null || true

git describe --dirty --broken --always --match 'v*'
