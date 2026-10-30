#!/usr/bin/env python3
"""Isolated Windows CEF artifact smoke. No external service or user profile required."""
import argparse
import contextlib
import datetime
import hashlib
import json
from pathlib import Path
import platform
import sys
import tempfile
import time
import traceback
import uuid

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
sys.path.insert(0, str(REPO / 'experiments/tauri3-cef-probe/tests'))
sys.path.insert(0, str(REPO / 'scripts/macos-web-origin-probe'))
from controller import App
from origin import start_origin
from popup_tabs_ui import run as popup_ui
from windows_popups import run as popup_native


def until(read, predicate, timeout=15):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        value = read()
        if predicate(value):
            return value
        time.sleep(.05)
    raise RuntimeError(f'condition timed out: {value!r}')


def exercise(app, origin, add):
    shell = until(lambda: app.evaluate('main', "return document.body?.innerText.length>20 ? await window.__TAURI_INTERNALS__.invoke('web_supported') : null"), bool)
    add('Windows main IPC advertises local and remote Browser Blocks', shell == dict(local=True, remote=True, tunnelAddressMapping=False), shell)
    app.send(op='counts')
    baseline=app.wait('counts')['pooledContexts']
    popup_ui(app, origin, add, baseline, native_visibility=True)
    id = str(uuid.uuid4())
    label = 'web-' + id
    url = f'http://127.0.0.1:{origin.server_port}/'
    app.send(op='windows-open', id=id, url=url)
    app.wait('windows-opened', id=id)
    app.wait('loaded', id=label, url=url)
    bounds = dict(x=80, y=120, width=600, height=400, visible=True)
    def sync(**overrides):
        app.send(op='windows-sync', id=id, bounds={**bounds, **overrides})
        app.wait('windows-synced', id=id)
    def inspect(points=(), focus=False):
        app.send(op='windows-focus' if focus else 'windows-inspect', id=id, points=points)
        return app.wait('windows-info', id=id)['info']
    sync()
    native = inspect()
    scale = app.evaluate('main', 'return devicePixelRatio')
    add('CEF guest is a visible enabled child at physical DPI bounds', native['child'] and native['parent'] == native['top'] and native['visible'] and native['enabled'] and [native[k] for k in ('x','y','width','height')] == [round(v*scale) for v in (80,120,600,400)], native)
    isolation = app.evaluate(label, "const denied=async cmd=>{try{await window.__TAURI_INTERNALS__.invoke(cmd);return false}catch(e){return String(e)}};return {href:location.href,app:await denied('web_supported'),plugin:await denied('plugin:clipboard-manager|write_text')}")
    add('guest retains HTTP origin and application/plugin IPC is rejected', isolation['href']==url and all(isinstance(isolation[k],str) and ('cannot invoke' in isolation[k] or 'not allowed' in isolation[k]) for k in ('app','plugin')), isolation)
    main_url = app.evaluate('main', 'return location.href')
    app.send(op='browser-action', id=id, action='navigate', url=main_url)
    denial = app.wait('error')
    add('guest navigation cannot enter the privileged main origin', bool(denial['error']) and app.evaluate(label,'return location.href')==url, denial)
    automatic = app.evaluate(label, "return window.open('/echo?automatic','automatic')===null")
    add('popup without a native user gesture is denied', automatic)
    sync(occlusions=[dict(x=20,y=20,width=60,height=60),dict(x=40,y=40,width=60,height=60)])
    clipping = inspect([[round(v*scale),round(v*scale)] for v in (5,25,95,120)])
    add('native occlusion union exposes application overlays', clipping['hit'] == [True,False,False,True], clipping)
    inspect(focus=True)
    focused = until(inspect, lambda v:v['focused'])
    sync(inputBlocked=True)
    blocked = inspect()
    add('blocked surface releases focus and disables native input', focused['focused'] and not blocked['focused'] and not blocked['enabled'], blocked)
    sync(covered=True, inputBlocked=True)
    covered = inspect()
    add('covered surface is hidden and disabled', not covered['visible'] and not covered['enabled'], covered)
    sync()
    recovered = inspect()
    add('uncovered surface recovers input and unclipped region', recovered['visible'] and recovered['enabled'] and recovered['region']==0, recovered)
    sync(visible=False)
    add('inactive tab hides its HWND', not inspect()['visible'])
    sync()
    app.send(op='browser-observe',id=id)
    observed=app.wait('observed')
    add('visible Windows guest produces scroll metrics and PNG snapshot',observed['metrics'] is not None and observed['snapshotBytes']>100,observed)
    popup_native(app, label, add, until)
    app.evaluate('main',"return await window.__TAURI_INTERNALS__.invoke('web_close',{id:"+json.dumps(id)+"})")
    def counts():
        app.send(op='counts')
        return app.wait('counts')
    final=until(counts,lambda c:c['guests']==c['environments']==0 and c['pooledContexts']==baseline)
    add('all Windows guests and request contexts retire',True,final)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--app',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=HERE.parent/'artifacts/windows')
    args=parser.parse_args()
    args.output.mkdir(parents=True,exist_ok=True)
    evidence=dict(timestamp=datetime.datetime.now(datetime.timezone.utc).isoformat(),platform=platform.platform(),checks=[],completed=False,
                  limitations=['debug-only Auto sandbox; production Required remains blocked upstream','local HTTP fixture; this run does not certify real SSH transport or other operating systems'])
    with args.app.open('rb') as stream:
        evidence['binary_sha256']=hashlib.file_digest(stream,'sha256').hexdigest()
    def add(name,passed,detail=None):
        evidence['checks'].append(dict(name=name,pass_=bool(passed),detail=detail))
        print(('PASS ' if passed else 'FAIL ')+name,flush=True)
    try:
        with tempfile.TemporaryDirectory(prefix='qterm-windows-cef-') as temp, contextlib.ExitStack() as cleanup:
            origin=start_origin('Windows')
            cleanup.callback(origin.server_close)
            cleanup.callback(origin.shutdown)
            app=App(args.app.resolve(),Path(temp)/'browser',args.output/'app.log')
            cleanup.callback(app.close)
            exercise(app,origin,add)
            app.close()
        evidence['completed']=True
    except BaseException:
        evidence['error']=traceback.format_exc()
        print(evidence['error'],file=sys.stderr)
    finally:
        evidence['passed']=evidence['completed'] and all(c['pass_'] for c in evidence['checks'])
        (args.output/'results.json').write_text(json.dumps(evidence,indent=2)+'\n',encoding='utf-8')
    return 0 if evidence['passed'] else 1


if __name__=='__main__':
    raise SystemExit(main())
