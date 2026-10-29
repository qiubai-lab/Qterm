"""Disposable, pinned-host-key OpenSSH masters; never reads ~/.ssh."""
import getpass
import socket
import subprocess
import time
from pathlib import Path


def free_port():
    with socket.socket() as listener:
        listener.bind(('127.0.0.1', 0))
        return listener.getsockname()[1]


def wait_port(port, process):
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError('SSH process exited; inspect sshd/ssh log')
        try:
            with socket.create_connection(('127.0.0.1', port), timeout=.1):
                return
        except OSError:
            time.sleep(.03)
    raise RuntimeError('SSH listener timeout')


class SSHEnvironment:
    def __init__(self, directory: Path, name: str, target_port: int):
        self.directory = directory / name
        self.directory.mkdir()
        self.name, self.target_port = name, target_port
        self.port, self.socks_port = free_port(), free_port()
        self.master = self.server = None
        self.files = []
        try:
            self.start()
        except BaseException:
            self.close()
            raise

    def start(self):
        for key in ('host', 'client'):
            subprocess.run(['ssh-keygen', '-q', '-t', 'ed25519', '-N', '', '-f',
                            str(self.directory / key)], check=True)
        (self.directory / 'authorized_keys').write_bytes((self.directory / 'client.pub').read_bytes())
        (self.directory / 'known_hosts').write_text(
            f'[127.0.0.1]:{self.port} ' + (self.directory / 'host.pub').read_text())
        (self.directory / 'sshd_config').write_text(
            f'Port {self.port}\nListenAddress 127.0.0.1\nHostKey {self.directory}/host\n'
            f'PidFile {self.directory}/pid\nAuthorizedKeysFile {self.directory}/authorized_keys\n'
            'StrictModes no\nPasswordAuthentication no\nKbdInteractiveAuthentication no\n'
            'PubkeyAuthentication yes\nUsePAM no\nAllowTcpForwarding local\n'
            f'PermitOpen 127.0.0.1:{self.target_port}\nLogLevel VERBOSE\n')
        self.server = subprocess.Popen(['/usr/sbin/sshd', '-D', '-e', '-f',
                                        str(self.directory / 'sshd_config')],
                                       stderr=self.log('sshd.log'), stdout=subprocess.DEVNULL)
        wait_port(self.port, self.server)
        self.restore()

    def log(self, name):
        handle = (self.directory / name).open('ab')
        self.files.append(handle)
        return handle

    def base(self):
        return ['ssh', '-F', '/dev/null', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none',
                '-o', 'StrictHostKeyChecking=yes', '-o', 'GlobalKnownHostsFile=/dev/null',
                '-o', f'UserKnownHostsFile={self.directory}/known_hosts', '-o', 'ConnectTimeout=3',
                '-i', str(self.directory / 'client'), '-p', str(self.port)]

    def restore(self):
        self.master = subprocess.Popen(self.base() + ['-N', '-D', f'127.0.0.1:{self.socks_port}',
                                       '-o', 'ExitOnForwardFailure=yes',
                                       f'{getpass.getuser()}@127.0.0.1'],
                                       stderr=self.log('ssh.log'), stdout=subprocess.DEVNULL)
        wait_port(self.socks_port, self.master)

    def cut(self):
        if self.master and self.master.poll() is None:
            self.master.terminate()
            self.master.wait(timeout=5)

    def close(self):
        self.cut()
        if self.server and self.server.poll() is None:
            self.server.terminate()
            self.server.wait(timeout=5)
        for handle in self.files:
            handle.close()
