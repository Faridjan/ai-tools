# otvety: короткие структурированные ответы Claude

Скилл заставляет Claude отвечать по каркасу «шапка / тело / футер»: вывод первой строкой, подробности списком, в конце рекомендация что делать. Без воды и ИИ-штампов. Правила на русском, подходят для Claude Code и claude.ai.

## Установка

### Вариант 0. Плагин для Claude Code (скил + хук, с обновлениями)

```
/plugin install otvety --marketplace Faridjan/ai-tools
```

Плагин сразу включает и скил, и хук на каждое сообщение, `install.js` не нужен. Обновление: `claude plugin marketplace update ai-tools`, затем `claude plugin update otvety@ai-tools`.

### Вариант 1. claude.ai (самый простой)

1. Открой claude.ai, раздел Skills, кнопка Add.
2. Загрузи файл `otvety.skill` (или этот zip).
3. Скилл синхронизируется на все твои машины с Claude Code.

### Вариант 2. Claude Code вручную

Распакуй папку `otvety` в `~/.claude/skills/` (глобально) или в `.claude/skills/` проекта.

### Вариант 3. Жёстко, на каждое сообщение

Скилл срабатывает по решению модели. Чтобы формат применялся всегда, поставь хук:

```bash
node ~/.claude/skills/otvety/scripts/install.js
```

Скрипт ставит хук в `~/.claude/settings.json` и скилл humanizer (анти-ИИ правила). Нужны node и интернет. Флаг `--no-humanizer` пропускает humanizer. После установки перезапусти сессию Claude Code.

Путь к скиллу может отличаться: если ставил через claude.ai, он лежит в `~/.claude/skills/synced/otvety`.

## Что внутри

| Файл | Зачем |
|---|---|
| `SKILL.md` | правила каркаса с пояснениями |
| `references/examples.md` | образцы ответов, включая «было / стало» |
| `scripts/format-rules.md` | сжатые правила, которые хук подмешивает в каждое сообщение |
| `scripts/format-hook.js` | сам хук |
| `scripts/install.js` | установщик хука и humanizer |

## Настройка под себя

Лимиты слов, метки футера и тон правятся в `scripts/format-rules.md` (для хука) и в `SKILL.md` (для скилла). Перезапуск после правки не нужен, хук читает файл на каждом сообщении.

Humanizer: https://github.com/blader/humanizer
