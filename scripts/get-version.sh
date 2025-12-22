#!/bin/sh
# Get the version from git describe
git describe --dirty --broken --always --match 'v*'
