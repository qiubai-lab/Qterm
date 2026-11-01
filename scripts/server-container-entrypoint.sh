#!/bin/sh
set -eu
# Also initializes the persistent home when upgrading an existing data volume.
mkdir -p "$HOME"
exec qterm-server "$@"
