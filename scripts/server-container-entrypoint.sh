#!/bin/sh
set -eu
# Seed missing startup files at runtime: /data may be an existing bind mount.
# Never replace user configuration, including dangling symlinks.
initialize_home() {
    mkdir -p "$1"
    for name in .profile .bashrc; do
        if [ ! -e "$1/$name" ] && [ ! -L "$1/$name" ]; then
            if [ "$#" -eq 3 ]; then
                install -m 644 -o "$2" -g "$3" "/etc/skel/$name" "$1/$name"
            else
                install -m 644 "/etc/skel/$name" "$1/$name"
            fi
        fi
    done
}
initialize_home "$HOME"
# Existing data volumes may predate the built-in development account.
if [ "$(id -u)" = 0 ]; then
    install -d -o qterm -g qterm /data/users/qterm
    initialize_home /data/users/qterm qterm qterm
fi
exec qterm-server "$@"
