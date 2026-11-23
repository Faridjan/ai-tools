#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Проверка модели БАЗИС-Мебельщика по данным сборщика cmd_review_collect.js.

  py -3 review.py review_data.json --out <папка> [--mode review|handoff]
        [--rules review_rules.json] [--expect 1210x610x3012] [--hidden left,right,top]

Режимы: review (ревью в любой момент) и handoff (финальная проверка перед распилом).
В обоих режимах правила одни и те же. В handoff несохранённая модель считается блокером.
Вердикт: ГОТОВО, если нет блокеров и нет невыполненных проверок.
Коды возврата: 0 готово, 1 есть блокеры или невыполненные проверки, 2 плохие входные данные.
Пишет в --out: review_report.md, review_report.json, cutlist.csv, hardware.csv.
Только стандартная библиотека Python 3.8+.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
from collections import defaultdict
from itertools import combinations

SCHEMA = 1
ERROR, WARN, INFO, UNCHECKED = "error", "warn", "info", "unchecked"
SEV_TITLE = {ERROR: "Блокеры", UNCHECKED: "Не проверено", WARN: "Проверить", INFO: "Сведения"}
FACES = {"left": (0, 0), "right": (0, 1), "bottom": (1, 0), "top": (1, 1), "back": (2, 0), "front": (2, 1)}
FACE_RU = {"left": "левая", "right": "правая", "bottom": "низ", "top": "верх", "back": "зад", "front": "лицо"}
AXIS = {"X": 0, "Y": 1, "Z": 2}
SWING = ("DoorLeft", "DoorRight", "DoorFlap", "DoorLift")

MANUAL = [
    "Анализ модели в самом Базисе (меню Анализ): из скрипта встроенный инспектор 11.6 ничего не находит.",
    "Материалы и кромка есть в базе материалов цеха: скрипт видит только строку названия, опечатка даёт материал вне раскроя и сметы.",
    "Крепёж пересчитан после последних правок размеров: скриптом он не перестраивается.",
    "Пазы (LED, под ХДФ) не задевают отверстия крепежа: геометрию паза скрипт не сверяет (образец cmd_audit5.js).",
    "Присадка петель по техкаталогу: ответная планка 37 мм от края, чашка 35, под евровинты d5x13 вместо d2.",
    "Направление текстуры на фасадах и видимых деталях глазами в 3D: скрипт сверяет только согласованность.",
    "Двери и ящики открываются без задевания (анимация в Базисе), ручки не упираются в стены и соседние фасады.",
    "Габариты изделия против замера ниши: зазоры к стенам, потолку, плинтус, розетки.",
    "Перед загрузкой в облако цеха: модель сохранена, каждая загрузка файла платная (см. my-shop.md).",
]


class Finding:
    def __init__(self, fid, sev, title, items=None, fix=""):
        self.id, self.sev, self.title, self.items, self.fix = fid, sev, title, list(items or []), fix

    def as_dict(self):
        return {"id": self.id, "sev": self.sev, "title": self.title, "items": self.items, "fix": self.fix}


def disp(name):
    return (name or "").split("\r")[0].strip() or "(без имени)"


def article(name):
    parts = (name or "").split("\r")
    return parts[1].strip() if len(parts) > 1 else ""


def ext(o):
    return [o["max"][i] - o["min"][i] for i in range(3)]


def overlap(a, b):
    return [min(a["max"][i], b["max"][i]) - max(a["min"][i], b["min"][i]) for i in range(3)]


def union_box(objs):
    objs = [o for o in objs if "min" in o]
    if not objs:
        return None
    return {"min": [min(o["min"][i] for o in objs) for i in range(3)],
            "max": [max(o["max"][i] for o in objs) for i in range(3)]}


def fmt(v):
    return ("%.1f" % v).rstrip("0").rstrip(".")


def where(o):
    return "%s [%s..%s x %s..%s x %s..%s]" % (disp(o["name"]), fmt(o["min"][0]), fmt(o["max"][0]), fmt(o["min"][1]),
                                               fmt(o["max"][1]), fmt(o["min"][2]), fmt(o["max"][2]))


class Review:
    def __init__(self, data, cfg, mode="review", expect=None, hidden=None):
        self.d, self.cfg, self.mode, self.expect = data, cfg, mode, expect
        self.f = []
        self.hidden_faces = set(hidden if hidden is not None else cfg["holes"]["hidden_faces"])
        self.blocks = {b["id"]: b for b in data.get("blocks", [])}
        self.panels = [p for p in data.get("panels", []) if "min" in p and "t" in p]
        self.parts = [p for p in data.get("parts", []) if "min" in p]
        self.failed = {e["step"]: e for e in data.get("collectErrors", [])}
        for p in self.panels + self.parts:
            anc = [self.blocks[a] for a in p.get("anc", []) if a in self.blocks]
            p["_anc"] = anc
            p["_in_fastener"] = any(b.get("fastener") for b in anc)
            p["_door"] = next((b for b in anc if b.get("anim") in SWING or b.get("anim") in ("SDoorLeft", "SDoorRight")
                               or b.get("kindStrict") == "door"), None)
            p["_drawer"] = next((b for b in anc if b.get("anim") == "Box" or b.get("kind") == "drawer"), None)
        self.cut = [p for p in self.panels if not p["_in_fastener"]]
        for p in self.cut:
            e = ext(p)
            p["_ext"] = e
            p["_tax"] = AXIS.get(p.get("orient"), e.index(min(e)))
            p["_rot"] = min(e) > p["t"] + cfg["geometry"]["rotated_tol"]
            tex = p.get("tex", 0)
            cw, ch = p.get("cw", 0), p.get("ch", 0)
            if tex == 1:
                p["_gl"], p["_gw"] = cw, ch
            elif tex == 2:
                p["_gl"], p["_gw"] = ch, cw
            else:
                p["_gl"], p["_gw"] = max(cw, ch), min(cw, ch)
        self.bounds = union_box(self.cut)
        self._units()
        self._holes()

    # ---------- подготовка ----------
    def add(self, fid, sev, title, items=None, fix=""):
        self.f.append(Finding(fid, sev, title, items, fix))

    def unchecked(self, fid, title, steps):
        """Проверка опирается на шаги сборщика: если хоть один упал, она не выполнена."""
        bad = [self.failed[s] for s in steps if s in self.failed]
        if bad:
            self.add(fid, UNCHECKED, title + ": данные не собраны",
                     ["%s: %s (x%s)" % (e["step"], e["error"], e.get("count", 1)) for e in bad],
                     "Разобраться с ошибкой сборщика и повторить, либо проверить вручную.")
        return bool(bad)

    def _units(self):
        """Единица фурнитуры: самый верхний блок-предок без деталей под распил, иначе сама деталь."""
        has_panels = set()
        for p in self.cut:
            for b in p["_anc"]:
                has_panels.add(b["id"])
        self.units = {}
        ign = re.compile(self.cfg["hardware"]["ignore_re"], re.I)
        for p in self.parts:
            if ign.search(p["name"]):
                continue
            top = None
            for b in p["_anc"]:
                if b.get("fastener") or b["id"] not in has_panels:
                    top = b
                    break
            uid = top["id"] if top else p["id"]
            u = self.units.setdefault(uid, {"id": uid, "name": top["name"] if top else p["name"], "parts": [],
                                            "holes": [], "anc": (top or p).get("anc", [])})
            u["parts"].append(p)
            p["_unit"] = uid
        for u in self.units.values():
            box = union_box(u["parts"])
            u["min"], u["max"] = box["min"], box["max"]
            u["text"] = (u["name"] + " " + " ".join(p["name"] for p in u["parts"])).lower()

    def _holes(self):
        """Каждому отверстию: деталь, пласть или торец, вход."""
        tol = self.cfg["holes"]["face_tol"]
        owner_unit = {p["id"]: p.get("_unit") for p in self.parts}
        self.holes = []
        for h in self.d.get("holes", []):
            if "p" not in h:
                continue
            h = dict(h)
            h["unit"] = owner_unit.get(h["owner"])
            cands = []
            for p in self.cut:
                if all(p["min"][i] - 1 <= h["p"][i] <= p["max"][i] + 1 for i in range(3)):
                    for ax in range(3):
                        for side in (0, 1):
                            co = p["max"][ax] if side else p["min"][ax]
                            if abs(h["p"][ax] - co) <= tol:
                                score = 0
                                if h.get("dir"):
                                    into = -h["dir"][ax] if side else h["dir"][ax]
                                    score += 4 if into > 0.5 else -4
                                face = ax == p["_tax"]
                                limit = p["t"] if face else p["_ext"][ax]
                                if h["depth"] <= limit + 0.5:
                                    score += 2
                                if face:
                                    score += 1
                                cands.append((score, p, ax, side, face))
            if cands:
                cands.sort(key=lambda c: -c[0])
                _, p, ax, side, face = cands[0]
                h.update(panel=p, axis=ax, side=side, face=face, through=face and h["depth"] >= p["t"] - 0.05)
                if h["unit"] in self.units:
                    self.units[h["unit"]]["holes"].append(h)
            else:
                h["panel"] = None
            self.holes.append(h)

    # ---------- модель ----------
    def check_model(self):
        m = self.d.get("model", {})
        if self.d.get("schema") != SCHEMA:
            self.add("M00", UNCHECKED, "Версия данных сборщика %s, ожидалась %s" % (self.d.get("schema"), SCHEMA),
                     fix="Обновить плагин и повторить сбор.")
        other = [e for s, e in self.failed.items()]
        if other:
            self.add("M03", UNCHECKED, "Сборщик не смог прочитать часть модели",
                     ["%s: %s (x%s)" % (e["step"], e["error"], e.get("count", 1)) for e in other],
                     "Проверки, которым нужны эти данные, помечены ниже как невыполненные.")
        if not m.get("file"):
            self.add("M01", ERROR if self.mode == "handoff" else WARN, "Модель ни разу не сохранена в файл",
                     fix="Сохранить в Базисе: без файла нет бэкапа и нечего отдавать в цех.")
        if not self.cut:
            self.add("M02", ERROR, "В модели нет деталей под распил")
            return
        size = sorted(ext(self.bounds))
        txt = " x ".join(fmt(v) for v in ext(self.bounds))
        if self.expect:
            want = sorted(self.expect)
            if any(abs(a - b) > 0.5 for a, b in zip(size, want)):
                self.add("M04", ERROR, "Габарит по деталям %s (X x Y x Z) не совпадает с заданным %s"
                         % (txt, " x ".join(fmt(v) for v in self.expect)),
                         fix="Заданные габариты не менять: найти деталь, которая выходит за габарит или не доходит.")
            else:
                self.add("M04", INFO, "Габарит по деталям %s (X x Y x Z) совпадает с заданным" % txt)
        else:
            self.add("M04", INFO, "Габарит по деталям %s (X x Y x Z): сверить с заданием, параметр --expect не передан" % txt)
        hid = [where(p) for p in self.cut + self.parts if p.get("hidden")]
        if hid:
            self.add("M05", WARN, "Скрытые объекты: в раскрой и смету они всё равно попадут", hid,
                     "Показать и проверить, либо удалить лишнее.")
        ign = re.compile(self.cfg["hardware"]["ignore_re"], re.I)
        loose = [where(p) for p in self.parts if not p.get("anc") and not ign.search(p["name"])
                 and not any(h["owner"] == p["id"] for h in self.holes)]
        if loose:
            self.add("M06", WARN, "Объекты верхнего уровня без свойств панели и без присадки", loose,
                     "Тело после булевой операции выпадает из раскроя и сметы. Фурнитуру ставить из библиотеки, а не рисовать.")
        empty = [disp(b["name"]) + " [" + b["path"] + "]" for b in self.blocks.values() if b.get("n") == 0]
        if empty:
            self.add("M07", WARN, "Пустые блоки (мусор схем крепежа)", empty, "Удалить пустые блоки.")
        dre = re.compile(self.cfg["names"]["default_re"], re.I)
        noname = [where(p) for p in self.cut if dre.search(disp(p["name"]) if p["name"].strip() else "")]
        if noname:
            self.add("N01", WARN, "Детали без осмысленного имени", noname, "Переименовать: имя уходит в раскрой и на бирку.")

    # ---------- геометрия ----------
    def check_geometry(self):
        g = self.cfg["geometry"]
        self.unchecked("G00", "Геометрия деталей", ["box", "panel dims"])
        rot_open, rot_other = [], []
        for p in self.cut:
            if p["_rot"]:
                (rot_open if (p["_door"] or p["_drawer"]) else rot_other).append(where(p))
        if rot_open:
            self.add("G02", ERROR, "Двери или ящики стоят в открытом положении (анимация)", rot_open,
                     "Закрыть анимацию в Базисе и повторить проверку: по открытым фасадам зазоры, петли и пересечения считаются неверно.")
        if rot_other:
            self.add("G03", WARN, "Детали под углом к осям: проверки по габариту для них неточны", rot_other,
                     "Проверить такие детали глазами.")
        hard, soft, sliver = [], [], []
        lo, hi = g["sliver_gap"]
        for a, b in combinations(self.cut, 2):
            ov = overlap(a, b)
            if all(v > g["overlap_tol"] for v in ov):
                line = "%s и %s: %s мм" % (where(a), where(b), " x ".join(fmt(v) for v in ov))
                if a.get("rect", True) and b.get("rect", True) and not a["_rot"] and not b["_rot"]:
                    hard.append(line)
                else:
                    soft.append(line)
                continue
            neg = [i for i in range(3) if ov[i] < 0]
            if len(neg) == 1 and lo < -ov[neg[0]] < hi:
                rest = [ov[i] for i in range(3) if i != neg[0]]
                if min(rest) > 0 and rest[0] * rest[1] >= g["sliver_min_face"]:
                    sliver.append("%s и %s: щель %s мм" % (disp(a["name"]), disp(b["name"]), fmt(-ov[neg[0]])))
        if hard:
            self.add("G01", ERROR, "Детали пересекаются", hard, "Исправить размеры или положение.")
        if soft:
            self.add("G04", WARN, "Пересечение по габариту у фигурных или повёрнутых деталей", soft,
                     "Вырез мог быть сделан под соседнюю деталь: проверить глазами.")
        if sliver:
            self.add("G05", WARN, "Щель меньше полумиллиметра между деталями: похоже на ошибку размера", sliver,
                     "Свести детали вплотную или задать нормальный зазор.")
        # зазоры между фасадами
        fac = [p for p in self.cut if p.get("role") == "facade" and p["_tax"] == 2 and not p["_rot"]]
        glo, ghi = g["facade_gap"]
        bad = []
        for a, b in combinations(fac, 2):
            ov = overlap(a, b)
            if ov[2] <= 0:
                continue
            for ax, other in ((0, 1), (1, 0)):
                gap = -ov[ax]
                if 0 <= gap < 30 and ov[other] > 20 and not (glo <= gap <= ghi):
                    bad.append("%s и %s: зазор %s мм по %s" % (disp(a["name"]), disp(b["name"]), fmt(gap), "XY"[ax]))
        if bad:
            self.add("G06", WARN, "Зазор между фасадами вне %s..%s мм" % (fmt(glo), fmt(ghi)), bad,
                     "Обычный зазор 2-4 мм. Меньше: фасады трутся, больше: видна щель.")
        # полки
        warn, err = [], []
        for p in self.cut:
            if p.get("role") != "shelf" or p["_tax"] != 1:
                continue
            limit = g["shelf_span"].get(str(int(round(p["t"]))), 800)
            span = p["_ext"][0]
            if span > limit * g["shelf_span_hard_factor"]:
                err.append("%s: пролёт %s при толщине %s (предел %s)" % (where(p), fmt(span), fmt(p["t"]), limit))
            elif span > limit:
                warn.append("%s: пролёт %s при толщине %s (норма до %s)" % (where(p), fmt(span), fmt(p["t"]), limit))
        if err:
            self.add("G07", ERROR, "Полка прогнётся: пролёт намного больше нормы", err,
                     "Добавить стойку или опору, либо взять плиту толще.")
        if warn:
            self.add("G08", WARN, "Пролёт полки больше нормы", warn, "Добавить опору посередине или ограничить нагрузку.")

    # ---------- лист и материалы ----------
    def sheet_of(self, mat):
        s = self.cfg["sheet"]
        m = re.search(r"(\d{4})\s*[*xXхХ×]\s*(\d{4})", mat or "")
        if m:
            a, b = int(m.group(1)), int(m.group(2))
            return max(a, b), min(a, b), "из названия"
        low = (mat or "").lower()
        for key, val in s.get("by_material", {}).items():
            if key.lower() in low:
                return max(val), min(val), "из правил"
        return max(s["default"]), min(s["default"]), "по умолчанию"

    def check_materials(self):
        if self.unchecked("S00", "Материалы и формат листа", ["panel dims", "texture"]):
            return
        s, mc = self.cfg["sheet"], self.cfg["materials"]
        big, dflt = [], set()
        groups = defaultdict(list)
        for p in self.cut:
            groups[(p.get("mat", ""), p["t"])].append(p)
            L, W, src = self.sheet_of(p.get("mat"))
            L2, W2 = L - 2 * s["trim"], W - 2 * s["trim"]
            tex = p.get("tex", 0)
            fits = (p["_gl"] <= L2 and p["_gw"] <= W2) if tex else (max(p["_gl"], p["_gw"]) <= L2 and min(p["_gl"], p["_gw"]) <= W2)
            if not fits:
                big.append("%s: %s x %s вдоль текстуры, лист %sx%s (%s) минус обпил %s"
                           % (where(p), fmt(p["_gl"]), fmt(p["_gw"]), L, W, src, s["trim"]))
            if src == "по умолчанию":
                dflt.add(disp(p.get("mat")))
        if big:
            self.add("S01", ERROR, "Деталь не выходит из листа", big,
                     "Разбить деталь, повернуть (только однотонный декор) или взять лист другого формата.")
        if dflt:
            self.add("S02", INFO, "Формат листа взят по умолчанию %sx%s: в названии материала размера нет"
                     % tuple(sorted(s["default"], reverse=True)), sorted(dflt),
                     "Если плита другого формата (Lamarty, Kronospan 2750x1830), задать sheet.by_material в правилах.")
        inv = []
        for (mat, t), ps in sorted(groups.items(), key=lambda kv: -len(kv[1])):
            L, W, _ = self.sheet_of(mat)
            area = sum(p["_gl"] * p["_gw"] for p in ps) / 1e6
            sheets = area / (L * W / 1e6 * s["yield"])
            inv.append("%s | %s мм | %s дет. | %.2f м2 | листов около %s%s"
                       % (disp(mat), fmt(t), len(ps), area, max(1, int(sheets + 0.999)),
                          "" if article(mat) else " | без артикула"))
        self.add("S03", INFO, "Материалы под распил", inv)
        total = len(self.cut)
        by_t = defaultdict(list)
        for (mat, t), ps in groups.items():
            by_t[t].append((mat, len(ps)))
        foreign = []
        for t, lst in by_t.items():
            if len(lst) < 2:
                continue
            top = max(n for _, n in lst)
            for mat, n in lst:
                if n < top and n <= mc["foreign_max_panels"] and n / total < mc["foreign_share"]:
                    foreign.append("%s %s мм: %s дет. (%s)" % (disp(mat), fmt(t), n,
                                   ", ".join(disp(p["name"]) for p in groups[(mat, t)])))
        if foreign:
            self.add("S04", WARN, "Редкий материал той же толщины: возможно, чужой декор от вставленного фрагмента", foreign,
                     "Перекрасить в материал заказа или подтвердить, что так задумано.")
        thick = []
        for p in self.cut:
            nums = [float(x.replace(",", ".")) for x in re.findall(r"(\d{1,2}(?:[.,]\d)?)\s*мм", (p.get("mat") or "").lower())]
            if nums and all(abs(n - p["t"]) > 0.05 for n in nums):
                thick.append("%s: толщина детали %s, в названии материала %s" % (where(p), fmt(p["t"]), ", ".join(fmt(n) for n in nums)))
        if thick:
            self.add("S05", WARN, "Толщина детали не совпадает с толщиной в названии материала", thick,
                     "Сменить материал или толщину: в раскрое деталь уйдёт не на тот лист.")
        # текстура
        mixed, facade_axes = [], defaultdict(lambda: defaultdict(list))
        for (mat, t), ps in groups.items():
            texs = set(1 if p.get("tex", 0) else 0 for p in ps)
            if len(texs) > 1:
                mixed.append("%s %s мм: без текстуры %s" % (disp(mat), fmt(t), ", ".join(disp(p["name"]) for p in ps if not p.get("tex", 0))))
        for p in self.cut:
            if p.get("role") == "facade" and p.get("tex", 0) and not p["_rot"]:
                axes = [i for i in range(3) if i != p["_tax"]]
                hit = [i for i in axes if abs(p["_ext"][i] - p["_gl"]) < 1]
                if len(hit) == 1:
                    facade_axes[p.get("mat", "")]["XYZ"[hit[0]]].append(disp(p["name"]))
        if mixed:
            self.add("S06", WARN, "У части деталей одного материала текстура выключена", mixed,
                     "Для древесного декора задать направление: без него раскрой повернёт деталь как удобно.")
        for mat, axes in facade_axes.items():
            if len(axes) > 1:
                self.add("S07", WARN, "Рисунок на фасадах из «%s» идёт в разные стороны" % disp(mat),
                         ["вдоль %s: %s" % (ax, ", ".join(sorted(set(names)))) for ax, names in sorted(axes.items())],
                         "Привести к одному направлению, если это не задумка.")

    # ---------- кромка ----------
    def check_edges(self):
        ec, mc = self.cfg["edges"], self.cfg["materials"]
        if self.unchecked("E00", "Кромка", ["contour", "butts", "contour element"]):
            return
        no_edge = re.compile(mc["no_edge_re"], re.I)
        allowed = re.compile(mc["no_edge_allowed_re"], re.I)
        roles = set(ec["front_edge_roles"])
        front, visible, on_hdf, noclip, unknown = [], [], [], [], 0
        thick = defaultdict(int)
        totals = defaultdict(float)
        small = []
        mn = self.cfg["parts"]["min_edged"]
        for p in self.cut:
            mat = p.get("mat", "")
            edges = p.get("edges", [])
            banded = [e for e in edges if e.get("butt")]
            for e in banded:
                b = e["butt"]
                totals[(disp(b["mat"]), b["t"])] += e.get("len", 0)
                thick[b["t"]] += 1
                if b.get("clip") is False:
                    noclip.append("%s, торец %s" % (where(p), e["i"]))
            if banded and no_edge.search(mat):
                on_hdf.append("%s (%s)" % (where(p), disp(mat)))
            if banded and (max(p["_gl"], p["_gw"]) < max(mn) or min(p["_gl"], p["_gw"]) < min(mn)):
                small.append("%s: %s x %s" % (where(p), fmt(p["_gl"]), fmt(p["_gw"])))
            if allowed.search(mat) or p["_rot"]:
                continue
            for e in edges:
                if e.get("butt") or "a" not in e:
                    continue
                if self._on_hidden_face(p, e):
                    continue
                if e.get("visible") is None:
                    unknown += 1
                is_front = False
                if p.get("role") in roles:
                    if p["_tax"] == 2:
                        is_front = p.get("role") == "facade"
                    else:
                        is_front = abs(e["a"][2] - p["max"][2]) < 0.6 and abs(e["b"][2] - p["max"][2]) < 0.6
                if is_front and self._edge_covered(p, e):
                    is_front = False
                line = "%s, торец %s (%s -> %s), длина %s" % (disp(p["name"]), e["i"], "/".join(fmt(v) for v in e["a"]),
                                                          "/".join(fmt(v) for v in e["b"]), fmt(e.get("len", 0)))
                if is_front:
                    front.append(line)
                elif e.get("visible"):
                    visible.append(line)
        if front:
            self.add("E01", ERROR, "Лицевой торец без кромки", front,
                     "Накатать кромку (BZ.addButt с ClipPanel = true). Торец за дверью тоже виден, когда дверь открыта.")
        if visible:
            self.add("E02", WARN, "Открытый торец без кромки", visible,
                     "Торец не закрыт другой деталью. Закромить, если он виден в собранном изделии.")
        if unknown:
            self.add("E03", UNCHECKED, "Видимость %s торцов Базис не вернул (IsButtVisible)" % unknown,
                     fix="Проверить кромку этих деталей вручную.")
        if on_hdf:
            self.add("E04", WARN, "Кромка на материале, который не кромят", on_hdf, "Удалить кромку.")
        if noclip:
            self.add("E05", WARN, "Кромка без подрезки панели: деталь станет больше на толщину кромки", noclip,
                     "Поставить ClipPanel = true или учесть припуск.")
        if small:
            self.add("E06", WARN, "Деталь с кромкой меньше %s x %s: станок цеха не возьмёт" % tuple(mn), small,
                     "Отправить деталь шире и дорезать на месте со стороны без кромки, либо уточнить у цеха.")
        odd = sorted(t for t in thick if not any(abs(t - s) < 0.01 for s in ec["shop_thickness"]))
        if odd:
            self.add("E07", WARN, "Толщина кромки, которой нет у цеха: %s мм" % ", ".join(fmt(t) for t in odd),
                     ["у цеха: %s" % ", ".join(fmt(s) for s in ec["shop_thickness"])],
                     "Цех подставит ближайшую, размеры деталей изменятся на разницу. Согласовать до заказа.")
        if totals:
            self.add("E08", INFO, "Кромка, с запасом %d%%" % round(ec["reserve"] * 100),
                     ["%s %s мм: %.1f м" % (m, fmt(t), ln / 1000 * (1 + ec["reserve"])) for (m, t), ln in sorted(totals.items())])

    def _on_hidden_face(self, p, e):
        """Торец лежит на стороне изделия, которая не видна (пол, стена, потолок)."""
        for face in self.hidden_faces:
            ax, side = FACES[face]
            if ax == p["_tax"]:      # контур лежит в плоскости пласти: это не торец на той стороне
                continue
            co = self.bounds["max"][ax] if side else self.bounds["min"][ax]
            if abs(e["a"][ax] - co) < 0.6 and abs(e["b"][ax] - co) < 0.6:
                return True
        return False

    def _edge_covered(self, p, e):
        """Лицевой торец закрыт деталью, которая приставлена к нему вплотную."""
        mid = [(e["a"][i] + e["b"][i]) / 2 for i in range(3)]
        for q in self.cut:
            if q is p:
                continue
            if -0.6 <= q["min"][2] - mid[2] <= 1.0 and all(q["min"][i] - 0.6 <= mid[i] <= q["max"][i] + 0.6 for i in (0, 1)):
                return True
        return False

    # ---------- присадка ----------
    def check_holes(self):
        hc = self.cfg["holes"]
        if self.unchecked("H00", "Присадка", ["holes"]):
            return
        if not self.holes:
            self.add("H01", WARN, "В модели нет ни одного отверстия присадки",
                     fix="Крепёж и фурнитура не установлены или стоят без присадки: цеху нечего сверлить.")
            return
        lost, marks, odd, near, edge, dup, vis = [], defaultdict(int), defaultdict(int), [], [], [], defaultdict(int)
        inv = defaultdict(int)
        seen = defaultdict(list)
        unit_name = lambda h: disp(self.units[h["unit"]]["name"]) if h.get("unit") in self.units else "?"
        for h in self.holes:
            p = h.get("panel")
            if p is None:
                lost.append("%s: d%s x %s в точке %s" % (unit_name(h), fmt(h["d"]), fmt(h["depth"]), "/".join(fmt(v) for v in h["p"])))
                continue
            kind = "сквозное" if h["through"] else ("пласть" if h["face"] else "торец")
            key = "d%s x %s, %s" % (fmt(h["d"]), fmt(h["depth"]), kind)
            inv[key] += 1
            d, dp = h["d"], h["depth"]
            if d <= hc["self_tapping_max_d"] or dp < hc["mark_depth_below"]:
                marks[key + " | " + unit_name(h)] += 1
            elif h["through"]:
                lo, hi = hc["through_diameter"]
                if not (lo <= d <= hi or d in hc["through_extra_diameters"]):
                    odd[key + " | " + unit_name(h)] += 1
            elif h["face"]:
                (dlo, dhi), (plo, phi) = hc["blind_diameter"], hc["blind_depth"]
                if not (dlo <= d <= dhi and plo <= dp <= phi):
                    odd[key + " | " + unit_name(h)] += 1
            elif not any(abs(d - ed) < 0.3 and dp <= emax + 0.5 for ed, emax in hc["end_holes"]):
                odd[key + " | " + unit_name(h)] += 1
            if h["face"]:
                if not h["through"] and p["t"] - dp < hc["near_through"]:
                    near.append("%s: d%s x %s при толщине %s (%s)" % (where(p), fmt(d), fmt(dp), fmt(p["t"]), unit_name(h)))
                for ax in range(3):
                    if ax == h["axis"]:
                        continue
                    dist = min(h["p"][ax] - p["min"][ax], p["max"][ax] - h["p"][ax])
                    if dist < d / 2 + hc["edge_clearance"]:
                        edge.append("%s: d%s в %s мм от края (%s)" % (where(p), fmt(d), fmt(dist), unit_name(h)))
                        break
                if d >= hc["visible_min_d"] and self.bounds:
                    co = p["max"][h["axis"]] if h["side"] else p["min"][h["axis"]]
                    for face, (ax, side) in FACES.items():
                        outer = self.bounds["max"][ax] if side else self.bounds["min"][ax]
                        if ax == h["axis"] and side == h["side"] and abs(co - outer) < 1 and face not in self.hidden_faces:
                            vis["%s сторона изделия, %s: %s" % (FACE_RU[face], disp(p["name"]), key)] += 1
            for q in seen[p["id"]]:
                if abs(q["d"] - d) < 0.3 and all(abs(q["p"][i] - h["p"][i]) <= hc["duplicate_tol"] for i in range(3)):
                    dup.append("%s: d%s в точке %s (%s и %s)" % (disp(p["name"]), fmt(d), "/".join(fmt(v) for v in h["p"]),
                                                             unit_name(q), unit_name(h)))
                    break
            seen[p["id"]].append(h)
        cnt = lambda dct: ["%s: %s шт" % (k, v) for k, v in sorted(dct.items())]
        self.add("H02", INFO, "Присадка: %s отверстий" % len(self.holes), cnt(inv))
        if lost:
            self.add("H03", ERROR, "Отверстие не попадает ни в одну деталь: фурнитура стоит мимо или висит в воздухе", lost,
                     "Переставить фурнитуру. Частая причина: петли или ручки поставлены при открытой анимации дверей.")
        if dup:
            self.add("H04", WARN, "Два отверстия в одной точке: дубль крепежа", dup, "Удалить лишний крепёж.")
        if near:
            self.add("H05", WARN, "Глухое отверстие почти насквозь", near,
                     "Остаётся меньше %s мм: сверло выйдет на лицо. Уменьшить глубину или сделать сквозным осознанно." % fmt(hc["near_through"]))
        if edge:
            self.add("H06", WARN, "Отверстие слишком близко к краю детали", edge, "Сдвинуть: край выкрошится.")
        if odd:
            self.add("H07", WARN, "Отверстия вне возможностей станка цеха", cnt(odd),
                     "Глухие: d%s..%s глубиной %s..%s. Сквозные: d%s..%s. Торцевые: %s. Уточнить у цеха или сменить крепёж."
                     % (hc["blind_diameter"][0], hc["blind_diameter"][1], hc["blind_depth"][0], hc["blind_depth"][1],
                        hc["through_diameter"][0], hc["through_diameter"][1],
                        ", ".join("%sx%s" % (fmt(a), fmt(b)) for a, b in hc["end_holes"])))
        if marks:
            self.add("H08", WARN, "Метки под саморез (d до %s или глубина меньше %s): станок их не сверлит"
                     % (fmt(hc["self_tapping_max_d"]), hc["mark_depth_below"]), cnt(marks),
                     "Это разметка на месте. Для петель и планок под ЧПУ сменить на евровинт d5x13.")
        if vis:
            self.add("H09", WARN, "Отверстия на наружных сторонах изделия", cnt(vis),
                     "Головка крепежа будет видна. Если сторона стоит к стене или соседнему корпусу, передать --hidden. "
                     "Иначе заменить конфирмат на эксцентрик со шкантом.")

    # ---------- стыки и крепёж ----------
    def check_joints(self):
        jc = self.cfg["joints"]
        if self.d.get("fastened") is None:
            self.add("J00", UNCHECKED, "Крепёж в стыках: Базис не вернул связи (FindConnectedFasteners)",
                     fix="Проверить глазами, что каждый стык скреплён.")
            return
        linked = defaultdict(int)
        for f in self.d["fastened"]:
            for a, b in combinations(sorted(set(f.get("panels", []))), 2):
                linked[(a, b)] += 1
        skip_mat = re.compile(jc["skip_material_re"], re.I)
        skip_roles = set(jc["skip_roles"])
        none, few = [], []
        for a, b in combinations(self.cut, 2):
            if a.get("role") in skip_roles or b.get("role") in skip_roles:
                continue
            if skip_mat.search(a.get("mat", "")) or skip_mat.search(b.get("mat", "")) or a["_rot"] or b["_rot"]:
                continue
            ov = overlap(a, b)
            touch = [i for i in range(3) if abs(ov[i]) <= 0.5]
            if len(touch) != 1:
                continue
            rest = [ov[i] for i in range(3) if i != touch[0]]
            if min(rest) < 3 or max(rest) < jc["min_len"] or min(rest) > 60:
                continue
            n = linked.get(tuple(sorted((a["id"], b["id"]))), 0)
            name = "%s и %s, стык %s мм" % (disp(a["name"]), disp(b["name"]), fmt(max(rest)))
            if n == 0:
                none.append(name)
            else:
                need = next(c for lim, c in jc["count_by_len"] if max(rest) <= lim)
                if n < need:
                    few.append("%s: крепежа %s, по длине нужно %s" % (name, n, need))
        if none:
            self.add("J01", WARN, "Стык без крепежа", none,
                     "Поставить крепёж: в невидимых стыках евровинт, на видимой пласти эксцентрик со шкантом. "
                     "Съёмные полки ставятся на полкодержатели.")
        if few:
            self.add("J02", WARN, "В стыке меньше крепежа, чем нужно по длине", few,
                     "Норма: до 60 мм 1, до 550 2, до 1000 3, длиннее 4.")

    # ---------- фурнитура ----------
    def check_hardware(self):
        hw = self.cfg["hardware"]
        if self.unchecked("F00", "Фурнитура", ["box", "anim"]):
            return
        hinge_re, slide_re = re.compile(hw["hinge_re"], re.I), re.compile(hw["slide_re"], re.I)
        handle_re, art_re = re.compile(hw["handle_re"], re.I), re.compile(hw["article_re"])
        # столкновения фурнитуры с деталями
        hard, soft = [], []
        for u in self.units.values():
            drilled = set(h["panel"]["id"] for h in u["holes"])
            for part in u["parts"]:
                for p in self.cut:
                    if p["id"] in drilled or p["_rot"]:
                        continue
                    ov = overlap(part, p)
                    if all(v > hw["clash_depth"] for v in ov):
                        line = "%s (%s) входит в %s на %s мм" % (disp(u["name"]), disp(part["name"]), where(p),
                                                                 " x ".join(fmt(v) for v in ov))
                        (soft if (p.get("cuts") or not u["holes"]) else hard).append(line)
        if hard:
            self.add("F01", ERROR, "Фурнитура упирается в деталь", sorted(set(hard)),
                     "Передвинуть деталь или фурнитуру. За распашной дверью у боковины с петлями держать "
                     "наполнение не ближе 90 мм от лица двери.")
        if soft:
            self.add("F02", WARN, "Фурнитура без присадки пересекает деталь (или деталь с пазом)", sorted(set(soft)),
                     "Профиль в пазу допустим. Остальное проверить глазами.")
        outside = []
        if self.bounds:
            for u in self.units.values():
                if handle_re.search(u["text"]):
                    continue
                out = max(max(self.bounds["min"][i] - u["min"][i], u["max"][i] - self.bounds["max"][i]) for i in range(3))
                if out > hw["outside_tol"]:
                    outside.append("%s: на %s мм за габаритом деталей" % (where(u), fmt(out)))
        if outside:
            self.add("F03", WARN, "Фурнитура далеко за габаритом изделия", outside,
                     "Так встают петли и ручки, поставленные при открытой анимации дверей. Переставить при закрытых.")
        noart = sorted(set(disp(u["name"]) for u in self.units.values() if not art_re.search(u["name"])))
        if noart:
            self.add("F04", WARN, "Фурнитура без артикула в имени", noart,
                     "В имени блока указать артикул позиции, которую покупаем (и чья 3D-модель, если это аналог).")
        # двери
        doors = [b for b in self.blocks.values() if b.get("anim") in SWING or b.get("anim") in ("SDoorLeft", "SDoorRight")
                 or (b.get("kindStrict") == "door")]
        hinges = [u for u in self.units.values() if hinge_re.search(u["text"])]
        no_h, few_h, pos_h = [], [], []
        lo, hi = hw["hinge_edge_distance"]
        for b in doors:
            ps = [p for p in self.cut if b["id"] in p.get("anc", []) and not p["_rot"]]
            box = union_box(ps)
            if not box or b.get("anim") not in SWING:
                continue
            grown = {"min": [v - 3 for v in box["min"]], "max": [v + 3 for v in box["max"]]}
            mine = [u for u in hinges if all(v > 0 for v in overlap(u, grown))]
            e = ext(box)
            vertical = b.get("anim") in ("DoorLeft", "DoorRight")
            length, width = (e[1], e[0]) if vertical else (e[0], e[1])
            need = next(c for lim, c in hw["hinge_count_by_height"] if length <= lim)
            if vertical and width > self.cfg["geometry"]["door_max_width"]:
                need += 1
            label = "%s %s x %s" % (disp(b["name"]), fmt(e[0]), fmt(e[1]))
            if not mine:
                no_h.append(label)
                continue
            if len(mine) < need:
                few_h.append("%s: петель %s, нужно %s" % (label, len(mine), need))
            if vertical:
                ys = sorted((u["min"][1] + u["max"][1]) / 2 for u in mine)
                for dist, side in ((ys[0] - box["min"][1], "низа"), (box["max"][1] - ys[-1], "верха")):
                    if not (lo <= dist <= hi):
                        pos_h.append("%s: крайняя петля в %s мм от %s" % (label, fmt(dist), side))
        if no_h:
            self.add("F05", ERROR, "Дверь без петель", no_h,
                     "Поставить петли из библиотеки. Если петли названы иначе, дописать имя в hardware.hinge_re.")
        if few_h:
            self.add("F06", WARN, "Петель меньше, чем нужно по высоте и ширине двери", few_h,
                     "Норма по высоте: до 900 2, до 1600 3, до 2000 4, до 2400 5. Дверь шире 600: плюс одна.")
        if pos_h:
            self.add("F07", WARN, "Крайняя петля вне %s..%s мм от края двери" % (lo, hi), pos_h, "Сдвинуть петлю.")
        # ящики
        drawers = [b for b in self.blocks.values() if b.get("anim") == "Box" or b.get("kind") == "drawer"]
        top_drawers = [b for b in drawers if not any(a in [d["id"] for d in drawers] for a in b.get("anc", []))]
        slides = [u for u in self.units.values() if slide_re.search(u["text"])]
        no_s = []
        for b in top_drawers:
            if "min" not in b:
                continue
            grown = {"min": [v - 20 for v in b["min"]], "max": [v + 20 for v in b["max"]]}
            if not any(all(v > 0 for v in overlap(u, grown)) for u in slides):
                no_s.append(where(b))
        if no_s:
            self.add("F08", WARN, "Ящик без направляющих", no_s,
                     "Поставить направляющие из библиотеки. Если они названы иначе, дописать имя в hardware.slide_re.")
        # анимация
        no_anim = [where(b) for b in self.blocks.values() if b.get("kind") in ("door", "drawer") and not b.get("fastener")
                   and b.get("anim") in (None, "None", "Custom") and not any(
                       self.blocks.get(a, {}).get("anim") in SWING + ("Box", "SDoorLeft", "SDoorRight") for a in b.get("anc", []))]
        loose = [where(p) for p in self.cut if p.get("role") == "facade" and not p["_door"] and not p["_drawer"]]
        zero = [where(b) for b in doors if b.get("anim") in SWING and not b.get("angle")]
        if no_anim:
            self.add("A01", WARN, "Блок двери или ящика без анимации", no_anim, "Задать AnimType и DoorAngle (рецепт «Анимация дверей и ящиков»).")
        if loose:
            self.add("A02", WARN, "Фасад не в блоке двери или ящика", loose,
                     "Каждую дверь и ящик оформить своим блоком с анимацией.")
        if zero:
            self.add("A03", WARN, "У двери угол открывания 0", zero, "Задать DoorAngle по углу петли (обычно 110).")
        inv = defaultdict(int)
        for u in self.units.values():
            inv[disp(u["name"]) + (" | " + article(u["name"]) if article(u["name"]) else "")] += 1
        if inv:
            self.add("F09", INFO, "Фурнитура и крепёж: %s единиц" % sum(inv.values()),
                     ["%s: %s шт" % kv for kv in sorted(inv.items())])
        else:
            self.add("F09", WARN, "В модели нет фурнитуры и крепежа", fix="Корпус нечем собрать: поставить крепёж.")

    # ---------- позиции ----------
    def check_positions(self):
        if self.unchecked("P00", "Позиции", ["art"]):
            return
        without = [p for p in self.cut if not p.get("art")]
        if without:
            self.add("P01", WARN, "Позиции не расставлены у %s из %s деталей" % (len(without), len(self.cut)),
                     [where(p) for p in without], "Выполнить Action.ArrangePositions(0, Model) перед чертежами.")
        by_art = defaultdict(dict)
        for p in self.cut:
            if p.get("art"):
                by_art[p["art"]][(disp(p.get("mat")), p["t"], round(p["_gl"], 1), round(p["_gw"], 1))] = disp(p["name"])
        clash = ["поз. %s: %s" % (a, "; ".join("%s %sx%s" % (n, fmt(k[2]), fmt(k[3])) for k, n in sorted(v.items())))
                 for a, v in sorted(by_art.items()) if len(v) > 1]
        if clash:
            self.add("P02", ERROR, "Одна позиция у разных деталей", clash,
                     "Расставить позиции заново: Action.ArrangePositions(0, Model).")

    def run(self):
        self.check_model()
        if self.cut:
            for fn in (self.check_geometry, self.check_materials, self.check_edges, self.check_holes,
                       self.check_joints, self.check_hardware, self.check_positions):
                try:
                    fn()
                except Exception as e:  # правило упало: это невыполненная проверка, а не чистый результат
                    self.add("X-" + fn.__name__, UNCHECKED, "Правило %s упало: %r" % (fn.__name__, e),
                             fix="Сообщить об ошибке в правилах, проверить этот раздел вручную.")
        return self.f

    # ---------- раскрой и фурнитура ----------
    def cutlist(self):
        groups, order = {}, []
        for p in self.cut:
            sides = {"L": [], "W": []}
            other = 0
            for e in p.get("edges", []):
                if not e.get("butt"):
                    continue
                ln = e.get("len", 0)
                if e.get("line", True) and abs(ln - p["_gl"]) <= abs(ln - p["_gw"]) and abs(ln - p["_gl"]) < 3:
                    sides["L"].append(e["butt"]["t"])
                elif e.get("line", True) and abs(ln - p["_gw"]) < 3:
                    sides["W"].append(e["butt"]["t"])
                else:
                    other += 1
            sig = (tuple(sorted(sides["L"])), tuple(sorted(sides["W"])), other)
            key = (disp(p["name"]), p.get("mat", ""), p["t"], round(p["_gl"], 1), round(p["_gw"], 1), p.get("tex", 0),
                   sig, len(p.get("cuts", [])), bool(p.get("rect", True)), p.get("art", ""))
            if key not in groups:
                groups[key] = 0
                order.append(key)
            groups[key] += 1
        rows = [["№", "Позиция", "Деталь", "Кол-во", "Длина вдоль текстуры", "Ширина", "Толщина", "Материал", "Артикул",
                 "Текстура", "Кромка длина 1", "Кромка длина 2", "Кромка ширина 1", "Кромка ширина 2", "Кромка прочие торцы",
                 "Пазов", "Фигурная", "Поворот разрешён"]]
        order.sort(key=lambda k: (k[1], -k[3], -k[4], k[0]))
        for i, k in enumerate(order, 1):
            name, mat, t, gl, gw, tex, (sl, sw, other), cuts, rect, art = k
            cell = lambda lst, j: fmt(lst[j]) if len(lst) > j else ""
            rows.append([i, art, name, groups[k], fmt(gl), fmt(gw), fmt(t), disp(mat), article(mat),
                         {0: "нет", 1: "вдоль длины", 2: "вдоль длины"}.get(tex, str(tex)),
                         cell(sl, 0), cell(sl, 1), cell(sw, 0), cell(sw, 1), other or "", cuts or "",
                         "" if rect else "да", "да" if not tex else "нет"])
        return rows

    def hardware(self):
        inv = defaultdict(int)
        for u in self.units.values():
            inv[(disp(u["name"]), article(u["name"]))] += 1
        rows = [["Позиция", "Артикул", "Кол-во"]]
        rows += [[n, a, c] for (n, a), c in sorted(inv.items())]
        return rows


def write_csv(path, rows):
    buf = io.StringIO()
    csv.writer(buf, delimiter=";", lineterminator="\r\n").writerows(rows)
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        fh.write(buf.getvalue())


def verdict(findings):
    n = {s: sum(1 for f in findings if f.sev == s) for s in (ERROR, UNCHECKED, WARN, INFO)}
    ready = n[ERROR] == 0 and n[UNCHECKED] == 0
    return ready, n


def report_md(rv, findings, limit):
    ready, n = verdict(findings)
    m = rv.d.get("model", {})
    title = "Финальная проверка перед распилом" if rv.mode == "handoff" else "Ревью модели"
    out = ["# %s" % title, "",
           "Модель: `%s`" % (m.get("file") or "не сохранена"),
           "Собрано: %s. Деталей под распил %s, блоков %s, единиц фурнитуры %s, отверстий %s."
           % (rv.d.get("collectedAt", "?"), len(rv.cut), len(rv.blocks), len(rv.units), len(rv.holes)), ""]
    if ready and n[WARN] == 0:
        out.append("**Вердикт: ГОТОВО.** Автоматические проверки чистые. Остался ручной список в конце.")
    elif ready:
        out.append("**Вердикт: ГОТОВО С ЗАМЕЧАНИЯМИ.** Блокеров нет, замечаний %s: каждое просмотреть и принять решение." % n[WARN])
    else:
        out.append("**Вердикт: НЕ ГОТОВО.** Блокеров %s, невыполненных проверок %s, замечаний %s."
                   % (n[ERROR], n[UNCHECKED], n[WARN]))
    for sev in (ERROR, UNCHECKED, WARN, INFO):
        fs = [f for f in findings if f.sev == sev]
        if not fs:
            continue
        out += ["", "## %s (%s)" % (SEV_TITLE[sev], len(fs))]
        for f in fs:
            out += ["", "### %s. %s" % (f.id, f.title)]
            if f.fix:
                out.append("Что делать: %s" % f.fix)
            for it in f.items[:limit]:
                out.append("- %s" % it)
            if len(f.items) > limit:
                out.append("- ... и ещё %s, полный список в review_report.json" % (len(f.items) - limit))
    out += ["", "## Что скрипт не проверяет: пройти вручную"]
    out += ["- [ ] %s" % s for s in MANUAL]
    out += ["", "Файлы рядом: `cutlist.csv` (детали под распил, длина вдоль текстуры, кромка по сторонам), "
            "`hardware.csv` (фурнитура и крепёж), `review_report.json` (все находки полностью)."]
    return "\n".join(out) + "\n"


def parse_dims(s):
    nums = [float(x.replace(",", ".")) for x in re.split(r"[xXхХ×*\s]+", s.strip()) if x]
    if len(nums) != 3:
        raise argparse.ArgumentTypeError("нужно три размера, например 1210x610x3012")
    return nums


def main(argv=None):
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description="Проверка модели БАЗИС-Мебельщика по данным сборщика")
    ap.add_argument("data", help="review_data.json от cmd_review_collect.js")
    ap.add_argument("--out", default=None, help="папка для отчёта, по умолчанию рядом с data")
    ap.add_argument("--mode", choices=["review", "handoff"], default="review")
    ap.add_argument("--rules", default=os.path.join(here, "review_rules.json"))
    ap.add_argument("--expect", type=parse_dims, default=None, help="заданные габариты, три числа в любом порядке")
    ap.add_argument("--hidden", default=None, help="невидимые стороны изделия через запятую: left,right,top,bottom,front,back")
    ap.add_argument("--limit", type=int, default=None, help="сколько строк на находку печатать в отчёте")
    a = ap.parse_args(argv)
    try:
        with open(a.data, encoding="utf-8-sig") as fh:
            data = json.load(fh)
        with open(a.rules, encoding="utf-8-sig") as fh:
            cfg = json.load(fh)
    except (OSError, ValueError) as e:
        print("ОШИБКА: не читается входной файл: %s" % e)
        return 2
    hidden = None
    if a.hidden is not None:
        hidden = [s.strip() for s in a.hidden.split(",") if s.strip()]
        bad = [s for s in hidden if s not in FACES]
        if bad:
            print("ОШИБКА: неизвестные стороны в --hidden: %s. Допустимы: %s" % (", ".join(bad), ", ".join(FACES)))
            return 2
    rv = Review(data, cfg, a.mode, a.expect, hidden)
    findings = rv.run()
    out = a.out or os.path.dirname(os.path.abspath(a.data))
    os.makedirs(out, exist_ok=True)
    limit = a.limit or cfg["parts"]["max_names_per_finding"]
    ready, n = verdict(findings)
    with open(os.path.join(out, "review_report.md"), "w", encoding="utf-8") as fh:
        fh.write(report_md(rv, findings, limit))
    with open(os.path.join(out, "review_report.json"), "w", encoding="utf-8") as fh:
        json.dump({"ready": ready, "mode": a.mode, "counts": n, "model": data.get("model"), "collectedAt": data.get("collectedAt"),
                   "findings": [f.as_dict() for f in findings], "manual": MANUAL}, fh, ensure_ascii=False, indent=1)
    write_csv(os.path.join(out, "cutlist.csv"), rv.cutlist())
    write_csv(os.path.join(out, "hardware.csv"), rv.hardware())
    print("VERDICT=%s" % ("READY" if ready else "NOT_READY"))
    print("ВЕРДИКТ: %s | блокеров %s, не проверено %s, замечаний %s, сведений %s"
          % ("ГОТОВО" if ready else "НЕ ГОТОВО", n[ERROR], n[UNCHECKED], n[WARN], n[INFO]))
    for f in findings:
        if f.sev in (ERROR, UNCHECKED, WARN):
            print("  [%s] %s. %s%s" % ({ERROR: "БЛОКЕР", UNCHECKED: "НЕ ПРОВЕРЕНО", WARN: "проверить"}[f.sev], f.id, f.title,
                                       " (%s)" % len(f.items) if f.items else ""))
    print("Отчёт: %s" % os.path.join(out, "review_report.md"))
    return 0 if ready else 1


if __name__ == "__main__":
    sys.exit(main())
