#!/usr/bin/env node
// Ставит хук формата ответов в ~/.claude (Windows, macOS, Linux).
// Запуск из любой папки:  node <путь к скиллу>/scripts/install.js
// Что делает: копирует format-rules.md, format-hook.js и antiai-ru.md в ~/.claude/hooks,
// добавляет UserPromptSubmit-хук в ~/.claude/settings.json (не трогая остальное).
const fs = require('fs');
const path = require('path');
const os = require('os');

const here = __dirname;
const claudeDir = path.join(os.homedir(), '.claude');
const hooksDir = path.join(claudeDir, 'hooks');
const settingsPath = path.join(claudeDir, 'settings.json');

fs.mkdirSync(hooksDir, { recursive: true });
for (const name of ['format-rules.md', 'format-hook.js']) {
  fs.copyFileSync(path.join(here, name), path.join(hooksDir, name));
}
// Анти-ИИ правила, на которые ссылается format-rules.md (хук подставляет путь).
fs.copyFileSync(path.join(here, '..', 'references', 'antiai-ru.md'), path.join(hooksDir, 'antiai-ru.md'));

let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, 'utf8');
  try {
    settings = JSON.parse(raw);
  } catch (e) {
    console.error('settings.json не парсится, ничего не меняю:', e.message);
    process.exit(1);
  }
  fs.copyFileSync(settingsPath, settingsPath + '.bak');
}

const hookPath = path.join(hooksDir, 'format-hook.js').split(path.sep).join('/');
settings.hooks = settings.hooks || {};
settings.hooks.UserPromptSubmit = settings.hooks.UserPromptSubmit || [];
const already = settings.hooks.UserPromptSubmit.some(g =>
  (g.hooks || []).some(h => (h.args || []).join(' ').includes('format-hook.js') || (h.command || '').includes('format-hook.js'))
);
if (!already) {
  settings.hooks.UserPromptSubmit.push({
    hooks: [{ type: 'command', command: 'node', args: [hookPath], timeout: 10, statusMessage: 'Формат ответа' }],
  });
}
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

console.log('Хук установлен:');
console.log('  правила  ' + path.join(hooksDir, 'format-rules.md'));
console.log('  скрипт   ' + hookPath);
console.log('  анти-ИИ  ' + path.join(hooksDir, 'antiai-ru.md'));
console.log('  settings ' + settingsPath + (already ? ' (хук уже был)' : ''));

console.log('Перезапусти сессию Claude Code, чтобы всё подхватилось.');
