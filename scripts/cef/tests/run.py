#!/usr/bin/env python3
"""Run packaged CEF against two disposable OpenSSH servers; write measured evidence."""
import argparse
import contextlib
import datetime
import json
import hashlib
import platform
from pathlib import Path
import subprocess
import sys
import tempfile
import traceback
import time

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / "experiments/tauri3-cef-probe/tests"))
sys.path.insert(0, str(REPO / 'scripts/macos-web-origin-probe'))
from ssh_fixture import SSHEnvironment
from origin import start_origin
from transport import Gateway, Sentinel
from controller import App
from measure import memory
from lifecycle import run as lifecycle
from context_continuity import run as continuity


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=HERE.parent / 'artifacts/latest')
    parser.add_argument('--samples', type=int, default=10)
    args = parser.parse_args()
    if not 0 <= args.samples <= 10: parser.error("--samples must be 0..10")
    args.output.mkdir(parents=True, exist_ok=True)
    evidence = dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    platform=platform.platform(), machine=platform.machine(),
                    ram_bytes=int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True)),
                    versions={'probe': 'Qterm dev-cef integration', 'tauri': '3.0.0-alpha.5', 'runtime': '3.0.0-alpha.6 + local context-pool patch', 'cef': '154.5.0'},
                    limitations=['macOS arm64 only', 'two sshd processes on one host with separate target ports',
                                 'real Qterm frontend with synthetic guest test pages',
                                 'RSS sums shared pages; not unique physical footprint',
                                 'compile-time test build uses Mock cookie encryption; normal builds use System'],
                    checks=[], memory=[], memory_warnings=[], completed=False)
    binary=args.app / 'Contents/MacOS/Qterm'
    with binary.open('rb') as stream:
        evidence['artifact']={'binary_sha256':hashlib.file_digest(stream,'sha256').hexdigest(),
            'app_logical_bytes':sum(p.stat().st_size for p in args.app.rglob('*') if p.is_file() and not p.is_symlink())}
    def add(name, passed, detail=None):
        evidence['checks'].append(dict(name=name, pass_=bool(passed), detail=detail))
        print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    def sample(app, stage):
        if args.samples == 0: return
        print('MEMORY ' + stage, flush=True)
        for attempt in range(3):
            try:
                evidence['memory'].append(memory(app.process.pid, stage, args.samples))
                return
            except RuntimeError:
                if app.process.poll() is not None: raise
                time.sleep(.5)
        evidence['memory_warnings'].append(stage+': process set changed during footprint sampling; no complete measurement')
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
            app = App(args.app / 'Contents/MacOS/Qterm', root / 'browser', args.output / 'app.log')
            cleanup.callback(app.close)
            for _ in range(50):
                try:
                    shell = app.evaluate('main', "const content=document.body?.innerText ?? '';return {title:document.title,content,capabilities:content.length>20 && location.origin!=='null' ? await window.__TAURI_INTERNALS__?.invoke('web_supported') : null}")
                except RuntimeError as error:
                    if 'CEF 操作被拒绝' not in str(error): raise
                    time.sleep(.1)
                    continue
                if len(shell['content']) > 20 and shell.get('capabilities'): break
                time.sleep(.1)
            add('real Qterm shell loads and trusted IPC works', shell['capabilities'] == {'local':True,'remote':True,'tunnelAddressMapping':False} and len(shell['content'])>20, shell)
            from popup_tabs_ui import run as popup_tabs_ui
            ui_origin = start_origin('UI')
            cleanup.callback(ui_origin.server_close)
            cleanup.callback(ui_origin.shutdown)
            popup_tabs_ui(app, ui_origin, add)
            sample(app, 'idle-main-window')
            app.open('a', 'A', gateways['A'])
            sample(app, 'one-SSH-page')
            app.open('b', 'B', gateways['B'])
            sample(app, 'two-independent-SSH-pages')
            evidence['documents'] = {name: app.evaluate(name.lower(), 'return {href:location.href,origin:location.origin,secure:isSecureContext,userAgent:navigator.userAgent,body:document.documentElement.outerHTML}') for name in ('A', 'B')}
            for name in ('A', 'B'):
                app.send(op='eval', id=name.lower(), tag='checks', script='const profile='+json.dumps(name)+';\n'+(REPO / "experiments/tauri3-cef-probe/tests" / 'checks.js').read_text())
            for name in ('A', 'B'):
                result = app.wait('result', id=name.lower(), timeout=60)['result']
                if 'error' in result:
                    raise RuntimeError(result)
                for check in result['value']:
                    add(name + ': ' + check['name'], check['pass'], check.get('detail'))
            storage = (REPO / "experiments/tauri3-cef-probe/tests" / 'storage.js').read_text()
            for name in ('A', 'B'):
                value = app.evaluate(name.lower(), 'const profile='+json.dumps(name)+';\n'+storage)
                add(name + ': fresh Cache Storage and IndexedDB isolated',
                    value['cacheBefore'] is None and value['indexedDBBefore'] is None, value)
            for name in ('A', 'B'):
                value = app.evaluate(name.lower(), 'const profile='+json.dumps(name)+';\n'+storage)
                add(name + ': Service Worker, Cache Storage, IndexedDB and localStorage identity',
                    all(value[k] == name for k in ('sw', 'cacheBefore', 'indexedDBBefore', 'local')), value)
            from popups import run as popups
            popups(app, add)
            from popup_teardown import run as popup_teardown
            popup_teardown(app, gateways, add)
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
            from retirement import run as retirement
            retirement(app, gateways, add)
            from production_session import run as production_session
            production_session(app, environments, add)
            from shutdown import run as shutdown
            shutdown(app, gateways, add)
            app.close()
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
