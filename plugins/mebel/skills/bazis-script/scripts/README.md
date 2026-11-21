# Скрипты скила bazis-script

Здесь лежит всё, что нужно для работы с Базисом: агент, библиотека, запуск команд, генераторы чертежей, образцы команд и официальные примеры BazisSoft. Плагин единственный источник, в `Documents\Bazis11\_claude` живёт только развёрнутая копия и служебные файлы обмена.

Развернуть или обновить рабочую папку:

```
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
```

`install.ps1` создаёт `Documents\Bazis11\_claude`, кладёт туда `lib.js`, `bz.ps1`, `make-spec-xlsx.ps1`, `agent-loop-fallback.js`, `probe.js`, генераторы из `drawings\`, `cmd_selftest.js`, `cmd_probe_library.js` и `ref\BazisSoft-Scripts`, копирует `Claude Agent.js` в `Documents\Bazis11\Scripts\` и пишет версию плагина в `_claude\plugin_version.txt`. Папку `_claude` можно удалять: установщик её вернёт.

Править скрипты только в репозитории плагина, затем обновить плагин и снова запустить `install.ps1`. Правка в `_claude` пропадёт при следующей установке.

## Базис

| Файл | Что делает |
|---|---|
| `Claude Agent.js` | резидентный агент внутри БАЗИС-Мебельщика 11: запускается из меню Скрипты → Claude Agent, ждёт команды в `_claude\cmd.js`, пишет результат в `result.json`, heartbeat в `heartbeat.json` |
| `lib.js` | библиотека `BZ.*`: поиск объектов, панели, пазы, торцы, перемещение, размеры, снимки и сравнение модели, спецификация, бэкап и сохранение |
| `bz.ps1` | отправить команду агенту и дождаться ответа: `bz.ps1 -File cmd_xxx.js`, `-Status`, `-Raw`, `-Stop` |
| `make-spec-xlsx.ps1` | спецификация в Excel |

Как пользоваться:
1. В Базисе открыть модель, запустить Скрипты → Claude Agent.
2. `powershell -File bz.ps1 -Status` — агент жив?
3. `powershell -File bz.ps1 -File cmd_xxx.js` — выполнить скрипт.
4. Перед правками — `BZ.backup()`, после — `BZ.save()`.

## Чертежи и спецификация (`drawings`)

| Файл | Что делает |
|---|---|
| `draw_elevation.py` | SVG-чертежи (вид спереди, фасад с петлями, вид сбоку) из `dump_draw.json` → `elevation.svg.html` |
| `build_page.py` | собирает страницу чертежей по `page_template.html` |
| `render_images.py` | PNG чертежей через headless Edge |
| `build_spec.py` | спецификация HTML и CSV распила из `spec_full.json` |

Запуск Python: `py -3 файл.py` (команда `python` в системе ведёт в Microsoft Store).
Порядок: `cmd_dump_draw.js` и `cmd_spec_full.js` в Базисе → `draw_elevation.py` → `build_page.py` → `render_images.py`; `build_spec.py`.

## Образцы команд

`examples\` содержит готовые `cmd_*.js` из проекта шкафа, брать как основу для новых команд.

| Скрипт | Образец для |
|---|---|
| `cmd_cloud_copy5.js` | копия модели для БАЗИС-Облака (удаление неподдерживаемой фурнитуры, расширение узких деталей) |
| `cmd_audit_full.js`, `cmd_audit5.js` | сквозная проверка: пересечения, зазоры, пазы против присадки |
| `cmd_check_visible_holes.js` | отверстия на видимых сторонах |
| `cmd_holes_machinable.js` | что из присадки просверлит станок |
| `cmd_hinges_6_wide.js` | перестановка петель на двери |
| `cmd_led_fix_faces.js` | сдвиг пазов по пластям |
| `cmd_dtc_swap.js`, `cmd_dtc_softclose.js` | замена комплектов направляющих ящиков |
| `cmd_spec_full.js`, `cmd_dump_draw.js` | выгрузка данных для спецификации и чертежей |

