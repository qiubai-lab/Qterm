#!/usr/bin/env python3
"""Run real WKWebView through disposable OpenSSH, producing redacted JSON evidence."""
import argparse
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import threading

from gateway import Gateway
from origin_server import start_origin, Handler
from ssh_fixture import SSHEnvironment
from http.server import ThreadingHTTPServer


def run(output):
    source = Path(__file__).resolve().parent
    origins, environments, gateways = [], [], []
    process = sentinel = None
    results = []
    with tempfile.TemporaryDirectory(prefix='qterm-origin-ssh-') as temporary:
        directory = Path(temporary)
        try:
            # An occupied local target is intentional: any bypass becomes observable.
            sentinel = ThreadingHTTPServer(('127.0.0.1', 3000), Handler)
            sentinel.identity, sentinel.records = 'LOCAL-BYPASS', []
            threading.Thread(target=sentinel.serve_forever, daemon=True).start()
            token = secrets.token_urlsafe(32)
            env = dict(os.environ, PROBE_SOURCE=str(source), PROBE_TOKEN=token)
            for name in ('A', 'B'):
                origin = start_origin(name)
                origins.append(origin)
                ssh = SSHEnvironment(directory, name, origin.server_port)
                environments.append(ssh)
                http, socks = Gateway(ssh, token), Gateway(ssh, token, socks=True)
                gateways.extend([http, socks])
                env['HTTP_' + name], env['SOCKS_' + name] = str(http.server_address[1]), str(socks.server_address[1])
            subprocess.run(['clang', '-c', '-fobjc-arc', str(source / 'Registration.m'), '-o', str(directory / 'Registration.o')], check=True)
            subprocess.run(['swiftc', '-swift-version', '5', '-import-objc-header', str(source / 'Registration.h'),
                            *map(str, sorted(source.glob('*.swift'))), str(directory / 'Registration.o'),
                            '-framework', 'WebKit', '-framework', 'AppKit', '-framework', 'Network', '-o', str(directory / 'probe')], check=True)
            process = subprocess.Popen([str(directory / 'probe')], env=env, text=True,
                                       stdout=subprocess.PIPE, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
            timer = threading.Timer(100, process.kill)
            timer.start()
            errors = []
            reader = threading.Thread(target=lambda: errors.extend(process.stderr.readlines()), daemon=True)
            reader.start()
            try:
                for line in process.stdout:
                    if line.startswith('BROKER '):
                        for gateway in gateways:
                            gateway.broker_port = int(line.split()[1]); gateway.broker_ready.set()
                    elif line.startswith('CONTROL '):
                        getattr(environments[0], line.split()[1])()
                        process.stdin.write('OK\n'); process.stdin.flush()
                    elif line.startswith('RESULT '):
                        result = json.loads(line[7:]); results.append(result)
                        print(json.dumps(result, ensure_ascii=False), flush=True)
                process.wait(timeout=5)
            finally:
                timer.cancel()
            report = dict(platform=subprocess.check_output(['sw_vers'], text=True).strip(),
                          results=results, origins={s.identity: s.records for s in origins},
                          local_bypass=sentinel.records, routes=[g.records for g in gateways],
                          ssh_authenticated={e.name: 'Accepted publickey' in (e.directory / 'sshd.log').read_text() for e in environments},
                          native_exit=process.returncode, diagnostics=''.join(errors))
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
            failures = [c for r in results for c in r.get('checks', []) if not c['pass']]
            phases = {r['phase']: r for r in results if 'phase' in r}
            assert process.returncode == 0 and len(results) == 8, 'native run incomplete'
            assert all(report['ssh_authenticated'].values()), 'SSH authentication evidence missing'
            assert not sentinel.records, 'localhost bypass reached local service'
            for origin in origins:
                other = 'B' if origin.identity == 'A' else 'A'
                assert all(r['host'] == 'localhost:3000' and 'session=' + other not in r['cookie'] for r in origin.records)
                assert any(r['path'] == '/ws' for r in origin.records)
            assert not failures, 'failed checks: ' + ', '.join(c['name'] for c in failures)
            assert 'session=A' in phases['reuse']['value']['cookie']
            assert not phases['clearA']['a']['cookie'] and 'session=B' in phases['clearA']['b']['cookie']
            assert phases['beforeCut']['a'] == 'open' and phases['cut']['socketClose'] == 1006 and phases['cut']['newSocket'] == 'failed'
            assert phases['cut']['aStatus'] == 502 and phases['cut']['b']['profile'] == 'B'
            assert phases['restored']['a']['profile'] == 'A'
            assert phases['csp']['value'] == 'blocked', 'CSP characterization changed'
            print('PASS: first-party probe; strict CSP remains a known blocker. Evidence:', output)
        finally:
            if process and process.poll() is None:
                process.kill(); process.wait()
            for gateway in gateways:
                gateway.shutdown(); gateway.server_close()
            for ssh in environments:
                ssh.close()
            for server in origins + ([sentinel] if sentinel else []):
                server.shutdown(); server.server_close()


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--evidence', type=Path, default=Path('/tmp/qterm-origin-ssh-evidence.json'))
    run(parser.parse_args().evidence)
