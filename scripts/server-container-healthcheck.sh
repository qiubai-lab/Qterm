#!/bin/sh
set -eu
address=${QTERM_LISTEN:-0.0.0.0:8080}
# Wildcard listeners are probed through loopback; specific interfaces stay exact.
case "$address" in
    0.0.0.0:*) address="127.0.0.1:${address##*:}" ;;
    \[::\]:*) address="[::1]:${address##*:}" ;;
esac
exec curl --fail --silent --noproxy '*' "http://$address/healthz"
