# -*- coding: utf-8 -*-
"""Front elevation + side view SVG of the wardrobe from a BZ.dump() JSON."""
import json, sys, html

SRC = r"C:\Users\Jarvis\Documents\Bazis11\_claude\dump_draw.json"
OUT = sys.argv[1] if len(sys.argv) > 1 else r"C:\Users\Jarvis\Documents\Bazis11\_claude\elevation.svg.html"

d = json.load(open(SRC, encoding="utf-8"))
objs = d["objects"]

def r(v):
    return int(round(v))

def name(o):
    return o["name"].split("\r")[0]

TOP_BLOCKS = {}
for o in objs:
    if "/" not in o["path"] and o.get("list") is None:
        pass

# ---------- classify ----------
panels = [o for o in objs if o.get("role") and o.get("orient")]
hw = []
for o in objs:
    if "/" in o["path"]:
        continue
    n = name(o)
    if any(k in n for k in ("Пантограф", "Вешалка", "Корзина", "FRM5812")):
        hw.append(o)
facades = [o for o in objs if name(o) == "ШС - Ящик фасад"]
leds = [o for o in objs if "LED" in name(o) and ("горизонт" in name(o) or "угловой" in name(o))]
vleds = [o for o in objs if "LED" in name(o) and "врезной" in name(o) and "горизонт" not in name(o) and o["max"][1] - o["min"][1] > 500]

# ---------- geometry ----------
W, H = 2600.0, 3033.0
FILLER_H = 230  # смонтированная потолочная планка, низ 3033
S = 0.30
ML, MR, MT, MB = 150, 70, 60, 110
vbW = ML + W * S + MR
vbH = MT + (H + FILLER_H) * S + MB

def X(x): return ML + x * S
def Y(y): return MT + (H + FILLER_H - y) * S

svg = []
def add(s): svg.append(s)

def rect(x0, x1, y0, y1, cls, extra=""):
    add(f'<rect x="{X(x0):.1f}" y="{Y(y1):.1f}" width="{(x1-x0)*S:.1f}" height="{(y1-y0)*S:.1f}" class="{cls}" {extra}/>')

def text(x, y, s, cls="t", anchor="middle", rot=None):
    tr = f' transform="rotate(-90 {x:.1f} {y:.1f})"' if rot else ""
    add(f'<text x="{x:.1f}" y="{y:.1f}" class="{cls}" text-anchor="{anchor}"{tr}>{html.escape(str(s))}</text>')

def vdim(xpx, y0, y1, label, side=-1, gap=4):
    """vertical dimension between model heights y0<y1 at pixel x"""
    a, b = Y(y1), Y(y0)
    add(f'<line x1="{xpx:.1f}" y1="{a:.1f}" x2="{xpx:.1f}" y2="{b:.1f}" class="dim"/>')
    for yy in (a, b):
        add(f'<line x1="{xpx-4:.1f}" y1="{yy:.1f}" x2="{xpx+4:.1f}" y2="{yy:.1f}" class="dim"/>')
        add(f'<line x1="{xpx-3:.1f}" y1="{yy+3:.1f}" x2="{xpx+3:.1f}" y2="{yy-3:.1f}" class="dim tick"/>')
    mid = (a + b) / 2
    if b - a < 14:
        text(xpx + side * 8, mid + 3, label, "dt", "end" if side < 0 else "start")
    else:
        text(xpx + side * gap, mid, label, "dt", "middle", rot=True)

def hdim(ypx, x0, x1, label, above=True):
    a, b = X(x0), X(x1)
    add(f'<line x1="{a:.1f}" y1="{ypx:.1f}" x2="{b:.1f}" y2="{ypx:.1f}" class="dim"/>')
    for xx in (a, b):
        add(f'<line x1="{xx:.1f}" y1="{ypx-4:.1f}" x2="{xx:.1f}" y2="{ypx+4:.1f}" class="dim"/>')
        add(f'<line x1="{xx-3:.1f}" y1="{ypx+3:.1f}" x2="{xx+3:.1f}" y2="{ypx-3:.1f}" class="dim tick"/>')
    mid = (a + b) / 2
    if b - a < 16:
        text(mid, ypx + (-6 if above else 13), label, "dt2")
    else:
        text(mid, ypx + (-4 if above else 11), label, "dt")

def ext(x0, x1, y0, y1):
    add(f'<line x1="{X(x0):.1f}" y1="{Y(y0):.1f}" x2="{X(x1):.1f}" y2="{Y(y1):.1f}" class="ext"/>')

# ---------- draw front ----------
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW:.0f} {vbH:.0f}" class="dwg" role="img" aria-label="Вид спереди">')
add('<defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hl"/></pattern></defs>')
# back
for o in panels:
    if o["role"] == "back":
        rect(o["min"][0], o["max"][0], o["min"][1], o["max"][1], "back")
# panels: horizontal and vertical (front faces)
order = {"bottom": 1, "top": 1, "shelf": 1, "side_left": 2, "side_right": 2, "partition": 2, "plinth": 3, "filler": 3}
for o in sorted([p for p in panels if p["role"] in order], key=lambda p: order[p["role"]]):
    n = name(o)
    if "Цоколь" == n.replace("ШС - ", "") :
        continue  # внутренние цоколи не видны спереди
    if o["role"] == "filler" and "Подложка" in n:
        continue
    cls = "ldsp"
    if o["role"] in ("plinth", "filler"):
        cls = "ldsp front"
    rect(o["min"][0], o["max"][0], o["min"][1], o["max"][1], cls)
# facades
for o in facades:
    rect(o["min"][0], o["max"][0], o["min"][1], o["max"][1], "facade")
    hgt = r(o["max"][1] - o["min"][1])
    cx = X((o["min"][0] + o["max"][0]) / 2); cy = Y((o["min"][1] + o["max"][1]) / 2)
    text(cx, cy + 4, f"ящик DTC с доводчиком, фасад {hgt}", "lab")
# hardware
for o in hw:
    n = name(o)
    x0, x1, y0, y1 = o["min"][0], o["max"][0], o["min"][1], o["max"][1]
    if "Пантограф" in n:
        rect(x0, x1, y0, y1, "hw")
        cy = Y((y0 + y1) / 2)
        text(X((x0 + x1) / 2), cy, "пантограф GTV PG-ST4560, 545..700", "lab"); text(X((x0 + x1) / 2), cy + 13, f"механизм {r(y0)}..{r(y1)}", "lab2")
        continue
    rect(x0, x1, y0, y1, "hw")
    lab = {"WS": "брючница боковая GTV WS, 9 пар", "брюк": "брючница GTV SMART 700", "ремней": "вешалка для ремней", "Корзина": "корзина GTV SMART 600", "FRM5812": "гладильная доска"}
    l = next((v for k, v in lab.items() if k in n), n)
    cx = X((x0 + x1) / 2); cy = Y((y0 + y1) / 2)
    if y1 - y0 > 60:
        text(cx, cy + 1, l, "lab"); text(cx, cy + 13, f"{r(y0)}..{r(y1)}", "lab2")
    else:
        text(cx, cy + 4, f"{l} {r(y0)}..{r(y1)}", "lab2")
# LED
for o in leds:
    add(f'<line x1="{X(o["min"][0]):.1f}" y1="{Y(o["min"][1]):.1f}" x2="{X(o["max"][0]):.1f}" y2="{Y(o["min"][1]):.1f}" class="led"/>')
    text(X(o["max"][0]) - 4, Y(o["min"][1]) + 10, "LED под козырьком, светит вниз на ящики", "lab2", "end")
# паз под LED-ленту в нижней пласти полки (в дампе поле cuts)
for o in panels:
    if o.get("cuts") and any("LED" in (c.get("name") or "") for c in o["cuts"]):
        if o["orient"] == "Y":
            add(f'<line x1="{X(o["min"][0]):.1f}" y1="{Y(o["min"][1]):.1f}" x2="{X(o["max"][0]):.1f}" y2="{Y(o["min"][1]):.1f}" class="led"/>')
            text(X(o["max"][0]) - 4, Y(o["min"][1]) + 10, "паз 12x5 под LED-ленту в низу козырька, ось на 576", "lab2", "end")
        elif o["orient"] == "X":
            xx = X((o["min"][0] + o["max"][0]) / 2)
            if o["min"][1] >= 2430:
                y_lo, y_hi = 2449, 3014
            else:
                y_lo, y_hi = (884 if r(o["min"][0]) in (1284, 1300) else 96), 2417
            add(f'<line x1="{xx:.1f}" y1="{Y(y_lo):.1f}" x2="{xx:.1f}" y2="{Y(y_hi):.1f}" class="led"/>')
for o in vleds:
    xx = X((o["min"][0] + o["max"][0]) / 2)
    add(f'<line x1="{xx:.1f}" y1="{Y(o["min"][1]):.1f}" x2="{xx:.1f}" y2="{Y(o["max"][1]):.1f}" class="led"/>')
# ceiling filler (mounted, not in model)
rect(0, W, H, H + FILLER_H, "mounted")
text(X(W / 2), Y(H + FILLER_H / 2) + 4, "потолочная фальшпланка, уже смонтирована, низ на 3033 от пола, багет натяжного потолка", "lab")
# floor line
add(f'<line x1="{X(-60):.1f}" y1="{Y(0):.1f}" x2="{X(W+40):.1f}" y2="{Y(0):.1f}" class="floor"/>')

# ---------- per-section level labels ----------
sections = [(44, 706), (722, 1284), (1316, 1878), (1894, 2556)]
hor = [p for p in panels if p["orient"] == "Y" and p["role"] in ("bottom", "top", "shelf")]
for (sx0, sx1) in sections:
    ps = sorted([p for p in hor if p["min"][0] >= sx0 - 1 and p["max"][0] <= sx1 + 1], key=lambda p: p["min"][1])
    for p in ps:
        text(X(sx1) - 3, Y(p["max"][1]) - 2, f"отм. {r(p['max'][1])}", "lvl", "end")
    for a, b in zip(ps, ps[1:]):
        clear = r(b["min"][1] - a["max"][1])
        # skip antresole/lower box boundary (крышка -> дно антресоли, зазор 0)
        if clear <= 0:
            continue
        yy = Y((a["max"][1] + b["min"][1]) / 2)
        text(X(sx0) + 4, yy + 4, f"в свету {clear}", "clr", "start")

# ---------- dimension chains ----------
# left: overall
xL1 = ML - 22
ext(0, -70, 0, 0); ext(0, -70, 80, 80); ext(0, -70, 2433, 2433); ext(0, -70, H - 3, H - 3); ext(0, -70, H, H)
vdim(X(-26), 0, 80, "80"); vdim(X(-26), 80, 2433, "2353 нижний корпус"); vdim(X(-26), 2433, 3030, "597 антресоль"); vdim(X(-26), 3030, 3033, "3")
vdim(X(-58), 0, 3030, "3030 корпус")
vdim(X(-90), 0, 3033, "3033 от пола до планки")
# right: clear inner heights
ext(W, W + 60, 96, 96); ext(W, W + 60, 2417, 2417); ext(W, W + 60, 2449, 2449); ext(W, W + 60, 3014, 3014)
vdim(X(W + 30), 96, 2417, "2321 в свету", side=1); vdim(X(W + 30), 2449, 3014, "565 в свету", side=1)
# bottom: widths
xs = [0, 28, 44, 706, 722, 1284, 1300, 1316, 1878, 1894, 2556, 2572, 2600]
yb = Y(0) + 26
for x in xs:
    add(f'<line x1="{X(x):.1f}" y1="{Y(0)+4:.1f}" x2="{X(x):.1f}" y2="{yb+34:.1f}" class="ext"/>')
for a, b in zip(xs, xs[1:]):
    hdim(yb, a, b, str(b - a), above=False)
hdim(yb + 30, 0, W, "2600 между стенами, с фальшпланками по 28", above=False)
hdim(Y(H + FILLER_H) - 16, 28, 1300, "левый корпус 1272", above=True)
hdim(Y(H + FILLER_H) - 16, 1300, 2572, "правый корпус 1272", above=True)
# section names
for i, (sx0, sx1) in enumerate(sections, 1):
    who = "мои" if i in (1, 2) else "жены"
    text(X((sx0 + sx1) / 2), Y(H + FILLER_H) - 34, f"секция {i}, {who}, дверь {'682' if i in (1, 4) else '582'}", "sec")
add('</svg>')
FRONT = "\n".join(svg)

# ---------- side view ----------
svg = []
D = 610.0
ML2, MR2, MT2, MB2 = 120, 40, 60, 110
vbW2 = ML2 + D * S + MR2
def X2(z): return ML2 + z * S
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW2:.0f} {vbH:.0f}" class="dwg" role="img" aria-label="Вид сбоку">')
def rect2(z0, z1, y0, y1, cls):
    add(f'<rect x="{X2(z0):.1f}" y="{Y(y1):.1f}" width="{(z1-z0)*S:.1f}" height="{(y1-y0)*S:.1f}" class="{cls}"/>')
# wall
add(f'<rect x="{X2(-40):.1f}" y="{Y(H+FILLER_H+40):.1f}" width="{40*S:.1f}" height="{(H+FILLER_H+40)*S:.1f}" class="wall"/>')
# section cut through section 2: side panel is seen as face (X panel): draw carcass side 5..592 full height as ldsp
rect2(5, 592, 0, 2433, "ldsp"); rect2(5, 592, 2433, 3030, "ldsp")
# horizontal panels seen edge-on
for o in panels:
    if o["orient"] == "Y" and 722 <= o["min"][0] + 1 and o["max"][0] <= 1285:
        rect2(o["min"][2], o["max"][2], o["min"][1], o["max"][1], "edge")
# back HDF
rect2(2, 5, 82, 2431, "back"); rect2(2, 5, 2435, 3028, "back")
# plinths and front fillers (edge-on)
rect2(594, 610, 0, 86, "edge front"); rect2(560, 576, 0, 80, "edge"); rect2(21, 37, 0, 80, "edge")
rect2(594, 610, 0, 2433, "edge front"); rect2(594, 610, 2433, 3030, "edge front")
# mounted ceiling filler
rect2(594, 610, H, H + FILLER_H, "mounted")
# hardware in section 2 side: basket, drawers, board
rect2(97, 555, 121, 354, "hw"); text(X2(330), Y(237) + 4, "корзина", "lab2")
for o in facades:
    if 700 <= o["min"][0] and o["max"][0] <= 1300:
        rect2(36, 560, o["min"][1], o["max"][1], "hw")
rect2(70, 555, 900, 990, "hw"); text(X2(310), Y(945) + 4, "гладильная доска 485", "lab2")
add(f'<line x1="{X2(-60):.1f}" y1="{Y(0):.1f}" x2="{X2(D+30):.1f}" y2="{Y(0):.1f}" class="floor"/>')
# dims
zs = [0, 2, 5, 592, 594, 610]
yb = Y(0) + 26
for z in zs:
    add(f'<line x1="{X2(z):.1f}" y1="{Y(0)+4:.1f}" x2="{X2(z):.1f}" y2="{yb+34:.1f}" class="ext"/>')
labels = ["2", "3", "587", "2", "16"]
for (a, b), l in zip(zip(zs, zs[1:]), labels):
    aa, bb = X2(a), X2(b)
    add(f'<line x1="{aa:.1f}" y1="{yb:.1f}" x2="{bb:.1f}" y2="{yb:.1f}" class="dim"/>')
    add(f'<line x1="{aa-3:.1f}" y1="{yb+3:.1f}" x2="{aa+3:.1f}" y2="{yb-3:.1f}" class="dim tick"/>')
    add(f'<line x1="{bb-3:.1f}" y1="{yb+3:.1f}" x2="{bb+3:.1f}" y2="{yb-3:.1f}" class="dim tick"/>')
    if bb - aa < 16:
        text((aa + bb) / 2, yb + 13 + (8 if l in ("3", "2") and a > 500 else 0), l, "dt2")
    else:
        text((aa + bb) / 2, yb + 11, l, "dt")
add(f'<line x1="{X2(0):.1f}" y1="{yb+30:.1f}" x2="{X2(D):.1f}" y2="{yb+30:.1f}" class="dim"/>')
text(X2(D / 2), yb + 41, "610 от стены до фронта фальшпланок и цоколя", "dt")
text(X2(-20), Y(1500), "стена", "lab2", "middle", rot=True)
text(X2(300), Y(1500), "глубина корпуса 587, полки 555", "lab2", "middle", rot=True)
text(X2(602), Y(1500), "фальшпланка 16", "lab2", "middle", rot=True)
# left chain for side view
vdim(X2(-70), 0, 80, "80"); vdim(X2(-70), 80, 96, "16"); vdim(X2(-70), 96, 2417, "2321"); vdim(X2(-70), 2417, 2449, "32"); vdim(X2(-70), 2449, 3014, "565"); vdim(X2(-70), 3014, 3030, "16")
add('</svg>')
SIDE = "\n".join(svg)

# ---------- facade view: doors, hinges, push catches ----------
svg = []
add(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vbW:.0f} {vbH:.0f}" class="dwg" role="img" aria-label="Фасад с дверями">')
add('<defs><pattern id="hatch2" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" class="hl"/></pattern></defs>')
# корпус фоном: цоколь видимый, фальшпланки, планка потолочная
for o in panels:
    n = name(o)
    if o["role"] in ("plinth", "filler") and "Подложка" not in n and n.replace("ШС - ", "") != "Цоколь":
        rect(o["min"][0], o["max"][0], o["min"][1], o["max"][1], "ldsp front")
rect(0, W, H, H + FILLER_H, "mounted")
text(X(W / 2), Y(H + FILLER_H / 2) + 4, "потолочная фальшпланка, смонтирована, низ на 3033", "lab")
doors = [o for o in objs if name(o).startswith("ШС - Дверь")]
hinges = [o for o in objs if name(o).startswith("Петля Clickline") and "/" not in o["path"]]
pushes = [o for o in objs if "олкатель регулируемый" in name(o) and "/" not in o["path"]]
for o in sorted(doors, key=lambda d: (d["min"][1], d["min"][0])):
    x0, x1, y0, y1 = o["min"][0], o["max"][0], o["min"][1], o["max"][1]
    rect(x0, x1, y0, y1, "door")
    cx, cy = X((x0 + x1) / 2), Y((y0 + y1) / 2)
    text(cx, cy - 6, name(o).replace("ШС - Дверь ", "дверь "), "lab")
    text(cx, cy + 8, f"{r(x1-x0)} x {r(y1-y0)}", "lab2")
    # петли этой двери: блоки петель, пересекающие дверь по y и стоящие у её края
    hs = sorted([h for h in hinges if h["min"][1] >= y0 - 40 and h["max"][1] <= y1 + 40 and (abs(h["min"][0] - x0) < 60 or abs(h["max"][0] - x1) < 60)], key=lambda h: h["min"][1])
    side_left = hs and abs(hs[0]["min"][0] - x0) < abs(hs[0]["max"][0] - x1)
    hx = x0 + 22 if side_left else x1 - 22
    for h in hs:
        hy = (h["min"][1] + h["max"][1]) / 2
        add(f'<circle cx="{X(hx):.1f}" cy="{Y(hy):.1f}" r="{35*S/2:.1f}" class="hinge"/>')
        text(X(hx) + (12 if side_left else -12), Y(hy) + 3, str(r(hy)), "lvl", "start" if side_left else "end")
    if hs:
        text(X(hx) + (12 if side_left else -12), Y(y1) + 12, f"{len(hs)} петли DTC Pivot Star {'160°' if (x0 > 700 and x1 < 1900 and y1 - y0 > 1000) else '110°'}", "lab2", "start" if side_left else "end")
    # толкатели у свободного края
    for p in pushes:
        px = (p["min"][0] + p["max"][0]) / 2
        if x0 - 5 <= px <= x1 + 5 and (abs(p["min"][1] - y1) < 40 or abs(p["max"][1] - y0) < 40 or abs(p["min"][1] - (y1 + 2)) < 40):
            py = y1 - 10 if p["min"][1] > (y0 + y1) / 2 else y0 + 10
            add(f'<rect x="{X(px)-3:.1f}" y="{Y(py)-3:.1f}" width="6" height="6" class="push"/>')
# размеры дверей по низу и высоты по правому краю
xs_d = sorted(set([r(v) for o in doors for v in (o["min"][0], o["max"][0])] + [0, W]))
yb = Y(0) + 26
for x in xs_d:
    add(f'<line x1="{X(x):.1f}" y1="{Y(0)+4:.1f}" x2="{X(x):.1f}" y2="{yb+34:.1f}" class="ext"/>')
for a, b in zip(xs_d, xs_d[1:]):
    hdim(yb, a, b, str(b - a), above=False)
hdim(yb + 30, 0, W, "2600 между стенами", above=False)
ys_d = sorted(set([r(v) for o in doors for v in (o["min"][1], o["max"][1])] + [0, r(H)]))
for y in ys_d:
    ext(W, W + 60, y, y)
for a, b in zip(ys_d, ys_d[1:]):
    vdim(X(W + 30), a, b, str(b - a), side=1)
vdim(X(W + 62), 0, r(H), "3033 до планки", side=1)
text(X(W / 2), Y(H + FILLER_H) - 34, "двери с ручками по месту, зазоры 4 между дверями, 2 у цоколя и фальшпланок", "sec")
add('</svg>')
FACADE = "\n".join(svg)

# ---------- level tables ----------
rows = {}
for i, (sx0, sx1) in enumerate(sections, 1):
    lst = []
    for p in sorted([p for p in hor if p["min"][0] >= sx0 - 1 and p["max"][0] <= sx1 + 1], key=lambda p: p["min"][1]):
        n = name(p).replace("ШС - ", "")
        lst.append((n, r(p["min"][1]), r(p["max"][1]), "ЛДСП 16, глубина %d" % r(p["max"][2] - p["min"][2])))
    for o in hw + facades:
        if o["min"][0] >= sx0 - 1 and o["max"][0] <= sx1 + 1:
            n = name(o)
            if "Пантограф" in n:
                lst.append(("Пантограф GTV PG-ST4560-10", r(o["min"][1]), r(o["max"][1]), "механизм; рычаги опускают штангу на 545..700"))
            elif "WS" in n:
                lst.append(("Брючница боковая GTV WS WW-WSLO00-01", r(o["min"][1]), r(o["max"][1]), "к левой стойке, 324 x 100 x 466, 9 пар"))
            elif "фасад" in n:
                lst.append(("Ящик DTC D-Motion с доводчиком, фасад", r(o["min"][1]), r(o["max"][1]), "вкладной фасад 558 x %d, ручка с вылетом до 30" % r(o["max"][1] - o["min"][1])))
            else:
                lst.append((n.split(",")[0] if "GTV" in n else "Гладильная доска Firmax FRM5812.430", r(o["min"][1]), r(o["max"][1]), "фурнитура"))
    lst.sort(key=lambda t: t[1])
    rows[i] = lst

table_html = []
for i, lst in rows.items():
    who = "мои" if i in (1, 2) else "жены"
    table_html.append(f'<section class="sec"><h3>Секция {i}, {who}<span class="sub">проём {sections[i-1][0]}..{sections[i-1][1]}, в свету {sections[i-1][1]-sections[i-1][0]}</span></h3><table><thead><tr><th>Элемент</th><th class="n">низ</th><th class="n">верх</th><th class="n">высота</th><th>примечание</th></tr></thead><tbody>')
    for n, a, b, note in lst:
        table_html.append(f'<tr><td>{html.escape(n)}</td><td class="n">{a}</td><td class="n">{b}</td><td class="n">{b-a}</td><td class="note">{html.escape(note)}</td></tr>')
    table_html.append('</tbody></table></section>')
TABLES = "\n".join(table_html)

open(OUT, "w", encoding="utf-8").write(json.dumps({"front": FRONT, "side": SIDE, "facade": FACADE, "tables": TABLES}, ensure_ascii=False))
print("ok", len(FRONT), len(SIDE), len(TABLES))
