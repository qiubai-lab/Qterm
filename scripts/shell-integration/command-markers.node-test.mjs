import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const bash = process.env.QTERM_TEST_BASH || "bash";
const available = spawnSync(bash, ["--version"], { encoding: "utf8", windowsHide: true }).status === 0;
const script = fileURLToPath(new URL("./qterm.bash", import.meta.url)).replaceAll("\\", "/");
const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
const run = (input, interactive = true) => spawnSync(bash, ["--noprofile", "--norc", ...(interactive ? ["-i"] : [])], {
  input, encoding: "utf8", windowsHide: true, timeout: 10000, env: { ...process.env, HISTFILE: "/dev/null", TERM: "xterm-256color" },
});

test("Bash integration preserves prompt hooks and reports pipeline exit status without duplicate installation", { skip: !available && "Bash unavailable; set QTERM_TEST_BASH" }, () => {
  const result = run([
    "PS1='original> '; PROMPT_COMMAND='printf \"old-hook:%s\\n\" \"$?\"'",
    `source ${quote(script)}`,
    "printf 'first-output\\n'; false",
    `source ${quote(script)}`,
    "printf 'second-output\\n'",
    "exit 0", "",
  ].join("\n"));
  assert.equal(result.status, 0, result.stderr);
  // Bash renders PS0/PS1 on stderr and precmd output on stdout.
  assert.match(result.stderr, /\x1b\]133;A\x07original> \x1b\]133;B\x07/);
  assert.match(result.stdout, /first-output\r?\n\x1b\]133;D;1\x07old-hook:1/);
  assert.match(result.stdout, /second-output/);
  assert.equal((result.stderr.match(/\x1b\]133;C\x07/g) || []).length, 4);
  assert.doesNotMatch(result.stderr, /(?:\x1b\]133;C\x07){2}/);
});

test("Bash integration leaves noninteractive shells unchanged", { skip: !available && "Bash unavailable; set QTERM_TEST_BASH" }, () => {
  const result = run(`source ${quote(script)}\nprintf 'ordinary-output'\n`, false);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "ordinary-output");
});
