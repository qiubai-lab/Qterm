"""Control the packaged app through parent-owned stdin; observe page console results."""
import json
import contextlib
import os
import queue
import subprocess
import threading
import time


class App:
    def __init__(self, binary, data, log):
        self.log = log.open('w')
        self.events, self.pending = queue.Queue(), []
        self.history, self.contexts = [], {}
        self.process = subprocess.Popen([str(binary)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=self.log, text=True,
                                        env={**os.environ, 'QTERM_CEF_PROBE_DATA': str(data)})
        self.reader = threading.Thread(target=self.read, daemon=True)
        self.reader.start()
        try:
            self.wait('ready', timeout=60)
        except BaseException:
            self.close()
            raise

    def read(self):
        for line in self.process.stdout:
            self.log.write(line)
            self.log.flush()
            if line.startswith('PROBE '):
                event = json.loads(line[6:])
                self.history.append(event)
                self.events.put(event)

    def send(self, **command):
        self.process.stdin.write(json.dumps(command) + '\n')
        self.process.stdin.flush()

    def wait(self, event, timeout=25, **match):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            for index, item in enumerate(self.pending):
                if item.get('event') == event and all(item.get(k) == v for k, v in match.items()):
                    return self.pending.pop(index)
            if self.process.poll() is not None:
                raise RuntimeError(f'app exited: {self.process.returncode}')
            try:
                item = self.events.get(timeout=.2)
            except queue.Empty:
                continue
            if item.get('event') == 'error' and event != 'error':
                raise RuntimeError(item)
            self.pending.append(item)
        raise TimeoutError(f'{event} {match}; pending={self.pending}')

    def open(self, id, profile, gateway, path='/'):
        self.send(op='open', id=id, profile=profile, port=gateway.server_address[1], path=path)
        self.contexts[id] = self.wait('proxy_ready', id=id)
        return self.wait('loaded', id=id)

    def evaluate(self, id, script, tag='eval', timeout=30):
        self.send(op='eval', id=id, tag=tag, script=script)
        item = self.wait('result', id=id, timeout=timeout)['result']
        if item.get('tag') != tag or 'error' in item:
            raise RuntimeError(item)
        return item.get('value')

    def close_window(self, id):
        self.send(op='close', id=id)
        self.wait('closed', id=id)

    def close(self):
        if self.process.poll() is None:
            with contextlib.suppress(OSError):
                self.send(op='quit')
            try:
                self.process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.process.terminate()
                try:
                    self.process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    self.process.kill()
                    self.process.wait(timeout=5)
        self.reader.join(timeout=3)
        for stream in (self.process.stdin, self.process.stdout, self.log):
            with contextlib.suppress(OSError):
                stream.close()
