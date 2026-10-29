"""Reproducible package bytes and external whole-process-tree RSS samples."""
import statistics
import hashlib
import re
import subprocess
import time


def process_tree(root):
    output = subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss=,command='], text=True)
    processes = []
    for line in output.splitlines():
        pid, parent, rss, command = line.strip().split(None, 3)
        processes.append(dict(pid=int(pid), parent=int(parent), rss_kib=int(rss), command=command))
    selected = {root}
    while True:
        children = {p['pid'] for p in processes if p['parent'] in selected}
        if children <= selected:
            break
        selected |= children
    return [p for p in processes if p['pid'] in selected]


def memory(root, stage, samples=10):
    time.sleep(3)
    measurements = []
    for _ in range(samples):
        tree = process_tree(root)
        footprint_args = ['/usr/bin/footprint', '--noCategories', '-f', 'bytes']
        for process in tree:
            footprint_args.extend(['-p', str(process['pid'])])
        footprint = subprocess.run(footprint_args, capture_output=True, text=True, timeout=15)
        summary = re.search(r'Summary Footprint: (\d+) B', footprint.stdout)
        included = set(map(int, re.findall(r'\[(\d+)\]: 64-bit', footprint.stdout)))
        if footprint.returncode != 0 or not summary or included != {p['pid'] for p in tree}:
            raise RuntimeError('footprint process set incomplete: ' + footprint.stdout + footprint.stderr)
        measurements.append(dict(timestamp=time.time(), rss_kib=sum(p['rss_kib'] for p in tree), processes=tree,
                                 footprint_bytes=int(summary[1]), footprint_output=footprint.stdout))
        time.sleep(1)
    values = [s['rss_kib'] / 1024 for s in measurements]
    footprints = [s['footprint_bytes'] / 1024**2 for s in measurements]
    return dict(stage=stage, unit='MiB', metric='sum of process-tree RSS (shared pages may be counted repeatedly)',
                min=min(values), median=statistics.median(values), max=max(values), samples=measurements,
                footprint=dict(metric='macOS footprint Summary Footprint for the same process set', unit='MiB',
                               min=min(footprints), median=statistics.median(footprints), max=max(footprints)))


def package(app, dmg):
    # Count each regular file once, excluding bundle symlinks.
    files = [p for p in app.rglob('*') if p.is_file() and not p.is_symlink()]
    binary = app / 'Contents/MacOS/qterm-cef-probe'
    def sha256(path):
        with path.open('rb') as stream:
            return hashlib.file_digest(stream, 'sha256').hexdigest()
    return dict(app=str(app), app_logical_bytes=sum(p.stat().st_size for p in files),
                app_allocated_kib=int(subprocess.check_output(['du', '-sk', str(app)], text=True).split()[0]),
                dmg=str(dmg), dmg_bytes=dmg.stat().st_size, dmg_sha256=sha256(dmg), binary_sha256=sha256(binary),
                binary_architecture=subprocess.check_output(['file', str(binary)], text=True).strip(),
                framework_files_bytes=sum(p.stat().st_size for p in files if 'Frameworks' in p.parts))
