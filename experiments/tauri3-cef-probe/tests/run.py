#!/usr/bin/env python3
"""Run packaged CEF against two disposable OpenSSH servers; write measured evidence."""
import argparse
import contextlib
import datetime
import json
import platform
from pathlib import Path
import subprocess
import sys
import tempfile
import traceback

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / 'scripts/macos-web-origin-probe'))
from ssh_fixture import SSHEnvironment
from origin import start_origin
from transport import Gateway, Sentinel
from controller import App
from measure import memory, package
from lifecycle import run as lifecycle
from context_continuity import run as continuity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--dmg', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=HERE.parent / 'artifacts/latest')
    parser.add_argument('--samples', type=int, default=10)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    platform=platform.platform(), machine=platform.machine(),
                    ram_bytes=int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True)),
                    versions={'probe': '0.1.1', 'tauri': '3.0.0-alpha.5', 'runtime': '3.0.0-alpha.6 + local context-pool patch', 'cef': '154.5.0'},
                    limitations=['macOS arm64 only', 'two sshd processes on one host with separate target ports',
                                 'tiny synthetic pages; not full Qterm or a large developer application',
                                 'RSS sums shared pages; not unique physical footprint',
                                 'Mock cookie encryption for disposable synthetic credentials only'],
                    package=package(args.app.resolve(), args.dmg.resolve()), checks=[], memory=[], completed=False)
    def add(name, passed, detail=None):
        evidence['checks'].append(dict(name=name, pass_=bool(passed), detail=detail))
        print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    def sample(app, stage):
        print('MEMORY ' + stage, flush=True)
        evidence['memory'].append(memory(app.process.pid, stage, args.samples))
    try:
        with tempfile.TemporaryDirectory(prefix='qterm-cef-ssh-') as temp, contextlib.ExitStack() as cleanup:
            root = Path(temp)
            sentinels = []
            for ipv6 in (False, True):
                sentinel = Sentinel(ipv6)
                sentinels.append(sentinel)
                cleanup.callback(sentinel.server_close)
                cleanup.callback(sentinel.shutdown)
            origins, gateways, environments = {}, {}, {}
            for name in ('A', 'B'):
                origin = origins[name] = start_origin(name)
                cleanup.callback(origin.server_close)
                cleanup.callback(origin.shutdown)
                environment = environments[name] = SSHEnvironment(root, name, origin.server_port)
                cleanup.callback(environment.close)
                gateway = gateways[name] = Gateway(environment)
                cleanup.callback(gateway.server_close)
                cleanup.callback(gateway.shutdown)
            def diagnostics():
                evidence['routes'] = {name: gateway.records for name, gateway in gateways.items()}
                evidence['requests'] = {name: origin.records for name, origin in origins.items()}
                evidence['ssh'] = {name: dict(sshd=(env.directory/'sshd.log').read_text(), client=(env.directory/'ssh.log').read_text()) for name, env in environments.items()}
                evidence['sentinel_hits'] = [sentinel.hits for sentinel in sentinels]
            cleanup.callback(diagnostics)
            app = App(args.app / 'Contents/MacOS/qterm-cef-probe', root / 'browser', args.output / 'app.log')
            cleanup.callback(app.close)
            sample(app, 'idle-main-window')
            app.open('a', 'A', gateways['A'])
            sample(app, 'one-SSH-page')
            app.open('b', 'B', gateways['B'])
            sample(app, 'two-independent-SSH-pages')
            evidence['documents'] = {name: app.evaluate(name.lower(), 'return {href:location.href,origin:location.origin,secure:isSecureContext,userAgent:navigator.userAgent,body:document.documentElement.outerHTML}') for name in ('A', 'B')}
            for name in ('A', 'B'):
                app.send(op='eval', id=name.lower(), tag='checks', script='const profile='+json.dumps(name)+';\n'+(HERE / 'checks.js').read_text())
            for name in ('A', 'B'):
                result = app.wait('result', id=name.lower(), timeout=60)['result']
                if 'error' in result:
                    raise RuntimeError(result)
                for check in result['value']:
                    add(name + ': ' + check['name'], check['pass'], check.get('detail'))
            storage = (HERE / 'storage.js').read_text()
            for name in ('A', 'B'):
                value = app.evaluate(name.lower(), 'const profile='+json.dumps(name)+';\n'+storage)
                add(name + ': fresh Cache Storage and IndexedDB isolated',
                    value['cacheBefore'] is None and value['indexedDBBefore'] is None, value)
            for name in ('A', 'B'):
                value = app.evaluate(name.lower(), 'const profile='+json.dumps(name)+';\n'+storage)
                add(name + ': Service Worker, Cache Storage, IndexedDB and localStorage identity',
                    all(value[k] == name for k in ('sw', 'cacheBefore', 'indexedDBBefore', 'local')), value)
            continuity(app, gateways, add)
            lifecycle(app, gateways, environments, add)
            sample(app, 'SSH-windows-closed')
            hits = [sentinel.hits for sentinel in sentinels]
            add('no direct IPv4 or IPv6 fallback to local port 3000', hits == [0, 0], hits)
            for name in ('A', 'B'):
                records = origins[name].records
                other = 'B' if name == 'A' else 'A'
                add(name + ': every request preserves Host and never carries other session',
                    bool(records) and all(r['host'] == 'localhost:3000' and 'session='+other not in r['cookie'] for r in records), len(records))
                sshlog = (environments[name].directory / 'sshd.log').read_text()
                add(name + ': real SSH public-key authentication', 'Accepted publickey' in sshlog)
            app.close()
            released=[e for e in app.history if e.get('event') in ('connection_handles_released','context_pool_released')]
            add('normal exit releases two connection handles and two pooled contexts before CEF shutdown',
                app.process.returncode == 0 and [e['event'] for e in released] == ['connection_handles_released','context_pool_released']
                and all(e.get('count') == 2 for e in released), released)
            evidence['contexts'] = app.contexts
        evidence['completed'] = True
    except BaseException:
        evidence['error'] = traceback.format_exc()
        print(evidence['error'], file=sys.stderr)
    finally:
        evidence['passed'] = evidence['completed'] and 'error' not in evidence and bool(evidence['checks']) and all(c['pass_'] for c in evidence['checks'])
        (args.output / 'results.json').write_text(json.dumps(evidence, indent=2) + '\n')
    return 0 if evidence['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
