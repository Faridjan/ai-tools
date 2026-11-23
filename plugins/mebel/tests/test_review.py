# -*- coding: utf-8 -*-
"""
Тесты движка правил review.py на эталонном шкафе из макета Базиса.
Эталон чистый. Каждый тест ломает одну вещь и ждёт свою находку.
Запуск: py -3 -m unittest discover -s plugins/mebel/tests
"""
import copy
import json
import os
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.join(HERE, "..", "skills", "model-review", "scripts")
sys.path.insert(0, SCRIPTS)
import review as rv  # noqa: E402

with open(os.path.join(HERE, "fixtures", "review_data.json"), encoding="utf-8") as fh:
    BASE = json.load(fh)
with open(os.path.join(SCRIPTS, "review_rules.json"), encoding="utf-8") as fh:
    RULES = json.load(fh)
ALL_HIDDEN = ["left", "right", "top", "back", "bottom"]


def run(data, mode="review", hidden=ALL_HIDDEN, expect=None, cfg=None):
    r = rv.Review(copy.deepcopy(data), copy.deepcopy(cfg or RULES), mode, expect, hidden)
    fs = r.run()
    return {f.id: f for f in fs}, rv.verdict(fs)[0], r


def data():
    return copy.deepcopy(BASE)


def panel(d, name, nth=0):
    return [p for p in d["panels"] if p["name"].split("\r")[0] == name][nth]


def move(p, dx=0, dy=0, dz=0):
    for k in ("min", "max"):
        p[k] = [p[k][0] + dx, p[k][1] + dy, p[k][2] + dz]


class Baseline(unittest.TestCase):
    def test_clean(self):
        f, ready, _ = run(data(), expect=[800, 2000, 521])
        bad = [x.id for x in f.values() if x.sev != rv.INFO]
        self.assertEqual(bad, [])
        self.assertTrue(ready)

    def test_expect_any_order(self):
        f, ready, _ = run(data(), expect=[521, 800, 2000])
        self.assertEqual(f["M04"].sev, rv.INFO)

    def test_expect_mismatch_blocks(self):
        f, ready, _ = run(data(), expect=[800, 2000, 500])
        self.assertEqual(f["M04"].sev, rv.ERROR)
        self.assertFalse(ready)

    def test_default_hidden_faces_report_visible_sides(self):
        f, _, _ = run(data(), hidden=None)
        self.assertIn("H09", f)            # головки конфирматов на боковинах
        self.assertIn("E02", f)            # верхние торцы боковин открыты
        self.assertTrue(any("левая" in s for s in f["H09"].items))


class Geometry(unittest.TestCase):
    def test_overlap(self):
        d = data(); move(panel(d, "Полка"), dx=-8)
        f, ready, _ = run(d)
        self.assertIn("G01", f); self.assertFalse(ready)

    def test_open_door_is_blocker(self):
        d = data(); p = panel(d, "Дверь")
        p["max"][2] = p["min"][2] + 300      # дверь повернулась: габарит по Z стал 300
        f, ready, _ = run(d)
        self.assertIn("G02", f); self.assertFalse(ready)

    def test_sliver_gap(self):
        d = data(); p = panel(d, "Полка"); p["min"][0] += 0.3
        f, _, _ = run(d)
        self.assertIn("G05", f)

    def test_facade_gap(self):
        d = data(); move(panel(d, "Дверь", 1), dx=-3.5)
        f, _, _ = run(d)
        self.assertIn("G06", f)

    def test_facade_gaps_must_be_equal(self):
        d = data(); a = copy.deepcopy(panel(d, "Дверь", 1))
        a.update(id="uD3", min=[800.0, a["min"][1], a["min"][2]], max=[1198.0, a["max"][1], a["max"][2]])
        d["panels"].append(a)                      # третья дверь в 2 мм от второй, первые две в 4 мм
        f, _, _ = run(d)
        self.assertIn("G09", f)
        self.assertNotIn("G09", run(data())[0])

    def test_shelf_span(self):
        d = data(); p = panel(d, "Полка"); p["max"][0] = p["min"][0] + 1100
        f, _, _ = run(d)
        self.assertIn("G07", f)
        p["max"][0] = p["min"][0] + 850
        f, _, _ = run(d)
        self.assertIn("G08", f)


class Materials(unittest.TestCase):
    def test_sheet(self):
        d = data(); p = panel(d, "Боковина левая"); p["max"][1] = 3000; p["ch"] = 3000
        f, ready, _ = run(d)
        self.assertIn("S01", f); self.assertFalse(ready)

    def test_sheet_respects_grain(self):
        d = data(); p = panel(d, "Боковина левая")      # 2000 x 500: поперёк листа 2070 не лезет только с текстурой
        p["ch"], p["max"][1] = 2060, 2060
        p["tex"] = 1                                     # текстура вдоль cw (500): длина 2060 идёт поперёк листа, 2060 > 2050
        f, _, _ = run(d)
        self.assertIn("S01", f)
        p["tex"] = 2
        f, _, _ = run(d)
        self.assertNotIn("S01", f)

    def test_default_sheet_is_reported(self):
        d = data(); panel(d, "Полка")["mat"] = "ЛДСП Дуб"
        f, _, _ = run(d)
        self.assertIn("S02", f)

    def test_thickness_vs_name(self):
        d = data(); p = panel(d, "Полка"); p["t"] = 18; p["max"][1] = p["min"][1] + 18
        f, _, _ = run(d)
        self.assertIn("S05", f)

    def test_foreign_material(self):
        d = data(); panel(d, "Полка")["mat"] = "ЛДСП Серый 2800*2070*16 мм"
        cfg = copy.deepcopy(RULES); cfg["materials"]["foreign_share"] = 0.2
        f, _, _ = run(d, cfg=cfg)
        self.assertIn("S04", f)

    def test_mixed_texture(self):
        d = data(); panel(d, "Полка")["tex"] = 1
        f, _, _ = run(d)
        self.assertIn("S06", f)


class Edges(unittest.TestCase):
    def test_front_edge_missing(self):
        d = data(); p = panel(d, "Боковина левая")
        for e in p["edges"]:
            e.pop("butt", None)
        f, ready, _ = run(d)
        self.assertIn("E01", f); self.assertFalse(ready)

    def test_door_edge_missing(self):
        d = data(); panel(d, "Дверь")["edges"][0].pop("butt")
        f, _, _ = run(d)
        self.assertIn("E01", f)

    def test_edge_on_hdf(self):
        d = data(); p = panel(d, "Задняя стенка")
        p["edges"][0]["butt"] = {"mat": "ПВХ", "t": 1, "clip": True}
        f, _, _ = run(d)
        self.assertIn("E04", f)

    def test_no_clip_and_odd_thickness(self):
        d = data(); b = panel(d, "Полка")["edges"][2]["butt"]
        b["clip"] = False; b["t"] = 0.8
        f, _, _ = run(d)
        self.assertIn("E05", f); self.assertIn("E07", f)

    def test_visibility_unknown_is_unchecked(self):
        d = data(); panel(d, "Боковина левая")["edges"][2]["visible"] = None
        f, ready, _ = run(d, hidden=["back", "bottom"])
        self.assertEqual(f["E03"].sev, rv.UNCHECKED); self.assertFalse(ready)

    def test_small_edged_part(self):
        d = data(); p = panel(d, "Цоколь")
        p["edges"][0]["butt"] = {"mat": "ПВХ", "t": 1, "clip": True}
        p["ch"], p["max"][1] = 40, 40
        f, _, _ = run(d)
        self.assertIn("E06", f)


class Holes(unittest.TestCase):
    def test_lost_hole(self):
        d = data(); d["holes"][0]["p"] = [400, 500, 250]
        f, ready, _ = run(d)
        self.assertIn("H03", f); self.assertFalse(ready)

    def test_self_tapping(self):
        d = data(); h = [h for h in d["holes"] if h["d"] == 5 and h["depth"] == 13][0]; h["d"] = 2
        f, _, _ = run(d)
        self.assertIn("H08", f)

    def test_near_through(self):
        d = data(); h = [h for h in d["holes"] if h["depth"] == 10][0]; h["depth"] = 15
        f, _, _ = run(d)
        self.assertIn("H05", f); self.assertIn("H07", f)

    def test_duplicate(self):
        d = data(); d["holes"].append(copy.deepcopy([h for h in d["holes"] if h["depth"] == 10][0]))
        f, _, _ = run(d)
        self.assertIn("H04", f)

    def test_near_edge(self):
        d = data(); h = [h for h in d["holes"] if h["d"] == 35][0]; h["p"][0] -= 10
        f, _, _ = run(d)
        self.assertIn("H06", f)

    def test_no_holes_at_all(self):
        d = data(); d["holes"] = []
        f, _, _ = run(d)
        self.assertIn("H01", f)

    def test_collector_failure_is_unchecked(self):
        d = data(); d["collectErrors"] = [{"step": "holes", "count": 3, "error": "boom"}]
        f, ready, _ = run(d)
        self.assertEqual(f["H00"].sev, rv.UNCHECKED); self.assertIn("M03", f); self.assertFalse(ready)


class Joints(unittest.TestCase):
    def test_no_fastener(self):
        d = data(); side, shelf = panel(d, "Боковина левая")["id"], panel(d, "Полка")["id"]
        d["fastened"] = [f for f in d["fastened"] if not (side in f["panels"] and shelf in f["panels"])]
        f, _, _ = run(d)
        self.assertIn("J01", f)

    def test_too_few(self):
        d = data(); side, bottom = panel(d, "Боковина левая")["id"], panel(d, "Дно")["id"]
        keep, dropped = [], 0
        for x in d["fastened"]:
            if side in x["panels"] and bottom in x["panels"] and dropped < 2:
                dropped += 1
                continue
            keep.append(x)
        d["fastened"] = keep
        f, _, _ = run(d)
        self.assertIn("J02", f)

    def test_stacked_sides_are_not_a_joint(self):
        # боковина второго яруса стоит торцом на боковине первого: это не стык под крепёж
        d = data(); p = copy.deepcopy(panel(d, "Боковина левая"))
        p.update(id="uS2", name="Боковина антресоли", min=[0, 2000, 0], max=[16, 2600, 500], art="8", ch=600)
        d["panels"].append(p)
        self.assertNotIn("J01", run(d)[0])

    def test_shelf_on_two_supports_is_enough(self):
        d = data(); side, shelf = panel(d, "Боковина левая"), panel(d, "Полка")
        for q in (shelf,):
            q["max"][2] = 580          # стык 580 мм: по общей норме три крепежа, полке хватает двух полкодержателей
        for q in (side, panel(d, "Боковина правая"), panel(d, "Дно"), panel(d, "Крышка")):
            q["max"][2] = 600
        f, _, _ = run(d)
        self.assertFalse(any("Полка" in s for s in f["J02"].items) if "J02" in f else False)

    def test_api_missing_is_unchecked(self):
        d = data(); d["fastened"] = None
        f, ready, _ = run(d)
        self.assertEqual(f["J00"].sev, rv.UNCHECKED); self.assertFalse(ready)


class Hardware(unittest.TestCase):
    def test_door_without_hinges(self):
        d = data()
        for b in d["blocks"]:
            if b["name"].startswith("Петля"):
                b["name"] = "Узел 1"
        for p in d["parts"]:
            if p["name"] in ("Чашка", "Планка"):
                p["name"] = "Деталь узла"
        f, ready, _ = run(d)
        self.assertIn("F05", f); self.assertIn("F04", f); self.assertFalse(ready)

    def test_too_few_hinges(self):
        d = data()
        door = [b for b in d["blocks"] if b.get("anim") == "DoorLeft"][0]["id"]
        gone = [b["id"] for b in d["blocks"] if b["name"].startswith("Петля") and door in b["anc"]][:2]
        d["parts"] = [p for p in d["parts"] if not set(p["anc"]) & set(gone)]
        d["holes"] = [h for h in d["holes"] if h["owner"] in {p["id"] for p in d["parts"]}]
        f, _, _ = run(d)
        self.assertIn("F06", f)

    def test_hinge_clash_with_inner_panel(self):
        d = data(); p = copy.deepcopy(panel(d, "Боковина левая"))
        p.update(id="uX", name="Панель ИБП", min=[16, 100, 300], max=[32, 600, 500], art="9", role="other", edges=[], anc=[])
        p["ch"], p["cw"] = 500, 200
        d["panels"].append(p)
        f, ready, _ = run(d)
        self.assertIn("F01", f); self.assertFalse(ready)
        self.assertTrue(any("Панель ИБП" in s for s in f["F01"].items))

    def test_nut_in_a_hole_of_its_screw_is_not_a_clash(self):
        d = data(); top = panel(d, "Крышка")
        d["parts"].append({"id": "uN", "path": "90", "name": "Стяжка (гайка)\rN1", "anc": [], "min": [193, 1970, 93], "max": [207, 1999, 107]})
        f, _, _ = run(d)
        self.assertIn("F02", f)        # тело в детали без отверстия: замечание
        d["parts"].append({"id": "uV", "path": "91", "name": "Стяжка (винт)\rV1", "anc": [], "min": [197, 2000, 97], "max": [203, 2010, 103]})
        d["holes"].append({"owner": "uV", "d": 8, "depth": 16, "p": [200, 2000, 100], "dir": [0, -1, 0]})
        f, _, _ = run(d)
        self.assertNotIn("F02", f); self.assertNotIn("F01", f)     # отверстие ответного винта на той же оси: гайка сидит в нём

    def test_hardware_without_holes(self):
        d = data()
        d["parts"].append({"id": "uH", "path": "92", "name": "Ручка-скоба\rAVA0049", "anc": [], "min": [390, 900, 518], "max": [396, 1100, 540]})
        d["parts"].append({"id": "uB", "path": "93", "name": "Тело 1", "anc": [], "min": [100, 900, 100], "max": [120, 950, 120]})
        d["parts"].append({"id": "uR", "path": "94", "name": "Габаритная рамка", "anc": [], "hidden": True, "min": [0, 0, 0], "max": [1, 1, 1]})
        f, _, _ = run(d)
        self.assertTrue(any("Ручка" in s for s in f["M08"].items))
        self.assertEqual(len(f["M06"].items), 1)
        self.assertNotIn("M05", f)

    def test_wide_door_needs_one_more_hinge(self):
        d = data()
        self.assertNotIn("F06", run(d)[0])
        cfg = copy.deepcopy(RULES); cfg["hardware"]["hinge_extra_from_width"] = 300
        self.assertIn("F06", run(d, cfg=cfg)[0])

    def test_hardware_outside(self):
        d = data(); p = [p for p in d["parts"] if p["name"] == "Планка"][0]
        p["min"][2] += 200; p["max"][2] += 200
        f, _, _ = run(d)
        self.assertIn("F03", f)

    def test_animation(self):
        d = data(); b = [b for b in d["blocks"] if b.get("anim") == "DoorLeft"][0]
        b["anim"] = "None"; b["kind"] = "door"; b["kindStrict"] = None
        f, _, _ = run(d)
        self.assertIn("A01", f); self.assertIn("A02", f)

    def test_zero_angle(self):
        d = data(); [b for b in d["blocks"] if b.get("anim") == "DoorLeft"][0]["angle"] = 0
        f, _, _ = run(d)
        self.assertIn("A03", f)


class ModelAndPositions(unittest.TestCase):
    def test_unsaved(self):
        d = data(); d["model"]["file"] = ""
        self.assertEqual(run(d, mode="review")[0]["M01"].sev, rv.WARN)
        f, ready, _ = run(d, mode="handoff")
        self.assertEqual(f["M01"].sev, rv.ERROR); self.assertFalse(ready)

    def test_positions(self):
        d = data(); panel(d, "Полка").pop("art")
        self.assertIn("P01", run(d)[0])
        d = data(); panel(d, "Полка")["art"] = "1"
        f, ready, _ = run(d)
        self.assertIn("P02", f); self.assertFalse(ready)

    def test_hidden_and_noname(self):
        d = data(); panel(d, "Полка")["hidden"] = True; panel(d, "Дно")["name"] = "Панель"
        f, _, _ = run(d)
        self.assertIn("M05", f); self.assertIn("N01", f)

    def test_empty_model(self):
        d = data(); d["panels"] = []
        f, ready, _ = run(d)
        self.assertIn("M02", f); self.assertFalse(ready)

    def test_rule_crash_is_unchecked(self):
        d = data()
        r = rv.Review(d, copy.deepcopy(RULES), "review", None, ALL_HIDDEN)
        r.check_edges = lambda: 1 / 0
        fs = r.run()
        self.assertTrue(any(f.sev == rv.UNCHECKED and "check_edges" in f.id for f in fs) or
                        any(f.sev == rv.UNCHECKED for f in fs))
        self.assertFalse(rv.verdict(fs)[0])


class Outputs(unittest.TestCase):
    def test_cutlist_grain(self):
        d = data(); p = panel(d, "Цоколь"); p["tex"] = 2      # текстура вдоль ch (70), хотя деталь длиной 768
        _, _, r = run(d)
        row = [x for x in r.cutlist() if x[2] == "Цоколь"][0]
        self.assertEqual((row[4], row[5], row[17]), ("70", "768", "нет"))
        doors = [x for x in r.cutlist() if x[2] == "Дверь"][0]
        self.assertEqual(doors[3], 2)
        self.assertEqual(doors[10:14], ["1", "1", "1", "1"])

    def test_cli(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = os.path.join(tmp, "review_data.json")
            with open(src, "w", encoding="utf-8") as fh:
                json.dump(BASE, fh)
            out = os.path.join(tmp, "out")
            code = rv.main([src, "--out", out, "--hidden", ",".join(ALL_HIDDEN), "--mode", "handoff"])
            self.assertEqual(code, 0)
            for name in ("review_report.md", "review_report.json", "cutlist.csv", "hardware.csv"):
                self.assertTrue(os.path.getsize(os.path.join(out, name)) > 0, name)
            with open(os.path.join(out, "review_report.json"), encoding="utf-8") as fh:
                self.assertTrue(json.load(fh)["ready"])
            self.assertEqual(rv.main([src, "--out", out]), 0)                       # замечания без блокеров не меняют код возврата
            bad = dict(BASE); bad["fastened"] = None
            with open(src, "w", encoding="utf-8") as fh:
                json.dump(bad, fh)
            self.assertEqual(rv.main([src, "--out", out]), 1)                       # невыполненная проверка блокирует
            self.assertEqual(rv.main([src, "--out", out, "--hidden", "up"]), 2)
            self.assertEqual(rv.main([os.path.join(tmp, "none.json"), "--out", out]), 2)


if __name__ == "__main__":
    unittest.main()
