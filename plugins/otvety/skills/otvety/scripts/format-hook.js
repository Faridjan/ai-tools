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

// Drain stdin so the parent never blocks on a full pipe.
try { fs.readFileSync(0); } catch (e) {}

process.stdout.write(JSON.stringify({
  suppressOutput: true,
  hookSpecificOutput: {
    hookEventName: 'UserPromptSubmit',
    additionalContext: rules,
  },
}));
