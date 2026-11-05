#!/usr/bin/env python3
"""Regression tests for the real-runtime acceptance client."""
import asyncio
import errno
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

spec = importlib.util.spec_from_file_location("local_fixture", Path(__file__).with_name("test-server-local.py"))
local = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local)


class Socket:
    def __init__(self, frames):
        self.frames = iter(frames)
        self.acks = []
        self.sent = []

    async def recv(self):
        try:
            return next(self.frames)
        except StopIteration:
            await asyncio.Future()

    async def send(self, value):
        self.sent.append(value)
        if isinstance(value, str):
            message = json.loads(value)
            if message.get("type") == "ack":
                self.acks.append(message)


class ProcessCleanupTests(unittest.IsolatedAsyncioTestCase):
    async def test_process_disappearing_during_read_counts_as_exited(self):
        for code in (errno.ENOENT, errno.ESRCH):
            with self.subTest(errno=code):
                with patch.object(Path, "read_text", side_effect=["123 (sleep) S 1", OSError(code, "process disappeared")]), \
                     patch.object(local.asyncio, "sleep", new_callable=AsyncMock) as sleep:
                    await local.wait_for_child_exit("123")
                sleep.assert_awaited_once_with(0.05)

    async def test_zombie_counts_as_exited_even_with_spaces_and_parentheses_in_name(self):
        with patch.object(Path, "read_text", return_value="123 (worker (test)) Z 1"), \
             patch.object(local.asyncio, "sleep", new_callable=AsyncMock) as sleep:
            await local.wait_for_child_exit("123")
        sleep.assert_not_awaited()

    async def test_live_process_still_fails_after_timeout(self):
        with patch.object(Path, "read_text", return_value="123 (sleep) S 1"), \
             patch.object(local.asyncio, "sleep", new_callable=AsyncMock) as sleep:
            with self.assertRaisesRegex(AssertionError, "foreground process 123 alive"):
                await local.wait_for_child_exit("123")
        self.assertEqual(sleep.await_count, 100)

    async def test_unrelated_read_errors_are_not_hidden(self):
        for code in (errno.EACCES, errno.EIO):
            with self.subTest(errno=code):
                with patch.object(Path, "read_text", side_effect=OSError(code, "read failed")):
                    with self.assertRaises(OSError) as error:
                        await local.wait_for_child_exit("123")
                self.assertEqual(error.exception.errno, code)


class OutputTests(unittest.IsolatedAsyncioTestCase):
    async def test_windows_acceptance_reads_both_file_versions_without_crlf(self):
        class FileChecksComplete(Exception):
            pass

        writes = []

        def api(path, *args, **kwargs):
            if path == "/local/capabilities":
                return {"windowsPty": True}
            if path == "/local/files/read":
                return {"content": "local-pty-proof\n", "revision": "first"}
            if path == "/local/files/write":
                writes.append(args[1])
            if path == "/logout":
                raise FileChecksComplete

        fixture = SimpleNamespace(windows=True, cwd="C:\\fixture", login=lambda: None, api=api)
        ws = Socket([b"\x1b[4;1Hlocal-", b"pty-proof\x1b[5;1H", b"edited-through-web\x1b[6;1H"])
        with patch.object(local, "open_terminal", new=AsyncMock(return_value=ws)):
            with self.assertRaises(FileChecksComplete):
                await asyncio.wait_for(local.verify(fixture), 0.5)
        self.assertEqual(writes[0]["content"], "edited-through-web\n")
        self.assertNotIn(b"local-pty-proof", b"".join(v for v in ws.sent if isinstance(v, bytes)))
        self.assertEqual(ws.sent.count(b"type pty-proof.txt\r"), 2)

    async def test_conpty_cursor_positioning_and_split_output_do_not_require_crlf(self):
        frames = [
            b"set QTERM_PROOF=local-pty\r\necho %QTERM_PROOF%-proof>pty-proof.txt\r\ntype pty-proof.txt\r\n",
            b"\x1b[4;1Hlocal-",
            b"pty-proof\x1b[5;1H",
        ]
        ws = Socket([json.dumps({"type": "cwd", "cwd": "C:\\fixture"}), *frames])
        result = await local.output_until(ws, rb"local-pty-proof", timeout=1)
        self.assertEqual(result, b"".join(frames))
        self.assertNotIn(b"local-pty-proof\r\n", result)
        self.assertEqual(ws.acks, [{"type": "ack", "bytes": len(frame)} for frame in frames])

    async def test_echoed_input_alone_does_not_prove_that_type_read_the_file(self):
        ws = Socket([b"set QTERM_PROOF=local-pty\r\necho %QTERM_PROOF%-proof>pty-proof.txt\r\ntype pty-proof.txt"])
        with self.assertRaisesRegex(AssertionError, "TimeoutError.*output tail=.*type pty-proof"):
            await local.output_until(ws, rb"local-pty-proof", timeout=0.01)

    async def test_posix_line_sensitive_match_still_spans_multiple_frames(self):
        ws = Socket([b"37 11", b"1\r", b"\n"])
        self.assertEqual(await local.output_until(ws, rb"37 111\r?\n"), b"37 111\r\n")

    async def test_terminal_failure_and_exit_are_reported_without_waiting_for_timeout(self):
        for event in ({"type": "error", "code": "screenUnavailable"}, {"type": "exit", "exitCode": 1}, {"type": "resync"}):
            with self.subTest(event=event):
                ws = Socket([b"partial output", json.dumps(event)])
                with self.assertRaisesRegex(AssertionError, "Terminal event.*partial output"):
                    await local.output_until(ws, b"missing marker", timeout=1)

    async def test_timeout_diagnostics_preserve_escape_bytes_and_bound_output(self):
        ws = Socket([b"x" * 4000 + b"\x1b[5;1Hlast output"])
        with self.assertRaises(AssertionError) as error:
            await local.output_until(ws, b"missing marker", timeout=0.01)
        message = str(error.exception)
        self.assertIn("missing marker", message)
        self.assertIn(r"\x1b[5;1Hlast output", message)
        self.assertLess(len(message), 2300)


if __name__ == "__main__":
    unittest.main()
