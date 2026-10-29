#!/usr/bin/env python3
"""Materialize a checksum-pinned upstream crate plus the tracked experimental patch."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parent
VERSION = '3.0.0-alpha.6'
ARCHIVE_SHA256 = '1fc02ef8f4295b0036b1d6cbe99111e263b587c870f0d54d9bc386602f10b947'
NAME = 'tauri-runtime-cef-' + VERSION
DEST = ROOT / 'runtime/tauri-runtime-cef'
INPUTS = [ROOT/'patches/context-pool.patch', ROOT/'patches/context_pool.rs']


def main():
    fingerprint = hashlib.sha256(b''.join(p.read_bytes() for p in INPUTS)).hexdigest()
    stamp = {'archive_sha256': ARCHIVE_SHA256, 'patch_sha256': fingerprint}
    if (DEST/'.qterm-patch.json').exists():
        old=json.loads((DEST/'.qterm-patch.json').read_text())
        if all(old.get(k)==v for k,v in stamp.items()) and all(
            (DEST/p).is_file() and hashlib.sha256((DEST/p).read_bytes()).hexdigest()==sha
            for p,sha in old.get('files',{}).items()):
            print('Pinned patched runtime ready');return
    cargo = Path(os.environ.get('CARGO_HOME', Path.home()/'.cargo'))
    cached = list((cargo/'registry/cache').glob('*/'+NAME+'.crate'))
    if cached:
        archive=cached[0].read_bytes()
    else:
        with urllib.request.urlopen('https://static.crates.io/crates/tauri-runtime-cef/'+NAME+'.crate',timeout=60) as response:
            archive=response.read()
    if hashlib.sha256(archive).hexdigest()!=ARCHIVE_SHA256:
        raise RuntimeError('upstream runtime archive checksum mismatch')
    DEST.parent.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='prepare-',dir=DEST.parent) as temp:
        with tarfile.open(fileobj=io.BytesIO(archive),mode='r:gz') as source:
            source.extractall(temp,filter='data')
        extracted=Path(temp)/NAME
        subprocess.run(['patch','--batch','--fuzz=0','-p1','-i',str(INPUTS[0])],cwd=extracted,check=True)
        shutil.copy2(INPUTS[1],extracted/'src/cef_impl/context_pool.rs')
        stamp['files']={str(p.relative_to(extracted)):hashlib.sha256(p.read_bytes()).hexdigest()
                        for p in extracted.rglob('*') if p.is_file()}
        (extracted/'.qterm-patch.json').write_text(json.dumps(stamp,indent=2)+'\n')
        if DEST.exists():shutil.rmtree(DEST)
        extracted.rename(DEST)
    print('Prepared checksum-verified runtime with context reuse patch')


if __name__=='__main__':main()
