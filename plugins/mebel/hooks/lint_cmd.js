#!/usr/bin/env node
// Hook of the mebel plugin: checks Bazis command files before they reach the agent.
//
//   PostToolUse Write|Edit   a cmd_*.js (or any .js in _claude) was written: syntax, Node 8, forbidden calls.
//                            lib.js / Claude Agent.js / *.ps1 of the runtime: ASCII only, syntax.
//   PreToolUse  Bash|PowerShell   "bz.ps1 -File X": the same check on X, a broken file is not sent to Bazis.
//   PostToolUse Bash|PowerShell   warnings for that file, and a reminder to run the final review
//                                 when a specification or a cloud copy is being produced.
//
// Errors go to stderr with exit code 2 (Claude sees them and fixes the file), warnings go back as
// additional context. The hook never blocks anything it does not recognise and never throws.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Syntax that parses in a modern Node but not in Node 8.11 inside Bazis 11.
const NODE8 = [
  [/\?\.(?!\d)/, 'optional chaining ?.'],
  [/\?\?/, 'nullish coalescing ??'],
  [/\bcatch\s*\{/, 'catch without a binding: write catch (e)'],
  [/\.flat(Map)?\s*\(/, 'Array.flat / flatMap'],
  [/\bObject\.fromEntries\b/, 'Object.fromEntries'],
  [/\.matchAll\s*\(/, 'String.matchAll'],
  [/\.replaceAll\s*\(/, 'String.replaceAll'],
  [/\.trim(Start|End)\s*\(/, 'trimStart / trimEnd'],
  [/\.at\s*\(/, 'Array.at / String.at'],
  [/\bglobalThis\b/, 'globalThis'],
  [/\bBigInt\b|\b\d+n\b/, 'BigInt'],
  [/\bPromise\.(allSettled|any)\b/, 'Promise.allSettled / any'],
  [/\b\d+_\d+\b/, 'numeric separator 1_000'],
  [/\bfor\s+await\b/, 'for await'],
  [/(^|[;{}\s])#[A-Za-z_]\w*\s*[=(;]/, 'private class field #x'],
  [/^\s*(import|export)\s/m, 'import / export (use require)'],
  [/\|\|=|&&=/, 'logical assignment ||= &&='],
  [/\bstructuredClone\b/, 'structuredClone']
];
// Checked on the raw text, because they live inside regex literals
const NODE8_RAW = [
  [/\(\?<[=!]/, 'regex lookbehind (?<= ... )'],
  [/\(\?<[A-Za-z]/, 'regex named group (?<name> ... )']
];
const FORBIDDEN = [
  [/\b(alert|confirm|prompt)\s*\(/, 'alert / confirm / prompt are off (Action.Interactive = false): the command would hang'],
  [/\bprocess\.exit\s*\(/, 'process.exit would close Bazis itself'],
  [/(^|[^.\w])(BZ|V|log)\s*=[^=]/, 'BZ, V and log must not be reassigned'],
  [/\bfunction\s+(log|V)\s*\(/, 'log and V must not be redefined'],
  [/\b(var|let|const)\s+(BZ|V|log)\b/, 'BZ, V and log must not be redeclared']
];
const WARN = [
  [/\bMath\.PI\b/, 'Math.PI: Bazis rotations take degrees, not radians (RotateGCS(AxisY, 90))'],
  [/\.Position[XYZ]\s*[-+]?=[^=]/, 'PositionX/Y/Z are local to the owner block: move with BZ.move (TranslateGCS)'],
  [/\bAction\.SaveModel\s*\(|\bBZ\.save\s*\(/, 'saving the model file: only when the user asked for it'],
  [/\bAction\.LoadModel\s*\(|\bLoadModel\s*\(/, 'LoadModel drops unsaved changes of the open model'],
  [/\bsystem\.sleep\s*\(/, 'system.sleep blocks the Bazis window'],
  [/\bwhile\s*\(\s*(true|1)\s*\)/, 'endless loop blocks the Bazis window: Windows may close it as hung'],
  [/\b(Add(Vert|Horiz|Front)Panel|AddExtrusion)\s*\(/, 'new geometry: hardware must come from the library (OpenFurniture), panels through BZ.addBox'],
  [/\.Mount(Box|1)?\s*\(/, 'mounting hardware: doors and drawers must be closed (animation), then check hardware against panels with review.ps1']
];

// Blank out comments and string contents, keep line structure. Regex literals are not recognised,
// which is fine for the patterns above.
function strip(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') { while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; } out += '  '; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      out += c; i++;
      while (i < n && src[i] !== c) {
        if (src[i] === '\\') { out += '  '; i += 2; continue; }
        if (c === '`' && src[i] === '$' && src[i + 1] === '{') {   // keep code inside ${...}
          let depth = 0;
          do { if (src[i] === '{') depth++; if (src[i] === '}') depth--; out += src[i]; i++; } while (i < n && depth > 0);
          continue;
        }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      out += c; i++; continue;
    }
    out += c; i++;
  }
  return out;
}
function lineOf(text, index) { return text.slice(0, index).split('\n').length; }
function scan(text, rules, out, raw) {
  for (const [re, msg] of rules) {
    const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
    if (m) out.push('line ' + lineOf(raw || text, m.index) + ': ' + msg);
  }
}

function lintCommand(src, name) {
  const errors = [], warnings = [];
  src = String(src).replace(/^﻿/, '');
  try { new vm.Script('{' + src + '\n}', { filename: name || 'cmd.js' }); }
  catch (e) {
    const m = /:(\d+)\n/.exec(String(e.stack || ''));
    errors.push((m ? 'line ' + m[1] + ': ' : '') + 'syntax error: ' + e.message);
  }
  const code = strip(src);
  scan(code, NODE8, errors);
  scan(src, NODE8_RAW, errors);
  scan(code, FORBIDDEN, errors);
  scan(code, WARN, warnings);
  return { errors, warnings };
}

// lib.js and the agent are read by Bazis as ANSI: one non-ASCII byte breaks the load.
function lintRuntime(buf, name) {
  const errors = [], warnings = [];
  if (!Buffer.isBuffer(buf)) buf = Buffer.from(String(buf), 'utf8');
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > 126) { errors.push('line ' + lineOf(buf.toString('latin1'), i) + ': non-ASCII byte, write Cyrillic as \\uXXXX (Bazis reads this file as ANSI)'); break; }
  }
  if (/\.js$/i.test(name)) {
    const src = buf.toString('latin1');
    try { new vm.Script(src, { filename: name }); } catch (e) { errors.push('syntax error: ' + e.message); }
    scan(strip(src), NODE8, errors);
    scan(src, NODE8_RAW, errors);
  }
  return { errors, warnings };
}

const RUNTIME_JS = /^(lib\.js|claude agent\.js|agent-loop-fallback\.js)$/i;
const RUNTIME_PS = /^(bz\.ps1|install\.ps1)$/i;
function kindOf(file) {
  const base = path.basename(file), dir = file.replace(/\\/g, '/').toLowerCase();
  const ours = dir.indexOf('/_claude/') >= 0 || dir.indexOf('/bazis-script/scripts/') >= 0 || dir.indexOf('/model-review/scripts/') >= 0 || /\/bazis11\/scripts\//.test(dir);
  if (ours && (RUNTIME_JS.test(base) || RUNTIME_PS.test(base))) return 'runtime';
  if (/^cmd_.*\.js$/i.test(base)) return 'command';
  if (dir.indexOf('/_claude/') >= 0 && /\.js$/i.test(base) && dir.indexOf('/_claude/ref/') < 0) return 'command';
  return null;
}
function lintFile(file) {
  const kind = kindOf(file);
  if (!kind || !fs.existsSync(file)) return null;
  const buf = fs.readFileSync(file);
  return kind === 'runtime' ? lintRuntime(buf, path.basename(file)) : lintCommand(buf.toString('utf8'), path.basename(file));
}

// "… bz.ps1 … -File <path>" -> path of the command file
function commandFile(cmd, cwd) {
  const at = cmd.toLowerCase().indexOf('bz.ps1');
  if (at < 0) return null;
  const m = /-File\s+(?:"([^"]+)"|'([^']+)'|(\S+))/i.exec(cmd.slice(at + 6));
  if (!m) return null;
  const p = m[1] || m[2] || m[3];
  return path.isAbsolute(p) ? p : path.resolve(cwd || process.cwd(), p);
}

function reviewNote(cmd) {
  if (!/make-spec-xlsx|build_spec|cloud_copy|cmd_spec|ArrangePositions/i.test(cmd)) return null;
  if (/review\.ps1/i.test(cmd)) return null;
  let state = 'no review report found';
  try {
    const m = /([A-Za-z]:[\\/][^"'\s]*?)[\\/]_claude[\\/]/.exec(cmd);
    const bazis = m ? m[1] : path.join(process.env.USERPROFILE || '', 'Documents', 'Bazis11');
    const rep = path.join(bazis, '_claude', 'review', 'review_report.json');
    if (fs.existsSync(rep)) {
      const j = JSON.parse(fs.readFileSync(rep, 'utf8'));
      const ageMin = Math.round((Date.now() - fs.statSync(rep).mtimeMs) / 60000);
      state = 'last review: ' + (j.ready ? 'READY' : 'NOT READY') + ', mode ' + j.mode + ', ' + ageMin + ' min ago' + (ageMin > 30 ? ' (stale: the model may have changed)' : '');
    }
  } catch (e) {}
  return 'mebel: a specification or a copy for the shop is being produced. Before the model goes to cutting run the final review ' +
    '(skill mebel:model-review, review.ps1 -Mode handoff) and report its verdict to the user. ' + state + '.';
}

function main() {
  let input = {};
  try { input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { process.exit(0); }
  const ev = input.hook_event_name, tool = input.tool_name, ti = input.tool_input || {};
  const say = text => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: ev, additionalContext: text } }));
  const block = (file, errors) => {
    process.stderr.write('mebel: ' + path.basename(file) + ' will not work in Bazis (Node 8 inside Bazis 11):\n  ' + errors.join('\n  ') + '\nFix the file' + (ev === 'PreToolUse' ? ' before sending it to the agent.' : '.') + '\n');
    process.exit(2);
  };

  if (/^(Write|Edit|MultiEdit)$/.test(tool) && ev === 'PostToolUse' && ti.file_path) {
    const res = lintFile(ti.file_path);
    if (!res) return;
    if (res.errors.length) block(ti.file_path, res.errors);
    if (res.warnings.length) say('mebel: check ' + path.basename(ti.file_path) + ' before running it:\n  ' + res.warnings.join('\n  '));
    return;
  }
  if (/^(Bash|PowerShell)$/.test(tool) && typeof ti.command === 'string') {
    const file = commandFile(ti.command, input.cwd);
    const res = file ? lintFile(file) : null;
    if (ev === 'PreToolUse') { if (res && res.errors.length) block(file, res.errors); return; }
    const notes = [];
    if (res && res.warnings.length) notes.push('mebel: ' + path.basename(file) + ':\n  ' + res.warnings.join('\n  '));
    const rn = reviewNote(ti.command); if (rn) notes.push(rn);
    if (notes.length) say(notes.join('\n'));
  }
}

module.exports = { lintCommand, lintRuntime, lintFile, kindOf, commandFile, reviewNote, strip };
if (require.main === module) { try { main(); } catch (e) { process.exit(0); } }
