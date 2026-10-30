#!/usr/bin/env python3
"""Measure a quiet packaged-app run without compiling or running the stress suite."""
import argparse
import contextlib
import hashlib
import json
from pathlib import Path
import platform
import subprocess
import tempfile
import time

# Reuse the integration runner's exact disposable OpenSSH and process helpers.
from run import App, Gateway, SSHEnvironment, memory, start_origin


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    binary = args.app / 'Contents/MacOS/Qterm'
    result = dict(platform=platform.platform(), ram_bytes=int(subprocess.check_output(['sysctl', '-n', 'hw.memsize'], text=True)),
                  binary_sha256=hashlib.sha256(binary.read_bytes()).hexdigest(), samples_per_stage=5, memory=[], passed=False,
                  limitations=['compile-time integration build with Mock Cookie encryption', 'synthetic HTTP pages over disposable OpenSSH', 'RSS includes shared mappings', 'context owners survive closing the last page'])
    with tempfile.TemporaryDirectory(prefix='qterm-cef-memory-') as temp, contextlib.ExitStack() as cleanup:
        root = Path(temp)
        gateways = {}
        for name in ('A', 'B'):
            origin = start_origin(name)
            cleanup.callback(origin.server_close)
            cleanup.callback(origin.shutdown)
            environment = SSHEnvironment(root, name, origin.server_port)
            cleanup.callback(environment.close)
            gateway = gateways[name] = Gateway(environment)
            cleanup.callback(gateway.server_close)
            cleanup.callback(gateway.shutdown)
        app = App(binary, root / 'browser', args.output / 'app.log')
        cleanup.callback(app.close)
        for _ in range(50):
            shell = app.evaluate('main', "return {origin:location.origin,text:document.body?.innerText ?? ''}")
            if shell['origin'] != 'null' and len(shell['text']) > 20:
                break
            time.sleep(.1)
        else:
            raise RuntimeError('real Qterm shell did not load')
        def sample(stage):
            print(stage, flush=True)
            result['memory'].append(memory(app.process.pid, stage, 5))
        sample('idle-main-window')
        app.open('a', 'A', gateways['A'])
        sample('one-SSH-page')
        app.open('b', 'B', gateways['B'])
        sample('two-independent-SSH-pages')
        app.close_window('a')
        app.close_window('b')
        sample('SSH-pages-closed-owners-alive')
        for name in ('A', 'B'):
            app.send(op='disconnect', profile=name)
            app.wait('disconnected', profile=name)
        app.send(op='counts')
        counts = app.wait('counts')
        if not counts['guests'] == counts['environments'] == counts['pooledContexts'] == 0:
            raise RuntimeError(counts)
        sample('all-SSH-environments-retired')
        app.close()
        result['passed'] = app.process.returncode == 0
    (args.output / 'results.json').write_text(json.dumps(result, indent=2) + '\n')
    return 0 if result['passed'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
