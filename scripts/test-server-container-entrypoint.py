#!/usr/bin/env python3
"""Verify persistent HOME startup in an isolated Ubuntu container (requires Docker)."""
from pathlib import Path
import subprocess


ENTRYPOINT = Path(__file__).resolve().parent / "server-container-entrypoint.sh"

CHECKS = r'''
set -eu
groupadd --gid 10001 qterm
useradd --uid 10001 --gid qterm --home-dir /data/users/qterm --shell /bin/bash --no-create-home qterm
export HOME=/data/home
mkdir -p /usr/local/bin
printf '#!/bin/sh\nexit 0\n' > /usr/local/bin/qterm-server
chmod +x /usr/local/bin/qterm-server

# Fresh homes receive the normal login -> .profile -> .bashrc chain.
/bin/sh /fixture/entrypoint.sh
test -f "$HOME/.profile"
test -f "$HOME/.bashrc"
test "$(stat -c %U:%G /data/users/qterm/.profile)" = qterm:qterm
test "$(stat -c %U:%G /data/users/qterm/.bashrc)" = qterm:qterm
su - qterm -c 'test -w "$HOME/.profile" && test -w "$HOME/.bashrc"'

# Simulate an old volume: tool setup exists in .bashrc, but .profile is absent.
rm "$HOME/.profile"
mkdir -p "$HOME/.local/bin"
printf '#!/bin/sh\nprintf tool-loaded\n' > "$HOME/.local/bin/qterm-test-tool"
chmod +x "$HOME/.local/bin/qterm-test-tool"
cat >> "$HOME/.bashrc" <<'RC'
export QTERM_TEST_ACTIVATED=yes
export PATH="$HOME/.local/bin:$PATH"
RC
cp "$HOME/.bashrc" /tmp/original.bashrc
/bin/sh /fixture/entrypoint.sh
cmp "$HOME/.bashrc" /tmp/original.bashrc
# Independent shells must activate the tool without manually sourcing anything.
for window in 1 2; do
    bash -lic 'test "$QTERM_TEST_ACTIVATED" = yes && test "$(qterm-test-tool)" = tool-loaded'
done
# The non-login Bash used by history-free mode reads the same tool setup.
bash -ic 'test "$QTERM_TEST_ACTIVATED" = yes && test "$(qterm-test-tool)" = tool-loaded'

# Restarting preserves all existing configuration, including login overrides.
printf '\n# user customization\n' >> "$HOME/.profile"
printf '# custom login\n' > "$HOME/.bash_profile"
cp "$HOME/.profile" /tmp/original.profile
cp "$HOME/.bash_profile" /tmp/original.bash_profile
/bin/sh /fixture/entrypoint.sh
cmp "$HOME/.profile" /tmp/original.profile
cmp "$HOME/.bashrc" /tmp/original.bashrc
cmp "$HOME/.bash_profile" /tmp/original.bash_profile
rm "$HOME/.bashrc"
ln -s /missing-user-config "$HOME/.bashrc"
/bin/sh /fixture/entrypoint.sh
test "$(readlink "$HOME/.bashrc")" = /missing-user-config

# Non-root deployments initialize their own HOME without touching other users.
su qterm -s /bin/sh -c 'HOME=/tmp/qterm-custom-home /bin/sh /fixture/entrypoint.sh'
test "$(stat -c %U:%G /tmp/qterm-custom-home/.profile)" = qterm:qterm
echo 'PASS: fresh homes, existing volume migration, independent shells, ownership and configuration preservation'
'''


if __name__ == "__main__":
    subprocess.run([
        "docker", "run", "--rm", "--network", "none", "-i",
        "--mount", f"type=bind,src={ENTRYPOINT},dst=/fixture/entrypoint.sh,readonly",
        "ubuntu:24.04", "/bin/sh", "-s",
    ], input=CHECKS, text=True, check=True)
