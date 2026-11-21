# -*- coding: utf-8 -*-
"""Спецификация шкафа: HTML-страница и CSV для распила из spec_full.json"""
import json, html, sys, csv, io, math

SRC = r"C:\Users\Jarvis\Documents\Bazis11\_claude\spec_full.json"
OUT_HTML = sys.argv[1]
OUT_CSV = sys.argv[2]
d = json.load(open(SRC, encoding="utf-8"))

# ---------- детали ----------
ORDER = ["Стойка", "Стойка антресоли", "Перегородка", "Перегородка антресоли", "Дно", "Крышка", "Дно антресоли", "Крышка антресоли",
         "Полка", "Цоколь видимый", "Цоколь", "Фальшпланка", "Подложка", "Дверь", "Ящик фасад", "Бок ящ", "Зад. ст", "Дно ящ", "Задняя стенка"]
def rank(n):
    n = n.replace("ШС - ", "")
    best, blen = len(ORDER), -1
    for i, w in enumerate(ORDER):
        if n.startswith(w) and len(w) > blen:
            best, blen = i, len(w)
    return best

# Длина вдоль текстуры: у вертикальных деталей и фасадов высота, у горизонтальных ширина
def grain_dims(row):
    n = row["name"].replace("ШС - ", ""); L, W = row["L"], row["W"]
    if n.startswith("Дверь") or n.startswith("Ящик фасад"):
        # высота двери: 2343 или 593; фасада ящика: 126 или 190
        h = min(L, W) if (n.startswith("Ящик фасад") or n.startswith("Дверь антресоли")) else max(L, W)
        w = L + W - h
        return h, w, "вдоль высоты"
    if n.startswith("Полка") and W == 562 and L == 587:      # козырёк 587 глубиной, 562 шириной
        return 562, 587, "вдоль ширины"
    if n.startswith("Перегородка антресоли"):                  # 565 высота, 587 глубина
        return 565, 587, "вдоль высоты"
    if n.startswith("Задняя стенка"):
        return L, W, "без рисунка"
    return L, W, "вдоль длины"

def edge_text(row):
    n = row["name"].replace("ШС - ", ""); b = row["butts"]
    if b == 0: return "без кромки"
    if b == 4: return "0,8 мм по периметру"
    if n.startswith("Бок ящ"): return "0,8 мм: верх, перед, зад"
    if n.startswith("Зад. ст"): return "0,8 мм: верх и низ"
    if b == 1:
        if n.startswith("Цоколь видимый"): return "0,8 мм: верхний торец"
        if n.startswith("Фальшпланка"): return "0,8 мм: наружный торец"
        return "0,8 мм: передний торец"
    return f"0,8 мм: {b} торца"

def notes(row):
    n = row["name"].replace("ШС - ", ""); out = []
    if n.startswith("Стойка") and row["cuts"]: out.append("паз 12x5 под LED-ленту в пласти")
    if n.startswith("Перегородка") and row["cuts"] == 2: out.append("два паза 12x5 под LED-ленту, по одному с каждой пласти")
    if n.startswith("Полка") and row["cuts"]: out.append("козырёк над ящиками, паз 12x5 в нижней пласти, ось 576 от стены")
    if n.startswith("Дверь"): out.append("накладная, петли DTC Pivot Star с доводчиком, ручка по месту")
    if n.startswith("Ящик фасад"): out.append("вкладной фасад шкатулки")
    if n.startswith("Задняя стенка"): out.append("накладная, саморезы по месту")
    if n.startswith("Подложка"): out.append("за фальшпланкой, к стойке саморезами")
    return "; ".join(out)

panels = [r for r in d["panels"] if not r["name"].startswith("Фронтальная")]
panels.sort(key=lambda r: (rank(r["name"]), -r["L"], -r["W"]))
rows_html, csv_rows = [], []
total_qty = 0
for i, r in enumerate(panels, 1):
    gl, gw, gnote = grain_dims(r)
    mat = r["material"].split("\r")[0] + (" 16 мм" if r["t"] == 16 else f" {r['t']} мм")
    total_qty += r["qty"]
    rows_html.append(f"<tr><td class=n>{i}</td><td>{html.escape(r['name'].replace('ШС - ',''))}</td><td class=n>{r['qty']}</td><td class=n>{gl}</td><td class=n>{gw}</td><td class=n>{r['t']}</td><td>{html.escape(mat)}</td><td>{html.escape(edge_text(r))}</td><td class=note>{html.escape(notes(r))}</td></tr>")
    csv_rows.append([i, r["name"].replace("ШС - ", ""), r["qty"], gl, gw, r["t"], mat, edge_text(r), "нет" if gnote != "без рисунка" else "да", notes(r)])

# ---------- материалы ----------
area = d["panelArea"]
ldsp_m2 = area.get("Гикори Шайн светлый", 0); hdf_m2 = area.get("ХДФ Белый", 0)
sheet = 2.8 * 2.07
ldsp_sheets = math.ceil(ldsp_m2 / (sheet * 0.75))
edge_m = d["edgeTotal"] / 1000
led_m = (4 * 2321 + 4 * 1533 + 2 * 562 + 8 * 565) / 1000

# ---------- фурнитура ----------
hw = d["hardware"]
def hw_row(key, qty):
    name, _, art = key.partition(" | ")
    name = name.replace("ПРОЧЕЕ: ", "")
    return name.strip(), art.strip(), qty
groups = {"Наполнение и механизмы": [], "Петли и открывание": [], "Крепёж корпуса": []}
for k, q in hw.items():
    name, art, qty = hw_row(k, q)
    if any(s in name for s in ("Конфирмат", "Минификс", "Шкант", "Полкодержатель", "Стяжка", "Уголок")):
        groups["Крепёж корпуса"].append((name, art, qty))
    elif any(s in name for s in ("Петля", "Планка")):
        groups["Петли и открывание"].append((name, art, qty))
    else:
        groups["Наполнение и механизмы"].append((name, art, qty))
# Опор нет в 3D-модели: в библиотеке Базиса нет опоры H=80 (есть 24, 30, 50, 100, 125), а высота цоколя ровно 80.
# Позиция добавляется в спецификацию вручную; на раскрой не влияет, крепится саморезами по месту.
groups["Крепёж корпуса"].append(("Опора регулируемая под цоколь, H=80 мм, ход 80..95 мм, крепление саморезами к дну", "N303CP.2 / NM-DAK26-080", 12))
WHERE = [("Опора регулируемая", "«Мебельщик» или ТБМ-Маркет; в заказе ДСП Центра нет"), ("C81A805FAB", "дилер DTC; спросить в ДСП Центре, в их каталоге нет"), ("GTV", "Gradient Trade (дистрибьютор GTV), Илтипат 47, +7 727 254-99-22; пантограф есть на Kaspi"), ("Гладильная", "ТБМ-Маркет, Култегин 31"),
         ("DTC", "ДСП Центр, в заказе"), ("Hafele", "ДСП Центр, в заказе"), ("Конфирмат", "ДСП Центр, в заказе"),
         ("Минификс", "ДСП Центр, в заказе"), ("Шкант", "ДСП Центр, в заказе"), ("Стяжка", "ДСП Центр, в заказе"), ("Уголок", "ДСП Центр, в заказе")]
def where(name):
    for k, v in WHERE:
        if k in name: return v
    return ""
hw_html = []
for g, items in groups.items():
    hw_html.append(f'<h3>{g}</h3><table><thead><tr><th>Позиция</th><th>Артикул</th><th class=n>Кол-во</th><th>Где брать в Алматы</th></tr></thead><tbody>')
    for name, art, qty in sorted(items, key=lambda t: -t[2]):
        hw_html.append(f"<tr><td>{html.escape(name)}</td><td class=mono>{html.escape(art)}</td><td class=n>{qty}</td><td class=note>{html.escape(where(name))}</td></tr>")
    hw_html.append("</tbody></table>")

page = f"""<title>Закладная спальня, спецификация</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Condensed:wght@500;600&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{{--paper:#F2F4F6;--paper-2:#E8ECF0;--ink:#1F2A37;--ink-2:#4B5868;--ink-3:#7A8797;--dim:#2B6CB0;--rule:#C9D1DA;--warn:#8A5A00;--warn-bg:#FFF3D6}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--paper:#151B23;--paper-2:#1D252F;--ink:#E6EAF0;--ink-2:#B8C2CE;--ink-3:#8593A3;--dim:#7FB2E5;--rule:#33404E;--warn:#F0C14B;--warn-bg:#3A2E10}}}}
:root[data-theme="dark"]{{--paper:#151B23;--paper-2:#1D252F;--ink:#E6EAF0;--ink-2:#B8C2CE;--ink-3:#8593A3;--dim:#7FB2E5;--rule:#33404E;--warn:#F0C14B;--warn-bg:#3A2E10}}
body{{background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans",system-ui,sans-serif;font-size:14.5px;line-height:1.45;padding-inline:20px;padding-block:24px 48px;max-width:1240px;margin:0 auto}}
h1,h2,h3{{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;text-wrap:balance;margin:0}}
h1{{font-size:30px;font-weight:600}} h2{{font-size:21px;font-weight:600;margin-block:30px 10px}} h3{{font-size:16px;font-weight:600;margin-block:18px 6px;color:var(--ink-2)}}
.stamp{{display:grid;grid-template-columns:1fr auto;gap:8px 24px;align-items:end;border-bottom:2px solid var(--ink);padding-bottom:10px}}
.stamp .meta{{display:grid;grid-template-columns:auto auto;gap:2px 16px;font-family:"IBM Plex Mono",monospace;font-size:12px;color:var(--ink-2);text-align:right}}
.stamp .meta b{{font-weight:500;color:var(--ink)}}
.lead{{color:var(--ink-2);margin-block:10px 0;max-width:70ch}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-top:14px}}
.tile{{background:var(--paper-2);border:1px solid var(--rule);padding:10px 12px}}
.tile .v{{font-family:"IBM Plex Mono",monospace;font-size:20px;font-weight:500}} .tile .l{{font-size:12px;color:var(--ink-3);letter-spacing:.04em;text-transform:uppercase}}
.wrap{{overflow-x:auto}}
table{{width:100%;border-collapse:collapse;font-size:13.5px}}
th,td{{padding:5px 8px;border-bottom:1px solid var(--rule);text-align:left;vertical-align:top}}
th{{font-family:"IBM Plex Mono",monospace;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);font-weight:500;white-space:nowrap}}
td.n,th.n{{text-align:right;font-family:"IBM Plex Mono",monospace;font-variant-numeric:tabular-nums;white-space:nowrap}}
td.mono{{font-family:"IBM Plex Mono",monospace;white-space:nowrap}} td.note{{color:var(--ink-2)}}
.warn{{background:var(--warn-bg);color:var(--warn);border-left:3px solid var(--warn);padding:8px 12px;margin-top:8px;font-size:13.5px}}
ul{{padding-left:18px;margin:6px 0}} li{{margin:3px 0}}
</style>
<header class="stamp"><div><h1>Закладная спальня, спецификация</h1>
<p class="lead">Детали, материалы, фурнитура и крепёж по модели Базис на 16.09.2026. Длина деталей указана вдоль текстуры Гикори. Размеры чистовые, с кромкой.</p></div>
<div class="meta"><span>шкаф</span><b>2600 × 3030 × 610</b><span>секции в свету</span><b>662 / 562 / 562 / 662</b><span>плита</span><b>Гикори Шайн светлый 16, 2800×2070</b><span>кромка</span><b>ПВХ 0,8 мм в тон</b></div></header>

<div class="tiles">
<div class="tile"><div class="v">{total_qty}</div><div class="l">деталей ЛДСП и ХДФ</div></div>
<div class="tile"><div class="v">{ldsp_m2:.1f} м²</div><div class="l">ЛДСП 16 чистая площадь</div></div>
<div class="tile"><div class="v">7 листов</div><div class="l">ЛДСП по раскрою ДСП Центра</div></div>
<div class="tile"><div class="v">{hdf_m2:.1f} м², 2 листа</div><div class="l">ХДФ 3 мм</div></div>
<div class="tile"><div class="v">{edge_m:.0f} м</div><div class="l">кромка 0,8 мм, плюс 10% запаса</div></div>
<div class="tile"><div class="v">{led_m:.1f} м</div><div class="l">LED-лента в пазах</div></div>
</div>

<h2>Детали</h2>
<div class="wrap"><table><thead><tr><th class=n>№</th><th>Деталь</th><th class=n>Шт</th><th class=n>Длина</th><th class=n>Ширина</th><th class=n>Т</th><th>Материал</th><th>Кромка</th><th>Примечание</th></tr></thead><tbody>
{''.join(rows_html)}
</tbody></table></div>
<div class="warn">Кромка на панелях корпуса стоит только на видимых торцах: передний торец у стоек, перегородок, полок, крышек и дна, верхний у цоколя, наружный у фальшпланок. Двери и фасады ящиков по периметру. Короба ящиков: бока по трём торцам, задняя стенка по двум, дно без кромки. Присадка и пазы передаются файлом Базиса.</div>

<h2>Фурнитура</h2>
{''.join(hw_html)}

<h2>По месту, в 3D не учтено</h2>
<ul>
<li>Саморезы 3,5x16 для ХДФ, шаг 200 по периметру и по перегородкам: около 150 шт.</li>
<li>Саморезы 4x30 подложек к стойкам и 4x16 фальшпланок к подложкам: около 14 плюс 14 шт. Цоколь видимый к внутреннему: 4x30, 8 шт.</li>
<li>LED-лента 12 мм в пазы: {led_m:.1f} м плюс запас. Блок питания считать по ленте: при 4,8 Вт/м нужно около {led_m*4.8*1.3:.0f} Вт, при 9,6 Вт/м около {led_m*9.6*1.3:.0f} Вт (с запасом 30%). Такую длину лучше разбить на 3–4 линии по 5–6 м и питать каждую отдельно, иначе дальний конец будет тусклее. Датчики на двери или выключатель, провод к пазам через стойки, из антресоли вниз через отверстие в дне антресоли и крышке нижнего короба.</li>
<li>Заглушки на головки конфирматов в тон, 150 шт, только там, где головки видны: наружные пласти закрыты стеной и соседним коробом, видимых мало.</li>
<li>Уголки к стене, дюбели 8x60: 8 шт, Алматы, сейсмика.</li>
</ul>

<h2>Что проверить перед заказом</h2>
<ul>
<li>Петли: в 3D стоит геометрия Clickline, чашка Ø35 в том же месте. Покупать DTC Pivot Star New с доводчиком: C81A875FAB 110° на крайние и антресольные двери, C81A805FAB 160° на две средние двери, за которыми ящики. У ДСП Центра 160° в каталоге нет, спрошено в примечании к заказу.</li>
<li>Двери с ручками, ручки и отверстия под них по месту. Фасады ящиков вкладные, до закрытой двери 34 мм: ручки ящиков с вылетом до 30 мм.</li>
<li>Кромка: в тон Гикори Шайн светлый у ДСП Центра есть только 0,8 мм, в модели и в расчёте она считается как 1 мм. В заказ подставить кромку 1 мм в тон, прежняя подстановка «Ясень Шимо светлый 3102 2×19» больше не годится по толщине.</li>
<li>Фальшпланки (2433 и 597) и задние стенки ящиков 520 в облако ушли шириной 70 из-за лимита 100×60 для деталей с кромкой. Дорезать до 28 и 54 со стороны без кромки.</li>
<li>Межсекционные стяжки: в заказе стоит 108804, подходит ли она для стоек 16+16, уточняется у менеджера.</li>
<li>Гладильная доска: в модели геометрия МДМ IB1135, покупать Firmax FRM5812.430.</li>
<li>Направляющие Versalite H45 450: 4 комплекта по 2 для корзин и брючниц плюс 1 штука для вешалки ремней.</li>
<li>Двери 680 шире нормы 600, поэтому 5 петель на створку. Нижняя петля средних дверей на 150 от пола, корзина начинается на 185.</li>
</ul>
"""
open(OUT_HTML, "w", encoding="utf-8").write(page)

buf = io.StringIO()
w = csv.writer(buf, delimiter=";", lineterminator="\n")
w.writerow(["№", "Деталь", "Кол-во", "Длина вдоль текстуры", "Ширина", "Толщина", "Материал", "Кромка 0,8 мм", "Поворот", "Примечание"])
for r in csv_rows: w.writerow(r)
open(OUT_CSV, "w", encoding="utf-8-sig").write(buf.getvalue())
print("ok", len(panels), "деталей,", total_qty, "шт, листов", ldsp_sheets, "кромка", round(edge_m), "LED", led_m)
