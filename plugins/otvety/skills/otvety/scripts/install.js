#!/usr/bin/env node
// Ставит хук формата ответов в ~/.claude (Windows, macOS, Linux).
// Запуск из любой папки:  node <путь к скиллу>/scripts/install.js
// Что делает: копирует format-rules.md и format-hook.js в ~/.claude/hooks,
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
console.log('  settings ' + settingsPath + (already ? ' (хук уже был)' : ''));

// Humanizer (blader/humanizer): хук ссылается на него, без него работает краткий список.
// Пропустить: node install.js --no-humanizer
const humanizerDir = path.join(claudeDir, 'skills', 'humanizer');
if (process.argv.includes('--no-humanizer')) {
  console.log('Humanizer пропущен (--no-humanizer).');
} else if (fs.existsSync(path.join(humanizerDir, 'SKILL.md'))) {
  console.log('Humanizer уже стоит: ' + humanizerDir);
} else {
  console.log('Ставлю humanizer через npx (нужен интернет)...');
  const { spawnSync } = require('child_process');
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const r = spawnSync(npx, ['-y', 'skills', 'add', 'blader/humanizer', '--global', '--agent', 'claude-code', '--yes'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status === 0 && fs.existsSync(path.join(humanizerDir, 'SKILL.md'))) {
    console.log('Humanizer установлен: ' + humanizerDir);
  } else {
    console.log('Humanizer не встал. Поставь вручную:');
    console.log('  npx skills add blader/humanizer --global --agent claude-code');
    console.log('Хук при этом работает по краткому списку запрещённого.');
  }
}

console.log('Перезапусти сессию Claude Code, чтобы всё подхватилось.');
