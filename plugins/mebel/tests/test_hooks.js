// Tests of hooks/lint_cmd.js: the rules and the hook protocol (stdin JSON, exit codes).
// Run: node plugins/mebel/tests/test_hooks.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const lint = require('../hooks/lint_cmd.js');

const HOOK = path.join(__dirname, '..', 'hooks', 'lint_cmd.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mebel-hook-'));
const work = path.join(tmp, 'Bazis11', '_claude');
fs.mkdirSync(work, { recursive: true });
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.stack || e).split('\n').slice(0, 6).join('\n  ')); }
}
const errs = src => lint.lintCommand(src, 'cmd_x.js').errors;
const warns = src => lint.lintCommand(src, 'cmd_x.js').warnings;
function hook(input) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
function file(name, text) { const p = path.join(work, name); fs.writeFileSync(p, text); return p; }

test('valid Node 8 command passes', () => {
  assert.deepStrictEqual(errs("const a = BZ.panels().map(o => o.Name); for (const n of a) log(`n=${n}`); try { x(); } catch (e) {} ({ n: a.length });"), []);
  assert.deepStrictEqual(errs("const v = cond ? .5 : 1; const s = 'a?.b ?? c'; // x?.y\n/* a ?? b */ v;"), []);
});

test('syntax error is reported with its line', () => {
  const e = errs('const a = 1;\nconst b = ;\n');
  assert.ok(e.length && /line 2/.test(e[0]) && /syntax/.test(e[0]), e.join());
  assert.ok(errs('return 5;').length, 'top-level return is illegal inside the agent block');
});

test('syntax newer than Node 8 is rejected', () => {
  for (const src of ['a?.b', 'a ?? b', 'try { f(); } catch { }', '[[1]].flat()', 'Object.fromEntries([])', "'a'.replaceAll('a', 'b')",
                     '[1].at(-1)', '1_000', 'x ||= 1', '/(?<=a)b/.test(s)', '/(?<name>a)/.test(s)', "'a'.trimEnd()"]) {
    assert.ok(errs(src).length, 'not caught: ' + src);
  }
});

test('forbidden calls are rejected', () => {
  for (const src of ["alert('x')", 'if (confirm("?")) {}', 'process.exit(0)', 'BZ = {}', 'const log = 1', 'function V() {}']) {
    assert.ok(errs(src).length, 'not caught: ' + src);
  }
  assert.deepStrictEqual(errs('BZ.autoInspect = false; if (BZ === x) {} obj.log = 1; const logs = [];'), []);
});

test('risky calls give warnings, not errors', () => {
  const w = warns('blk.RotateGCS(AxisY, Math.PI / 2); o.PositionX += 5; BZ.save(); OpenFurniture(f).Mount(a, b, 0, 0, 0);');
  assert.strictEqual(w.length, 4, w.join('\n'));
  assert.deepStrictEqual(errs('blk.RotateGCS(AxisY, Math.PI / 2); o.PositionX += 5; BZ.save();'), []);
  assert.deepStrictEqual(warns('const x = o.PositionX; if (o.PositionY === 3) {}'), []);
});

test('runtime files must be ASCII', () => {
  assert.ok(lint.lintRuntime(Buffer.from("var a = '\u043a';", 'utf8'), 'lib.js').errors.length);
  assert.deepStrictEqual(lint.lintRuntime(Buffer.from("var a = '\\u043a';"), 'lib.js').errors, []);
  assert.ok(lint.lintRuntime(Buffer.from('# \u043a\u043e\u043c\u043c\u0435\u043d\u0442', 'utf8'), 'bz.ps1').errors.length);
});

test('file kinds', () => {
  assert.strictEqual(lint.kindOf('C:\\x\\Bazis11\\_claude\\cmd_a.js'), 'command');
  assert.strictEqual(lint.kindOf('C:\\x\\Bazis11\\_claude\\lib.js'), 'runtime');
  assert.strictEqual(lint.kindOf('D:\\repo\\plugins\\mebel\\skills\\bazis-script\\scripts\\Claude Agent.js'), 'runtime');
  assert.strictEqual(lint.kindOf('D:\\any\\cmd_task.js'), 'command');
  assert.strictEqual(lint.kindOf('C:\\x\\Bazis11\\_claude\\ref\\BazisSoft-Scripts\\a.js'), null);
  assert.strictEqual(lint.kindOf('D:\\other\\lib.js'), null);
  assert.strictEqual(lint.kindOf('D:\\other\\app.js'), null);
});

test('command file is found in a bz.ps1 call', () => {
  assert.strictEqual(lint.commandFile('powershell -NoProfile -File C:\\B\\_claude\\bz.ps1 -File "C:\\B\\_claude\\cmd a.js" -NoInspect'), 'C:\\B\\_claude\\cmd a.js');
  assert.strictEqual(lint.commandFile('powershell -File C:\\B\\_claude\\bz.ps1 -Status'), null);
  assert.strictEqual(lint.commandFile('git status'), null);
  assert.strictEqual(lint.commandFile('powershell -File bz.ps1 -File cmd_r.js', 'C:\\B\\_claude'), 'C:\\B\\_claude\\cmd_r.js');
});

test('hook: broken command written -> exit 2 with the reason', () => {
  const p = file('cmd_bad.js', 'const a = o?.Name;\n');
  const r = hook({ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: p } });
  assert.strictEqual(r.code, 2); assert.ok(/optional chaining/.test(r.err), r.err);
});

test('hook: warnings come back as additional context', () => {
  const p = file('cmd_warn.js', 'BZ.save();\n');
  const r = hook({ hook_event_name: 'PostToolUse', tool_name: 'Edit', tool_input: { file_path: p } });
  assert.strictEqual(r.code, 0);
  assert.ok(/only when the user asked/.test(JSON.parse(r.out).hookSpecificOutput.additionalContext));
});

test('hook: broken file is stopped before bz.ps1 sends it', () => {
  const p = file('cmd_pre.js', "alert('hi');\n");
  const cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File ' + path.join(work, 'bz.ps1') + ' -File ' + p;
  assert.strictEqual(hook({ hook_event_name: 'PreToolUse', tool_name: 'PowerShell', tool_input: { command: cmd } }).code, 2);
  const ok = file('cmd_ok.js', "log('fine');\n");
  const r = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: cmd.replace(p, ok) } });
  assert.strictEqual(r.code, 0); assert.strictEqual(r.out, '');
});

test('hook: stays silent on everything else', () => {
  for (const input of [{ hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(tmp, 'notes.md') } },
                       { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'git status' } },
                       { hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'npm test' } },
                       { hook_event_name: 'PostToolUse', tool_name: 'Write', tool_input: { file_path: path.join(work, 'missing.js') } }, {}]) {
    const r = hook(input);
    assert.strictEqual(r.code, 0, JSON.stringify(input)); assert.strictEqual(r.out, ''); assert.strictEqual(r.err, '');
  }
  const r = spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
});

test('hook: reminds about the final review when a specification is produced', () => {
  const cmd = 'powershell -File ' + path.join(work, 'make-spec-xlsx.ps1');
  let r = hook({ hook_event_name: 'PostToolUse', tool_name: 'PowerShell', tool_input: { command: cmd } });
  assert.ok(/review\.ps1 -Mode handoff/.test(r.out) && /no review report found/.test(r.out), r.out);
  fs.mkdirSync(path.join(work, 'review'), { recursive: true });
  fs.writeFileSync(path.join(work, 'review', 'review_report.json'), JSON.stringify({ ready: false, mode: 'handoff' }));
  r = hook({ hook_event_name: 'PostToolUse', tool_name: 'PowerShell', tool_input: { command: cmd } });
  assert.ok(/NOT READY/.test(r.out), r.out);
  assert.strictEqual(lint.reviewNote('powershell -File review.ps1 -Mode handoff; make-spec-xlsx'), null);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
