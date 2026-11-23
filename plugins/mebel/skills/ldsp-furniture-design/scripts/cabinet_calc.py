#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Калькулятор деталировки типовых корпусов из ЛДСП.

Режимы (--type):
  niche    встройка в нишу: по замерам ниши считает габарит корпусов, число корпусов,
           фальшпланки и подложки, печатает готовые команды для каждого корпуса.
  cabinet  шкаф/стеллаж/тумба: боковины до пола, крышка и дно между боковинами, цоколь,
           секции (равные или --section-widths), полки и штанга по секциям, накладные двери
           по секциям или ящики на весь корпус.
  base     нижний кухонный модуль: дно под боковинами, 2 царги, ножки; дверь или ящики.
  wall     верхний кухонный модуль: боковины охватывают крышку и дно.
  drawers  внутренние ящики в проёме (за распашной дверью): короба, проставки под направляющие.

Размеры по умолчанию ЧИСТОВЫЕ (с кромкой), округление вниз до --round (1 мм).
--saw выдаёт пильные размеры: вычитается кромка >= 1 мм на каждую окантованную сторону.

Длина (X) всегда вдоль текстуры. Кромка:
  X1, X2 длинные стороны: X1 передний торец (у цоколя, царги, фальшпланки верхний), X2 задний.
  Y1, Y2 короткие стороны: Y1 верхний у вертикальных деталей и левый у горизонтальных, Y2 нижний или правый.

Двери: --doors 2,1 задаёт двери по секциям. Одно число это двери на весь корпус: если оно кратно
числу секций, двери делятся поровну и стыки створок попадают на стойки (--doors 4 при двух секциях
даёт по 2 на секцию), иначе створки идут по всей ширине.

Режим niche печатает готовые команды для корпусов: в них переносятся лист, толщины, материалы,
задняя стенка, цоколь (в niche по умолчанию 80) и потолок для проверки подъёма.

Несколько корпусов в один CSV: первый запуск с --csv out.csv --prefix Ш1,
следующие с --csv out.csv --append --prefix Ш2.

Тесты: py test_cabinet_calc.py (лежит рядом).

Примеры:
  py cabinet_calc.py --type niche --niche-w 1850,1848 --niche-h 2550,2530 --niche-d 620 --wall-plinth 60x15
  py cabinet_calc.py --type cabinet -W 944 -H 2420 -D 590 --plinth 80 --doors 2 --rod all --rod-height 1800 --fixed-shelves 1
  py cabinet_calc.py --type cabinet -W 1600 -H 2400 -D 600 --section-widths 900,* --doors 2,2 --shelves 0,4 --rod 1
  py cabinet_calc.py --type drawers -W 784 -D 574 -H 500 --drawers 2 --box-h 150 --spacer 16
  py cabinet_calc.py --type base -W 600 -D 560 --drawers 3 --slide ball --csv out.csv --prefix Н600
"""
import argparse
import csv
import math
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

HDF = "HDF"
SLIDE_STD = [250, 300, 350, 400, 450, 500, 550, 600, 650, 700]
SLIDES = {
    "ball":   {"deduct": 26, "clear": 10, "len_delta": 0,   "title": "шариковые полного выдвижения"},
    "roller": {"deduct": 25, "clear": 10, "len_delta": 0,   "title": "роликовые"},
    "hidden": {"deduct": 10, "clear": 3,  "len_delta": -10, "title": "скрытые (Tandem/Movento/Quadro)"},
}

# Нормы из SKILL.md. При изменении правила в SKILL.md поправить здесь и прогнать тесты.
HDF_SHEET = (2800, 2070)     # лист ХДФ, не зависит от формата ЛДСП
SPAN_LIMIT = {16: 800, 18: 900, 22: 1000, 25: 1000, 26: 1000}  # пролёт полки без опоры
LIFT_MIN = 20                # диагональ боковины меньше потолка минимум на 20
LIFT_COMFORT = 50            # запас для высоты корпуса в нише и порог "подъём впритык"
WALL_FIX_H = 1200            # сейсмика: крепить к стене выше 1200 или при высоте больше 3 глубин

# Параметры, которые режим niche переносит в печатаемые команды
BODY_KEYS = ["t", "material", "front_material", "front_t", "back", "back_t", "groove_depth", "groove_offset",
             "edge_face", "edge_hidden", "round", "trim", "no_grain", "no_caps", "saw", "encoding"]
NICHE_KEYS = ["niche_w", "niche_h", "niche_d", "wall_plinth", "plinth_mode", "side_gap", "top_gap", "bodies",
              "max_body", "plinth", "sheet_len", "sheet_wid"] + BODY_KEYS


class Part:
    def __init__(self, name, L, Wd, qty, t, material, edges=(0, 0, 0, 0), note="", grain=True):
        self.name, self.L, self.W, self.qty, self.t = name, L, Wd, qty, t
        self.material, self.edges, self.note, self.grain = material, list(edges), note, grain


class Ctx:
    def __init__(self, a):
        self.a = a
        self.parts, self.warn, self.notes, self.hw = [], [], [], {}
        self.joints = []  # длины стыков под конфирматы

    def add(self, *args, **kw):
        p = Part(*args, **kw)
        if self.a.no_grain and not p.material.startswith(HDF):
            p.grain = False
        self.parts.append(p)
        return p

    def hwa(self, k, v):
        self.hw[k] = self.hw.get(k, 0) + v

    def fl(self, x):
        s = self.a.round
        return math.floor(x / s + 1e-9) * s


def fmt(x):
    x = float(x)
    return str(int(round(x))) if abs(x - round(x)) < 1e-6 else ("%.1f" % x)


def floor10(x):
    return math.floor(x / 10.0) * 10


def wall_points(w):
    """Точки крепления корпуса к стене: до 800 две, шире три-четыре."""
    return 2 if w <= 800 else (3 if w <= 1200 else 4)


def shq(s):
    """Значение для печатаемой команды, в кавычках при пробелах и спецсимволах."""
    s = str(s)
    if s and not re.search(r"[\s\"'`$;&|<>()#]", s):
        return s
    return "'%s'" % s if '"' in s else '"%s"' % s


def command(args):
    """Готовая команда запуска этого скрипта."""
    script = os.path.abspath(__file__).replace("\\", "/")
    return " ".join(["py", shq(script)] + [shq(x) for x in args])


def cli_args(a, keys):
    """Флаги для параметров из keys, значения которых отличаются от умолчаний."""
    parser, out = make_parser(), []
    for k in keys:
        v = getattr(a, k)
        if v is None or v == parser.get_default(k):
            continue
        opt = ("-" if len(k) == 1 else "--") + k.replace("_", "-")
        if v is True:
            out.append(opt)
        else:
            out += [opt, fmt(v) if isinstance(v, float) else str(v)]
    return out


def hinges_for(h):
    if h <= 900:
        return 2
    if h <= 1600:
        return 3
    if h <= 2000:
        return 4
    if h <= 2400:
        return 5
    return 5 + math.ceil((h - 2400) / 450)


def hinge_positions(h, n, off):
    if n <= 1:
        return [h / 2]
    step = (h - 2 * off) / (n - 1)
    return [round(off + i * step) for i in range(n)]


def confirmats_for(length):
    if length <= 100:
        return 1
    if length <= 300:
        return 2
    if length <= 600:
        return 3
    if length <= 1000:
        return 4
    return 5


def per_section(val, k, default, cast=int, name="параметр"):
    if val is None or str(val).strip() == "":
        return [default] * k
    items = [x.strip() for x in str(val).split(",")]
    if len(items) == 1:
        return [cast(items[0])] * k
    if len(items) != k:
        sys.exit("%s: указано %d значений, секций %d" % (name, len(items), k))
    return [cast(x) for x in items]


def section_widths(a, W, t):
    if a.section_widths:
        items = [x.strip() for x in a.section_widths.split(",")]
        k = len(items)
        fixed = sum(float(x) for x in items if x != "*")
        stars = items.count("*")
        free = W - (k + 1) * t - fixed
        if stars:
            each = free / stars
            if each <= 0:
                sys.exit("Секциям '*' не остаётся ширины: %s" % fmt(free))
            return [each if x == "*" else float(x) for x in items]
        if abs(free) > 0.5:
            sys.exit("Сумма секций и стоек не равна ширине %s, разница %s" % (fmt(W), fmt(free)))
        return [float(x) for x in items]
    k = max(1, a.sections)
    return [(W - (k + 1) * t) / k] * k


def add_slides_boxes(c, lw, d_avail, fronts_or_boxh, n, t, interior=False):
    """Короба ящиков из ЛДСП. fronts_or_boxh: список высот фасадов или высота короба (interior)."""
    a = c.a
    sl = SLIDES[a.slide]
    nl_max = d_avail - sl["clear"]
    nl = max([x for x in SLIDE_STD if x <= nl_max] or [0])
    if a.slide_len:
        nl = a.slide_len
        if nl + sl["clear"] > d_avail:
            c.warn.append("Направляющая %d не входит: доступная глубина %s, нужно %d." % (nl, fmt(d_avail), nl + sl["clear"]))
    if not nl:
        c.warn.append("Глубины %s не хватает даже на направляющую 250." % fmt(d_avail))
        return 0
    box_len = nl + sl["len_delta"]
    if a.slide == "hidden":
        outer, fb = lw - 10, lw - 42
    else:
        outer = lw - sl["deduct"]
        fb = outer - 2 * t
    E2, E04 = a.edge_face, a.edge_hidden
    for i in range(n):
        if interior:
            bh = fronts_or_boxh
        else:
            bh = min(fronts_or_boxh[i] - 40, a.box_max)
        bh = c.fl(bh)
        if bh < 60:
            c.warn.append("Ящик %d: короб %s слишком низкий." % (i + 1, fmt(bh)))
        c.add("Ящик %d боковина" % (i + 1), box_len, bh, 2, t, a.material, (E2 if interior else E04, 0, 0, 0))
        if interior:
            c.add("Ящик %d передняя стенка (лицевая)" % (i + 1), c.fl(fb), bh, 1, t, a.material, (E2, 0, 0, 0), "между боковинами, ручка-вырез или врезная")
            c.add("Ящик %d задняя стенка" % (i + 1), c.fl(fb), bh, 1, t, a.material, (E04, 0, 0, 0), "между боковинами")
        else:
            c.add("Ящик %d перед/зад" % (i + 1), c.fl(fb), bh, 2, t, a.material, (E04, 0, 0, 0), "между боковинами")
        c.add("Ящик %d дно" % (i + 1), c.fl(box_len - 4), c.fl(outer - 4), 1, a.back_t, "%s%d" % (HDF, a.back_t),
              note="накладное снизу", grain=False)
        c.joints += [bh] * 4
    c.hwa("Направляющие %s NL=%d, пар" % (sl["title"], nl), n)
    c.notes.append("Ящики: проём %s, короб наружная ширина %s, длина направляющей %d, доступная глубина %s."
                   % (fmt(lw), fmt(outer), nl, fmt(d_avail)))
    if a.slide == "hidden":
        c.notes.append("Скрытые направляющие: дно и задняя стенка по каталогу конкретной модели.")
    return nl


def validate_args(a):
    """Отсекает размеры, из которых корпус не собрать. Раньше -W -5 давал детали с отрицательной шириной и код 0."""
    bad = []
    t = getattr(a, "t", 16) or 16
    body = getattr(a, "type", "cabinet") not in ("drawers", "niche")
    for flag, name, low in (("W", "ширина -W", 3 * t if body else 1), ("H", "высота -H", 3 * t if body else 1),
                            ("D", "глубина -D", 50)):
        v = getattr(a, flag, None)
        if v and v < low:
            bad.append("%s = %s: меньше %s мм" % (name, v, low))
    if t <= 0:
        bad.append("толщина -t = %s" % t)
    sections = getattr(a, "sections", None)
    if isinstance(sections, int) and sections < 1:
        bad.append("--sections = %s: нужна хотя бы одна секция" % sections)
    plinth, h = getattr(a, "plinth", None), getattr(a, "H", None)
    if plinth is not None and (plinth < 0 or (h and plinth >= h - 2 * t)):
        bad.append("--plinth = %s: цоколь не меньше 0 и ниже корпуса" % plinth)
    for flag in ("legs", "rail", "gap", "gap_between", "trim", "back_t", "front_t"):
        v = getattr(a, flag, None)
        if isinstance(v, (int, float)) and v < 0:
            bad.append("--%s = %s: отрицательное значение" % (flag.replace("_", "-"), v))
    if bad:
        raise SystemExit("ОШИБКА входных данных:\n  " + "\n  ".join(bad))


def build_body(a):
    c = Ctx(a)
    t, M = a.t, a.material
    E2, E04 = a.edge_face, a.edge_hidden
    W, D = a.W, a.D
    if a.type in ("base", "wall"):
        H = a.H or 720
        plinth = 0
    else:
        H, plinth = a.H, a.plinth
    if not H:
        sys.exit("Нужна высота -H")

    widths = section_widths(a, W, t) if a.type == "cabinet" else [W - 2 * t]
    k = len(widths)
    d_inner = D - a.groove_offset - a.back_t if a.back == "groove" else D
    back_note = {"overlay": "накладная, гвозди/саморезы шаг 150..200",
                 "groove": "в паз %dx%s, отступ паза %s" % (a.back_t + 1, fmt(a.groove_depth), fmt(a.groove_offset)),
                 "none": "без задней стенки: нужна планка жёсткости, стационарные полки, крепление к стене"}[a.back]

    # ---------- корпус ----------
    if a.type == "base":
        c.add("Боковина", H - t, D, 2, t, M, (E2, 0, 0, 0), "стоит на дне")
        c.add("Дно", W, D, 1, t, M, (E2, 0, E04, E04), "под боковинами")
        c.add("Царга", W - 2 * t, a.rail, 2, t, M, (E04, 0, 0, 0), "передняя и задняя")
        c.joints += [D, D, a.rail, a.rail, a.rail, a.rail]
        cover_h, zone_h = H, H - t
        c.hwa("Опора кухонная %d мм" % a.legs, 4 if W <= 800 else 6)
        c.hwa("Клипса цоколя", 2)
    elif a.type == "wall":
        c.add("Боковина", H, D, 2, t, M, (E2, 0, E04, E04))
        c.add("Крышка", W - 2 * t, D, 1, t, M, (E2, 0, 0, 0))
        c.add("Дно", W - 2 * t, D, 1, t, M, (E2, 0, 0, 0))
        c.joints += [D] * 4
        cover_h, zone_h = H, H - 2 * t
        c.notes.append("Навесной модуль: навесы или монтажная шина. Если навес через заднюю стенку, стенка из ЛДСП.")
    else:
        c.add("Боковина", H, D, 2, t, M, (E2, 0, E04, 0), "до пола" if plinth else "")
        c.add("Крышка", W - 2 * t, D, 1, t, M, (E2, 0, 0, 0))
        c.add("Дно", W - 2 * t, D, 1, t, M, (E2, 0, 0, 0), "на высоте цоколя" if plinth else "")
        c.joints += [D] * 4
        if plinth:
            c.add("Цоколь", W - 2 * t, plinth, 1, t, M, (0, 0, 0, 0), "передний, заглубление 0..50")
            c.joints += [plinth, plinth]
        cover_h, zone_h = H - plinth, H - plinth - 2 * t

    if k > 1:
        pd = D if a.back == "overlay" else d_inner
        c.add("Стойка (перегородка)", zone_h, pd, k - 1, t, M, (E2, 0, 0, 0),
              "секции в свету: " + " / ".join(fmt(x) for x in widths))
        c.joints += [pd] * (2 * (k - 1))

    # ---------- полки, штанга ----------
    shelves = per_section(a.shelves, k, 0, name="--shelves")
    fixed = per_section(a.fixed_shelves, k, 0, name="--fixed-shelves")
    span_limit = SPAN_LIMIT.get(t, 800)
    sh_d = c.fl(d_inner - a.shelf_setback)
    for i, w in enumerate(widths):
        tag = (" с%d" % (i + 1)) if k > 1 else ""
        if shelves[i]:
            c.add("Полка съёмная" + tag, c.fl(w - 2), sh_d, shelves[i], t, M, (E2, 0, 0, 0), "на 4 полкодержателях")
            c.hwa("Полкодержатель 5 мм", 4 * shelves[i])
        if fixed[i]:
            c.add("Полка стационарная" + tag, c.fl(w), sh_d, fixed[i], t, M, (E2, 0, 0, 0), "на конфирматах")
            c.joints += [sh_d] * (2 * fixed[i])
        if (shelves[i] or fixed[i]) and w > span_limit:
            c.warn.append("Секция %d: пролёт полки %s больше %d для ЛДСП %d. Поставить стойку, ребро 60..80 под переднюю кромку или плиту толще."
                          % (i + 1, fmt(w), span_limit, t))
        elif (shelves[i] or fixed[i]) and t == 16 and w > 600:
            c.notes.append("Секция %d: пролёт %s. Под книги и посуду на ЛДСП 16 лучше до 600." % (i + 1, fmt(w)))

    rod_secs = []
    if a.rod == "all":
        rod_secs = list(range(k))
    elif a.rod:
        try:
            rod_secs = sorted({int(x) - 1 for x in a.rod.split(",")})
        except ValueError:
            sys.exit("--rod: нужно all или номера секций через запятую, получено %s" % a.rod)
        if rod_secs[0] < 0 or rod_secs[-1] >= k:
            sys.exit("--rod: номера секций от 1 до %d, получено %s" % (k, a.rod))
    for i in rod_secs:
        ln = c.fl(widths[i] - 3)
        c.hwa("Штанга овальная 30x15, длина %s" % fmt(ln), 1)
        c.hwa("Штангодержатель", 2)
        if widths[i] > 1000:
            c.warn.append("Штанга %s длиннее 1000 без опоры: будет прогиб, нужна средняя опора." % fmt(ln))
    if rod_secs:
        if D < 550:
            c.warn.append("Глубина %s меньше 550: поперечная штанга не встанет, нужна торцевая или выдвижная." % fmt(D))
        if a.rod_height and a.rod_height > 1900:
            c.warn.append("Штанга на %d от пола выше 1900 (ГОСТ 13025.1): нужен пантограф." % a.rod_height)
        c.notes.append("Штанга на 50..70 ниже полки над ней, по центру глубины.")

    # ---------- задняя стенка ----------
    if a.back != "none":
        if a.type == "base":
            bh, bw = H - 4, W - 4
        elif a.back == "overlay":
            bh, bw = (cover_h - 2, W - 2) if a.type == "cabinet" else (H - 4, W - 4)
        else:
            zone = zone_h if a.type != "base" else H - t
            bh = zone + 2 * a.groove_depth - 2
            bw = (W - 2 * t) + 2 * a.groove_depth - 2
        L_, W_ = (bh, bw) if bh >= bw else (bw, bh)
        c.add("Стенка задняя", L_, W_, 1, a.back_t, "%s%d" % (HDF, a.back_t), note=back_note, grain=False)
        if a.back == "overlay":
            per = 2 * (bh + bw) + (k - 1) * bh + sum(fixed[i] * widths[i] for i in range(k))
            c.hwa("Гвоздь 1.6x25 или саморез 3.5x16 для ХДФ", math.ceil(per / 170))
        if min(bh, bw) > HDF_SHEET[1] - 2 * a.trim or max(bh, bw) > HDF_SHEET[0] - 2 * a.trim:
            c.warn.append("Задняя стенка %sx%s больше листа ХДФ %dx%d: делать составной со стыком на середине стойки."
                          % (fmt(bh), fmt(bw), HDF_SHEET[0], HDF_SHEET[1]))

    # ---------- фасады ----------
    g, gb = a.gap, a.gap_between
    if a.drawers:
        if k > 1:
            sys.exit("Ящики на весь корпус только для одной секции. Для ящиков в секции используйте --type drawers.")
        n = a.drawers
        if a.drawer_fronts:
            hs = [float(x) for x in a.drawer_fronts.split("+")]
            n = len(hs)
            s = sum(hs) + 2 * g + (n - 1) * gb
            if abs(s - cover_h) > 1.5:
                c.warn.append("Сумма фасадов с зазорами %s не равна высоте %s." % (fmt(s), fmt(cover_h)))
        else:
            each = c.fl((cover_h - 2 * g - (n - 1) * gb) / n)
            hs = [each] * n
            hs[-1] = c.fl(cover_h - 2 * g - (n - 1) * gb - each * (n - 1))
        fw = c.fl(W - 2 * g)
        for i, h in enumerate(hs):
            c.add("Фасад ящика %d" % (i + 1), h, fw, 1, a.front_t, a.front_material or M, (E2, E2, E2, E2))
        add_slides_boxes(c, W - 2 * t, d_inner, hs, n, t)
        c.hwa("Ручка", n)
    elif a.doors and a.doors != "0":
        items = [x.strip() for x in a.doors.split(",")]
        dh = c.fl(cover_h - 2 * g)
        doors = []  # (width, section)
        if len(items) == 1 and (k == 1 or int(items[0]) % k != 0):
            n = int(items[0])
            dw = c.fl((W - 2 * g - (n - 1) * gb) / n)
            doors = [dw] * n
            if k > 1:
                c.warn.append("Дверей %d не кратно секциям %d: стыки створок не попадут на стойки." % (n, k))
        else:
            if len(items) == 1:
                per = [int(items[0]) // k] * k  # общее число дверей поровну по секциям, стыки на стойках
            else:
                per = per_section(a.doors, k, 0, name="--doors")
            bounds = [0.0]
            x = t
            for i in range(k - 1):
                x += widths[i]
                bounds.append(x + t / 2)
                x += t
            bounds.append(float(W))
            for i in range(k):
                nd = per[i]
                if not nd:
                    continue
                lg = g if i == 0 else gb / 2
                rg = g if i == k - 1 else gb / 2
                span = bounds[i + 1] - bounds[i]
                dw = c.fl((span - lg - rg - (nd - 1) * gb) / nd)
                doors += [dw] * nd
            if k > 1:
                c.notes.append("Двери по секциям, стыки створок на осях стоек. Если на одну стойку навешены две створки, нужны полунакладные петли (изгиб 8..9), и ширину таких створок пересчитать по схеме петли.")
        groups = {}
        for dw in doors:
            groups[dw] = groups.get(dw, 0) + 1
        for dw, q in sorted(groups.items(), reverse=True):
            c.add("Фасад", dh, dw, q, a.front_t, a.front_material or M, (E2, E2, E2, E2))
            hn = hinges_for(dh) + (1 if dw > 600 else 0)
            c.hwa("Петля 35 мм накладная", hn * q)
            c.notes.append("Фасад %sx%s: %d петли, оси чашек от низа фасада %s; центр чашки 22 от края. Сверить, чтобы петли не попадали на стационарные полки (не ближе 30)."
                           % (fmt(dh), fmt(dw), hn, ", ".join(str(p) for p in hinge_positions(dh, hn, a.hinge_offset))))
            if dw > 600:
                c.warn.append("Створка шириной %s больше 600: лучше разделить." % fmt(dw))
            if dw < 300 and dh > 1200:
                c.warn.append("Створка %sx%s уже 300 при большой высоте: риск перекоса." % (fmt(dh), fmt(dw)))
        c.hwa("Ручка", len(doors))

    finish(c, H, D)
    return c, H


def build_drawers(a):
    """Внутренние ящики в проёме -W (в свету) глубиной -D от переднего края стоек."""
    c = Ctx(a)
    t = a.t
    n = a.drawers or 1
    sp = a.spacer
    lw = a.W - 2 * sp
    d_avail = a.D - a.inset
    if sp:
        if a.H:
            c.add("Проставка под направляющие", a.H, c.fl(d_avail), 2, t, a.material, (a.edge_face, 0, 0, 0),
                  "на стойки проёма, передний торец виден")
        else:
            c.add("Проставка под направляющие", c.fl(d_avail), 80, 2 * n, t, a.material, (0, 0, 0, 0), "полоса под каждую направляющую")
        c.hwa("Саморез 4x25 для проставок (не длиннее 30 при 16+16)", 8 * (1 if a.H else n))
    add_slides_boxes(c, lw, d_avail, a.box_h, n, t, interior=True)
    c.notes.append("Внутренний ящик за распашной дверью: проставка %s должна быть не меньше выступа петли и планки в проём. "
                   "Для накладной петли 110 градусов обычно хватает 16..20, сверить по схеме петли. Ящик отодвинут от переднего края на %s, дверь должна открываться не меньше 95 градусов." % (fmt(sp), fmt(a.inset)))
    if a.H:
        stack = n * a.box_h + (n - 1) * 40 + 20
        if stack > a.H:
            c.warn.append("Ящики %d x %s с промежутками не помещаются в зону %s." % (n, fmt(a.box_h), fmt(a.H)))
    finish(c, a.H or 0, a.D)
    return c, a.H or 0


def build_niche(a):
    c = Ctx(a)
    t = a.t
    ws = [float(x) for x in a.niche_w.split(",")]
    hs = [float(x) for x in a.niche_h.split(",")]
    ds = [float(x) for x in a.niche_d.split(",")]
    wmin, wmax, hmin, hmax, dmin = min(ws), max(ws), min(hs), max(hs), min(ds)
    wp_h = wp_d = 0.0
    if a.wall_plinth:
        wp_h, wp_d = [float(x) for x in a.wall_plinth.lower().replace("х", "x").split("x")]
    offset = wp_d if (a.wall_plinth and a.plinth_mode == "offset") else 0
    back = a.back_t if a.back == "overlay" else 0
    d_body = floor10(dmin - offset - back - a.front_t - 2)
    lim_h = [hmin - a.top_gap, a.sheet_len - 2 * a.trim]
    lim_h.append(math.sqrt(max(0, (hmin - LIFT_COMFORT) ** 2 - d_body ** 2)))
    h_body = floor10(min(lim_h))
    body_total = wmin - 2 * a.side_gap
    bodies = a.bodies or max(1, math.ceil(body_total / a.max_body))
    bw = math.floor(body_total / bodies)
    widths = [bw] * bodies
    widths[-1] = body_total - bw * (bodies - 1)

    print("## Встройка в нишу %sx%sx%s" % (fmt(wmax), fmt(hmax), fmt(dmin)))
    print("")
    print("| Параметр | Значение |")
    print("|---|---|")
    print("| Ниша ширина мин/макс | %s / %s |" % (fmt(wmin), fmt(wmax)))
    print("| Ниша высота мин/макс, перепад | %s / %s, %s |" % (fmt(hmin), fmt(hmax), fmt(hmax - hmin)))
    print("| Глубина ниши мин | %s |" % fmt(dmin))
    print("| Корпусов | %d, ширины %s, всего %s + зазоры по %s с боков |" % (bodies, " + ".join(fmt(x) for x in widths), fmt(body_total), fmt(a.side_gap)))
    print("| Высота корпуса | %s (ограничения: потолок-зазор %s, лист %s, подъём %s) |" % (fmt(h_body), fmt(lim_h[0]), fmt(lim_h[1]), fmt(lim_h[2])))
    print("| Глубина корпуса | %s |" % fmt(d_body))
    print("| Глубина итого | %s + ХДФ %s + корпус %s + зазор 2 + фасад %s = %s из %s |" %
          (fmt(offset), fmt(back), fmt(d_body), fmt(a.front_t), fmt(offset + back + d_body + 2 + a.front_t), fmt(dmin)))
    print("| Диагональ боковины при подъёме | %.0f при потолке %s |" % (math.hypot(h_body, d_body), fmt(hmin)))
    print("")
    E2 = a.edge_face
    fw = max(a.side_gap + 10, 80)
    c.add("Фальшпланка боковая", h_body, fw, 2, a.front_t, a.front_material or a.material, (E2, 0, E2, 0),
          "в плоскости фасадов; нужна ширина %s, заготовка %s под кромочный станок, подрезать по стене на месте" % (fmt(a.side_gap), fmt(fw)))
    c.add("Подложка фальшпланки", h_body, 60, 2, t, a.material, (0, 0, 0, 0), "на боковину корпуса, к ней крепится фальшпланка")
    top_h = hmax - h_body
    if top_h > 5:
        c.add("Фальшпланка верхняя", wmax, top_h + 10, 1, a.front_t, a.front_material or a.material, (E2, 0, 0, 0),
              "по всей ширине ниши, +10 на подгонку по потолку")
        c.add("Подложка верхней фальшпланки", c.fl(body_total - 2 * t), 60, 1, t, a.material, (0, 0, 0, 0), "на крышки корпусов")
        if top_h > 250:
            c.notes.append("Над корпусами %s: вместо планки выгоднее антресоль высотой %s." % (fmt(top_h), fmt(top_h - 10)))
    if bodies > 1:
        c.hwa("Стяжка межсекционная (или саморез 4x25, не длиннее 30 при 16+16)", 3 * (bodies - 1) * 2)
    c.hwa("Уголок или крепёж корпуса к стене (сейсмика)", sum(wall_points(w) for w in widths))
    if a.wall_plinth:
        if a.plinth_mode == "notch":
            c.notes.append("Плинтус стены %sx%s: вырез в задне-нижнем углу боковин и стоек %sx%s (высота x глубина). Цоколь корпуса отдельно, 70..100 с заглублением."
                           % (fmt(wp_h), fmt(wp_d), fmt(wp_h + 5), fmt(wp_d + 5)))
        else:
            c.notes.append("Плинтус стены %sx%s: корпус отодвинут от стены на %s, глубина корпуса уменьшена." % (fmt(wp_h), fmt(wp_d), fmt(wp_d)))
    if hmax - hmin > 10 or wmax - wmin > 10:
        c.notes.append("Ниша кривая: корпуса ставить по уровню на регулируемые опоры или подкладки, перепады закрывают фальшпланки.")
    if a.side_gap < 25:
        c.warn.append("Боковой зазор %s мал: створка с ручкой может не открыться у стены, лучше 30..50." % fmt(a.side_gap))
    print("Команды для корпусов (секции, двери, полки подставить по заказу):")
    print("")
    print("```bash")
    csv_name = a.csv or "order.csv"
    common = cli_args(a, BODY_KEYS) + ["--sheet-len", str(a.sheet_len), "--sheet-wid", str(a.sheet_wid),
                                       "--plinth", fmt(a.plinth), "--ceiling", str(int(hmin))]
    for i, w in enumerate(widths):
        append = ["--append"] if (a.csv or i > 0) else []
        print(command(["--type", "cabinet", "-W", fmt(w), "-H", fmt(h_body), "-D", fmt(d_body)] + common +
                      ["--prefix", "Ш%d" % (i + 1), "--csv", csv_name] + append))
    if not a.csv:
        print(command(["--type", "niche"] + cli_args(a, NICHE_KEYS) +
                      ["--prefix", a.prefix or "Ниша", "--csv", csv_name, "--append"]) + "  # фальшпланки")
    print("```")
    print("")
    finish(c, h_body, d_body, ceiling=hmin)
    return c, h_body


def finish(c, H, D, ceiling=None):
    a = c.a
    if c.joints:
        total = sum(confirmats_for(j) for j in c.joints)
        c.hwa("Конфирмат 7x50", total)
        if not a.no_caps:
            c.hwa("Заглушка конфирмата (без шляпок на виду можно не брать)", total)
    sheet_max = a.sheet_len - 2 * a.trim
    sheet_w_max = a.sheet_wid - 2 * a.trim
    for p in c.parts:
        if p.material.startswith(HDF):
            continue
        fits = p.L <= sheet_max and p.W <= sheet_w_max
        turned = p.W <= sheet_max and p.L <= sheet_w_max
        if not fits and not (turned and not p.grain):
            hint = " вдоль текстуры, повернуть можно только однотонный декор (--no-grain)" if turned else ""
            c.warn.append("%s %sx%s не выходит из листа %dx%d с обпилом %d%s."
                          % (p.name, fmt(p.L), fmt(p.W), a.sheet_len, a.sheet_wid, a.trim, hint))
        if min(p.L, p.W) < 70 and any(p.edges):
            c.warn.append("%s: ширина %s меньше 70, кромочный станок может не взять." % (p.name, fmt(min(p.L, p.W))))
    ceil_ = ceiling or a.ceiling
    if ceil_ and H:
        diag = math.hypot(H, D)
        if diag >= ceil_ - LIFT_MIN:
            c.warn.append("Диагональ боковины %.0f при потолке %d: корпус не поднять. Уменьшить высоту или делить на корпус и антресоль." % (diag, ceil_))
        elif diag >= ceil_ - LIFT_COMFORT:
            c.warn.append("Диагональ боковины %.0f почти равна потолку %d: подъём впритык." % (diag, ceil_))
    if a.type == "cabinet" and H and (H > WALL_FIX_H or H > 3 * D):
        c.notes.append("Сейсмика: корпус выше %d или с высотой больше 3 глубин крепить к стене у верха, точек: %d."
                       % (WALL_FIX_H, wall_points(a.W)))


def saw_size(p):
    x1, x2, y1, y2 = p.edges
    ded = lambda e: e if e >= 1 else 0
    return p.L - ded(y1) - ded(y2), p.W - ded(x1) - ded(x2)


def edge_label(e):
    return "" if not e else "ПВХ%s" % (fmt(e) if e >= 1 else str(e))


def pname(a, p):
    return ("%s %s" % (a.prefix, p.name)) if a.prefix else p.name


def report(c, H):
    a = c.a
    title = {"cabinet": "Шкаф/корпус", "base": "Нижний кухонный модуль", "wall": "Верхний кухонный модуль",
             "drawers": "Внутренние ящики", "niche": "Фальшпланки и подложки"}[a.type]
    out = []
    if a.type in ("cabinet", "base", "wall"):
        out.append("## %s%s %sx%sx%s, ЛДСП %d" % ((a.prefix + " ") if a.prefix else "", title, fmt(a.W), fmt(H), fmt(a.D), a.t))
    else:
        out.append("## %s%s" % ((a.prefix + " ") if a.prefix else "", title))
    out.append("")
    out.append("Размеры %s, округление %s мм. Лист ЛДСП %dx%d, обпил %d. Длина вдоль текстуры. X1 передний (у планок верхний), X2 задний; Y1 верхний или левый, Y2 нижний или правый." %
               ("ПИЛЬНЫЕ (кромка >= 1 мм вычтена)" if a.saw else "ЧИСТОВЫЕ (с кромкой)", fmt(a.round), a.sheet_len, a.sheet_wid, a.trim))
    out.append("")
    out.append("| # | Деталь | Длина | Ширина | Шт | Толщ. | Материал | X1 | X2 | Y1 | Y2 | Примечание |")
    out.append("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for i, p in enumerate(c.parts, 1):
        L, Wd = saw_size(p) if a.saw else (p.L, p.W)
        e = [fmt(x) if x else "-" for x in p.edges]
        out.append("| %d | %s | %s | %s | %d | %s | %s | %s | %s | %s | %s | %s |" %
                   (i, pname(a, p), fmt(L), fmt(Wd), p.qty, fmt(p.t), p.material, e[0], e[1], e[2], e[3], p.note))
    out.append("")
    area, edge_m = {}, {}
    for p in c.parts:
        area[p.material] = area.get(p.material, 0) + p.L * p.W * p.qty / 1e6
        for side, e in enumerate(p.edges):
            if e:
                edge_m[e] = edge_m.get(e, 0) + (p.L if side < 2 else p.W) * p.qty / 1000
    out.append("**Материалы:**")
    for m, s in area.items():
        if m.startswith(HDF):
            big = sum(p.qty for p in c.parts if p.material == m and min(p.L, p.W) > 1000)
            hdf_area = (HDF_SHEET[0] - 2 * a.trim) * (HDF_SHEET[1] - 2 * a.trim) / 1e6
            out.append("- %s: %.2f м2, листов %dx%d не меньше %d (крупных деталей %d, раскладку проверить: у части сервисов одна сторона детали ХДФ до 1000)"
                       % (m, s, HDF_SHEET[0], HDF_SHEET[1], max(math.ceil(s / (hdf_area * 0.8)), math.ceil(big / 2.0)), big))
        else:
            out.append("- %s: %.2f м2, листов %dx%d примерно %.1f при КИМ 0.8" % (m, s, a.sheet_len, a.sheet_wid, s / (a.sheet_len * a.sheet_wid / 1e6 * 0.8)))
    for e, ln in sorted(edge_m.items(), reverse=True):
        out.append("- Кромка %s мм: %.1f пог. м, с запасом 10%%: %.1f" % (fmt(e), ln, ln * 1.1))
    out.append("")
    if c.hw:
        out.append("**Фурнитура и крепёж (оценка):**")
        for k_, v in c.hw.items():
            out.append("- %s: %s" % (k_, v))
        out.append("")
    if c.notes:
        out.append("**Заметки:**")
        for n_ in c.notes:
            out.append("- " + n_)
        out.append("")
    out.append("**Проверки:**")
    out += ["- ВНИМАНИЕ: " + w for w in c.warn] if c.warn else ["- Критичных замечаний нет."]
    return "\n".join(out)


def write_csv(c, path):
    a = c.a
    header = ["", "Имя детали", "X ДЛИНА! (вдоль длинной стороны листа и текстуры)", "Y (ширина) ", "Кол-во",
              "Поворот", "Кромка X1", "Кромка X2", "Кромка Y1", "Кромка Y2", "", "Толщина", "Материал"]
    start = 0
    exists = a.append and os.path.exists(path)
    if exists:
        with open(path, "r", encoding=a.encoding, newline="") as f:
            start = max(0, sum(1 for _ in f) - 1)
    with open(path, "a" if exists else "w", newline="", encoding=a.encoding) as f:
        w = csv.writer(f, delimiter=";")
        if not exists:
            w.writerow(header)
        for i, p in enumerate(c.parts, start + 1):
            L, Wd = saw_size(p) if a.saw else (p.L, p.W)
            w.writerow([i, pname(a, p), fmt(L), fmt(Wd), p.qty, "" if p.grain else "да"] +
                       [edge_label(e) for e in p.edges] + ["", fmt(p.t), p.material])


def make_parser():
    ap = argparse.ArgumentParser(description="Деталировка типовых корпусов из ЛДСП")
    ap.add_argument("--type", choices=["cabinet", "base", "wall", "drawers", "niche"], default="cabinet")
    ap.add_argument("-W", type=float, default=0, help="ширина: габарит корпуса, для drawers проём в свету")
    ap.add_argument("-H", type=float, default=0, help="высота: габарит; base/wall по умолчанию 720; для drawers высота зоны")
    ap.add_argument("-D", type=float, default=0, help="глубина корпуса без фасада; для drawers от переднего края стоек до задней стенки")
    ap.add_argument("-t", type=int, default=16)
    ap.add_argument("--material", default="LDSP16")
    ap.add_argument("--front-material", default="")
    ap.add_argument("--front-t", type=float, default=16)
    ap.add_argument("--round", type=float, default=1, help="шаг округления вниз, 1 или 0.5")
    ap.add_argument("--no-grain", action="store_true", help="однотонный декор: поворот деталей разрешён")
    ap.add_argument("--prefix", default="", help="префикс имён деталей, например Ш1 или Н600")
    ap.add_argument("--plinth", type=float, default=None, help="цоколь корпуса: по умолчанию 0, в режиме niche 80; не путать с плинтусом стены")
    ap.add_argument("--legs", type=int, default=100)
    ap.add_argument("--rail", type=float, default=100)
    ap.add_argument("--sections", type=int, default=1)
    ap.add_argument("--section-widths", default="", help="ширины секций в свету через запятую, * = остаток")
    ap.add_argument("--shelves", default="", help="съёмных полок: одно число или по секциям 0,4")
    ap.add_argument("--fixed-shelves", default="", help="стационарных полок: одно число или по секциям")
    ap.add_argument("--shelf-setback", type=float, default=20)
    ap.add_argument("--rod", default="", help="штанга: all или номера секций 1,3")
    ap.add_argument("--rod-height", type=int, default=0, help="высота оси штанги от пола для проверки")
    ap.add_argument("--back", choices=["overlay", "groove", "none"], default="overlay")
    ap.add_argument("--back-t", type=int, default=3)
    ap.add_argument("--groove-depth", type=float, default=8)
    ap.add_argument("--groove-offset", type=float, default=16)
    ap.add_argument("--doors", default="", help="дверей: на весь корпус (кратное числу секций делится поровну) или по секциям 2,1")
    ap.add_argument("--hinge-offset", type=float, default=100, help="ось крайней петли от края фасада")
    ap.add_argument("--drawers", type=int, default=0)
    ap.add_argument("--drawer-fronts", default="", help="высоты фасадов ящиков, например 140+283+283")
    ap.add_argument("--slide", choices=list(SLIDES), default="ball")
    ap.add_argument("--slide-len", type=int, default=0)
    ap.add_argument("--box-max", type=float, default=250)
    ap.add_argument("--box-h", type=float, default=150, help="высота короба внутреннего ящика")
    ap.add_argument("--spacer", type=float, default=16, help="проставка под направляющие внутренних ящиков, 0 без неё")
    ap.add_argument("--inset", type=float, default=20, help="отступ внутреннего ящика от переднего края")
    ap.add_argument("--gap", type=float, default=2)
    ap.add_argument("--gap-between", type=float, default=3)
    ap.add_argument("--edge-face", type=float, default=2)
    ap.add_argument("--edge-hidden", type=float, default=0.4)
    ap.add_argument("--no-caps", action="store_true", help="шляпки конфирматов не видны, заглушки не считать")
    ap.add_argument("--niche-w", default="", help="замеры ширины ниши через запятую")
    ap.add_argument("--niche-h", default="", help="замеры высоты ниши через запятую")
    ap.add_argument("--niche-d", default="", help="замеры глубины ниши через запятую")
    ap.add_argument("--wall-plinth", default="", help="плинтус стены ВxГ, например 60x15")
    ap.add_argument("--plinth-mode", choices=["notch", "offset"], default="notch", help="вырез в боковинах или отступ от стены")
    ap.add_argument("--side-gap", type=float, default=30, help="зазор корпус-стена с каждой стороны под фальшпланку")
    ap.add_argument("--top-gap", type=float, default=30, help="мин. зазор до самой низкой точки потолка")
    ap.add_argument("--bodies", type=int, default=0, help="число корпусов, 0 авто")
    ap.add_argument("--max-body", type=float, default=1000, help="макс. ширина одного корпуса для авто-деления")
    ap.add_argument("--sheet-len", type=int, default=2800)
    ap.add_argument("--sheet-wid", type=int, default=2070)
    ap.add_argument("--trim", type=int, default=10)
    ap.add_argument("--ceiling", type=int, default=0)
    ap.add_argument("--saw", action="store_true")
    ap.add_argument("--csv", default="")
    ap.add_argument("--append", action="store_true", help="дописать в существующий CSV")
    ap.add_argument("--encoding", default="cp1251")
    return ap


def parse_args(argv=None):
    a = make_parser().parse_args(argv)
    if a.plinth is None:
        a.plinth = 80.0 if a.type == "niche" else 0.0
    return a


def main():
    a = parse_args()
    validate_args(a)

    if a.type == "niche":
        if not (a.niche_w and a.niche_h and a.niche_d):
            sys.exit("Для niche нужны --niche-w, --niche-h, --niche-d")
        c, H = build_niche(a)
    elif a.type == "drawers":
        if not (a.W and a.D):
            sys.exit("Для drawers нужны -W (проём в свету) и -D")
        c, H = build_drawers(a)
    else:
        if not (a.W and a.D):
            sys.exit("Нужны -W и -D")
        if a.doors and a.doors != "0" and a.drawers:
            sys.exit("Либо --doors, либо --drawers. Комбинированный модуль считать по частям.")
        c, H = build_body(a)
    print(report(c, H))
    if a.csv:
        write_csv(c, a.csv)
        print("\nCSV: " + a.csv + (" (дописано)" if a.append else ""))


if __name__ == "__main__":
    main()
