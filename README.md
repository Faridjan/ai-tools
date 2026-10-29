# ai-tools

Маркетплейс плагинов для Claude Code: скилы, хуки и моды. Каждый плагин лежит в своей папке в `plugins/`, список плагинов в `.claude-plugin/marketplace.json`.

| Плагин | Что делает |
|---|---|
| [`otvety`](plugins/otvety) | Короткие ответы по каркасу «шапка / тело / футер», без ИИ-штампов. Скил + хук на каждое сообщение. |
| [`handwritten`](plugins/handwritten) | Визуал-конспект в стиле рукописных заметок: HTML-холст как в Miro и PNG. |

## Установка

В сессии Claude Code, одной строкой (Claude Code 2.1.275+):

```
/plugin install otvety --marketplace Faridjan/ai-tools
```

Claude спросит, добавить ли маркетплейс (`y`), и куда ставить (для себя, для проекта).

Или в два шага, сначала подключить маркетплейс, потом ставить плагины:

```
/plugin marketplace add Faridjan/ai-tools
/plugin install otvety@ai-tools
/plugin install handwritten@ai-tools
```

Из терминала то же самое:

```bash
claude plugin marketplace add Faridjan/ai-tools
claude plugin install otvety@ai-tools
```

## Обновление

```bash
claude plugin marketplace update ai-tools
claude plugin update otvety@ai-tools
```

В `/plugin` → Marketplaces можно включить автообновление маркетплейса. После обновления перезапусти сессию.

## Для команды

Чтобы всем в проекте предлагалось поставить плагины, добавь в `.claude/settings.json` проекта:

```json
{
  "extraKnownMarketplaces": {
    "ai-tools": { "source": { "source": "github", "repo": "Faridjan/ai-tools" } }
  },
  "enabledPlugins": {
    "otvety@ai-tools": true
  }
}
```

## Как добавить или изменить плагин

1. Новый плагин: папка `plugins/<имя>/` с `.claude-plugin/plugin.json` (`name`, `version`, `description`) и нужными частями:
   - `skills/<скил>/SKILL.md` — скилы;
   - `hooks/hooks.json` — хуки (пути к скриптам через `${CLAUDE_PLUGIN_ROOT}`);
   - `commands/`, `agents/` — слэш-команды и агенты;
   - `hooks/hooks.json` с `{ "modules": ["./register.tsx"] }` — мод.
2. Запиши плагин в `.claude-plugin/marketplace.json`.
3. При любом изменении плагина подними `version` в его `plugin.json`, иначе у людей останется закешированная старая версия.
4. Проверь перед коммитом:

   ```bash
   claude plugin validate .
   claude plugin validate plugins/<имя>
   ```

Локально, без установки, плагин запускается так: `claude --plugin-dir plugins/<имя>`.

## Для claude.ai

Веб и десктоп ставят скилы архивом, а не из маркетплейса: заархивируй папку скила (`plugins/<имя>/skills/<скил>`) в zip и загрузи в claude.ai → Skills. Готовые архивы удобно прикладывать к GitHub Release.
