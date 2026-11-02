#!/bin/sh
set -eu
# Also initializes the persistent home when upgrading an existing data volume.
mkdir -p "$HOME"
# Existing data volumes may predate the built-in development account.
if [ "$(id -u)" = 0 ]; then
    install -d -o qterm -g qterm /data/users/qterm
fi
exec qterm-server "$@"
