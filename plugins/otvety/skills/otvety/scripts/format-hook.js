// UserPromptSubmit hook: injects response-format rules into context on every message.
// Edit ~/.claude/hooks/format-rules.md to change the rules; no restart needed.
const fs = require('fs');
const path = require('path');

const rulesPath = path.join(__dirname, 'format-rules.md');
let rules = '';
try {
  rules = fs.readFileSync(rulesPath, 'utf8').trim();
} catch (e) {
  // No rules file: exit silently so the prompt is not blocked.
  process.exit(0);
}

// {{ANTIAI}} -> absolute path to antiai-ru.md: next to the hook after install.js,
// or in ../references when running from the plugin.
const antiaiPath = [
  path.join(__dirname, 'antiai-ru.md'),
  path.join(__dirname, '..', 'references', 'antiai-ru.md'),
].find(p => fs.existsSync(p));
rules = rules.split('{{ANTIAI}}').join(antiaiPath || 'antiai-ru.md (файл не найден, держи краткий список ниже)');

// Drain stdin so the parent never blocks on a full pipe.
try { fs.readFileSync(0); } catch (e) {}

process.stdout.write(JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: rules,
  },
}));
