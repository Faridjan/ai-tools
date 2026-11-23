#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Тесты cabinet_calc.py: эталонные примеры из references/construction.md и регрессии найденных багов.
Запуск: py test_cabinet_calc.py
"""
import contextlib
import io
import os
import shlex
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import cabinet_calc as cc  # noqa: E402

KRONOSPAN = ["--sheet-len", "2750", "--sheet-wid", "1830"]


def body(argv):
    c, _ = cc.build_body(cc.parse_args(argv))
    return c


def sizes(c, name):
    return [(p.L, p.W, p.qty) for p in c.parts if p.name == name]


def count(c, name):
    return sum(p.qty for p in c.parts if p.name == name)


def has(lines, text):
    return any(text in s for s in lines)


class Golden(unittest.TestCase):
    def test_wardrobe_800x2000x500(self):
        """construction.md 2.2: шкаф 800x2000x500, цоколь 70, 2 накладные двери над цоколем."""
        c = body(["-W", "800", "-H", "2000", "-D", "500", "--plinth", "70", "--doors", "2", "--shelves", "3"])
        self.assertEqual(sizes(c, "Боковина"), [(2000, 500, 2)])
        self.assertEqual(sizes(c, "Крышка"), [(768, 500, 1)])
        self.assertEqual(sizes(c, "Дно"), [(768, 500, 1)])
        self.assertEqual(sizes(c, "Цоколь"), [(768, 70, 1)])
        self.assertEqual(sizes(c, "Полка съёмная"), [(766, 480, 3)])
        self.assertEqual(sizes(c, "Фасад"), [(1926, 396, 2)])
        self.assertEqual(c.hw["Петля 35 мм накладная"], 8)
        (back,) = [p for p in c.parts if p.name == "Стенка задняя"]
        self.assertTrue(2000 - 70 - 4 <= back.L <= 2000 - 70 - 2 and 800 - 4 <= back.W <= 800 - 2)

    def test_kitchen_base_600(self):
        """construction.md 5.2: нижний модуль 600x720x560, дно под боковинами, 1 фасад."""
        c = body(["--type", "base", "-W", "600", "-D", "560", "--doors", "1", "--shelves", "1", "--shelf-setback", "30"])
        self.assertEqual(sizes(c, "Боковина"), [(704, 560, 2)])
        self.assertEqual(sizes(c, "Дно"), [(600, 560, 1)])
        self.assertEqual(sizes(c, "Царга"), [(568, 100, 2)])
        self.assertEqual(sizes(c, "Полка съёмная"), [(566, 530, 1)])
        self.assertEqual(sizes(c, "Стенка задняя"), [(716, 596, 1)])
        self.assertEqual(sizes(c, "Фасад"), [(716, 596, 1)])

    def test_drawer_box_400(self):
        """construction.md 3.3: проём 368, шариковые NL 450, фасад 236: короб 450x196, перед и зад 310, дно 446x338."""
        c = body(["-W", "400", "-H", "720", "-D", "500", "--drawers", "3"])
        self.assertEqual(sizes(c, "Ящик 1 боковина"), [(450, 196, 2)])
        self.assertEqual(sizes(c, "Ящик 1 перед/зад"), [(310, 196, 2)])
        self.assertEqual(sizes(c, "Ящик 1 дно"), [(446, 338, 1)])
        self.assertEqual([p.L for p in c.parts if p.name.startswith("Фасад ящика")], [236, 236, 238])


class Doors(unittest.TestCase):
    ARGS = ["-W", "1200", "-H", "2400", "-D", "600", "--plinth", "80", "--sections", "2"]

    def test_total_divisible_by_sections_is_split_per_section(self):
        c = body(self.ARGS + ["--doors", "2"])
        self.assertEqual(sizes(c, "Фасад"), [(2316, 596, 2)])
        self.assertEqual(c.hw["Петля 35 мм накладная"], 10)
        self.assertEqual(count(body(self.ARGS + ["--doors", "4"]), "Фасад"), 4)

    def test_not_divisible_spans_whole_width(self):
        c = body(self.ARGS + ["--doors", "3"])
        self.assertEqual(sizes(c, "Фасад"), [(2316, 396, 3)])
        self.assertTrue(has(c.warn, "не кратно"))

    def test_per_section_list(self):
        c = body(["-W", "1600", "-H", "2400", "-D", "600", "--plinth", "80", "--section-widths", "900,*", "--doors", "2,1"])
        self.assertEqual(count(c, "Фасад"), 3)


class Niche(unittest.TestCase):
    ARGS = ["--type", "niche", "--niche-w", "1850,1848", "--niche-h", "2900,2890", "--niche-d", "620",
            "--back", "groove", "--material", "ЛДСП Kronospan 16"] + KRONOSPAN

    def run_niche(self, extra=()):
        a = cc.parse_args(self.ARGS + list(extra))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            c, _ = cc.build_niche(a)
        return c, [s for s in out.getvalue().splitlines() if s.startswith("py ")]

    @staticmethod
    def argv(line):
        return shlex.split(line, comments=True)[2:]

    def test_body_commands_keep_niche_context(self):
        _, lines = self.run_niche()
        bodies = [self.argv(s) for s in lines if "--type cabinet" in s]
        self.assertEqual(len(bodies), 2)
        for argv in bodies:
            b = cc.parse_args(argv)
            self.assertEqual((b.back, b.material, b.sheet_len, b.sheet_wid, b.plinth, b.ceiling),
                             ("groove", "ЛДСП Kronospan 16", 2750, 1830, 80, 2890))
            self.assertLessEqual(b.D + (b.back_t if b.back == "overlay" else 0) + 2 + b.front_t, 620)
            c = body(argv)
            self.assertFalse(has(c.warn, "не выходит из листа") or has(c.warn, "не поднять"))

    def test_fillers_command_is_complete(self):
        _, lines = self.run_niche()
        (line,) = [s for s in lines if "--type niche" in s]
        b = cc.parse_args(self.argv(line))
        self.assertEqual((b.niche_w, b.niche_h, b.niche_d, b.back, b.sheet_len, b.append),
                         ("1850,1848", "2900,2890", "620", "groove", 2750, True))

    def test_csv_already_written_by_niche_run(self):
        _, lines = self.run_niche(["--csv", "order.csv"])
        self.assertTrue(lines and all("--append" in self.argv(s) for s in lines))
        self.assertFalse(any("--type niche" in s for s in lines))

    def test_wall_fixings_by_body_width(self):
        c, _ = self.run_niche()
        self.assertEqual(c.hw["Уголок или крепёж корпуса к стене (сейсмика)"], 6)  # 2 корпуса по 894, по 3 точки


class Validation(unittest.TestCase):
    def test_bad_rod_section_is_a_clear_error(self):
        for rod in ("3", "0", "x"):
            with self.assertRaises(SystemExit) as e:
                body(["-W", "1200", "-H", "2400", "-D", "600", "--sections", "2", "--rod", rod])
            self.assertIn("--rod", str(e.exception.code))


class Sheet(unittest.TestCase):
    def test_grain_part_wider_than_sheet(self):
        args = ["--type", "wall", "-W", "1900", "-D", "300", "--doors", "1"] + KRONOSPAN
        self.assertTrue(has(body(args).warn, "Фасад 716x1896 не выходит из листа"))
        self.assertFalse(has(body(args + ["--no-grain"]).warn, "не выходит из листа"))

    def test_hdf_back_is_checked_against_hdf_sheet(self):
        self.assertFalse(has(body(["-W", "1900", "-H", "2000", "-D", "600"] + KRONOSPAN).warn, "Задняя стенка"))
        self.assertTrue(has(body(["-W", "2200", "-H", "2400", "-D", "600"]).warn, "Задняя стенка"))


class Rules(unittest.TestCase):
    def test_seismic_note(self):
        def note(args):
            return has(body(args).notes, "Сейсмика")
        self.assertTrue(note(["-W", "600", "-H", "1300", "-D", "600"]))
        self.assertTrue(note(["-W", "600", "-H", "1000", "-D", "300"]))
        self.assertFalse(note(["-W", "600", "-H", "1000", "-D", "400"]))

    def test_lift_margin(self):
        self.assertTrue(has(body(["-W", "800", "-H", "2400", "-D", "600", "--ceiling", "2490"]).warn, "не поднять"))

    def test_shelf_span_25mm(self):
        c = body(["-W", "1100", "-H", "900", "-D", "400", "-t", "25", "--shelves", "2"])
        self.assertTrue(has(c.warn, "пролёт полки 1050"))


class InputValidation(unittest.TestCase):
    """Регрессия: -W -5 и --sections 0 давали деталировку с отрицательными размерами и код возврата 0."""

    def bad(self, argv):
        with self.assertRaises(SystemExit) as cm:
            cc.validate_args(cc.parse_args(argv))
        self.assertIn("ОШИБКА", str(cm.exception))

    def test_rejects_impossible_sizes(self):
        self.bad(["-W", "-5", "-H", "2000", "-D", "500"])
        self.bad(["-W", "800", "-H", "20", "-D", "500"])
        self.bad(["-W", "800", "-H", "2000", "-D", "30"])
        self.bad(["-W", "800", "-H", "2000", "-D", "500", "--sections", "0"])
        self.bad(["-W", "800", "-H", "2000", "-D", "500", "--plinth", "2500"])

    def test_accepts_normal_input(self):
        cc.validate_args(cc.parse_args(["-W", "800", "-H", "2000", "-D", "500", "--plinth", "70"]))
        cc.validate_args(cc.parse_args(["--type", "base", "-W", "600", "-D", "560"]))
        cc.validate_args(cc.parse_args(["--type", "drawers", "-W", "400", "-H", "600", "-D", "500"]))


if __name__ == "__main__":
    unittest.main()
