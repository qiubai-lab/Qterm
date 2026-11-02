"""Verify the minimal Ubuntu runtime and root's ability to add tools later."""


def verify_runtime(compose):
    compose("exec", "-T", "qterm", "bash", "-ec", r'''
test "$(id -u)" = 0
. /etc/os-release
test "$ID" = ubuntu
test "$VERSION_ID" = 24.04
test -w /etc
for tool in bash curl git ssh apt-get; do command -v "$tool"; done
for tool in mise gcc g++ make cmake node npm pnpm python3 pip3; do
    if command -v "$tool"; then
        echo "Unexpected development tool: $tool" >&2
        exit 1
    fi
done
test "$QTERM_NODE" = /opt/qterm/bin/node
"$QTERM_NODE" --version
# Exercise package installation without requiring network access in CI.
mkdir -p /tmp/qterm-package/DEBIAN /tmp/qterm-package/usr/local/bin
printf 'Package: qterm-proof\nVersion: 1.0\nArchitecture: all\nMaintainer: Qterm CI\nDescription: Acceptance fixture\n' > /tmp/qterm-package/DEBIAN/control
printf '#!/bin/sh\nprintf apt-proof\n' > /tmp/qterm-package/usr/local/bin/qterm-proof
chmod 755 /tmp/qterm-package/usr/local/bin/qterm-proof
dpkg-deb --build /tmp/qterm-package /tmp/qterm-proof.deb
apt-get install --yes /tmp/qterm-proof.deb
test "$(qterm-proof)" = apt-proof
useradd --uid 10002 --create-home --home-dir /data/users/dev-proof --shell /bin/bash dev-proof
su - dev-proof -c 'set -eu; test "$(id -u)" = 10002; test -w "$HOME"'
su - qterm -c 'set -eu; test "$(id -u)" = 10001; test -w "$HOME"'
''')
