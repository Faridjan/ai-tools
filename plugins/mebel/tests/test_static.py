# -*- coding: utf-8 -*-
"""
Статические проверки плагина и запуск тестов на Node и калькулятора из одной точки:
  py -3 -m unittest discover -s plugins/mebel/tests
Проверяет манифест, хуки, ссылки на файлы в SKILL.md, ASCII в файлах рантайма, компиляцию Python,
а в публичном репозитории ещё и отсутствие личных данных в новых скилах.
"""
import json
import os
import py_compile
import re
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.abspath(os.path.join(HERE, ".."))
SKILLS = os.path.join(PLUGIN, "skills")
RUNTIME = os.path.join(SKILLS, "bazis-script", "scripts")


def read(*parts):
    with open(os.path.join(PLUGIN, *parts), encoding="utf-8-sig") as fh:
        return fh.read()


def walk(root, exts):
    for base, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in ("ref", "__pycache__", "fixtures")]
        for f in files:
            if f.lower().endswith(exts):
                yield os.path.join(base, f)


class Manifest(unittest.TestCase):
    def test_plugin_json(self):
        m = json.loads(read(".claude-plugin", "plugin.json"))
        self.assertEqual(m["name"], "mebel")
        self.assertRegex(m["version"], r"^\d+\.\d+\.\d+$")

    def test_marketplace_lists_plugin(self):
        with open(os.path.join(PLUGIN, "..", "..", ".claude-plugin", "marketplace.json"), encoding="utf-8") as fh:
            names = [p["name"] for p in json.load(fh)["plugins"]]
        self.assertIn("mebel", names)

    def test_hooks_json(self):
        h = json.loads(read("hooks", "hooks.json"))["hooks"]
        for event, groups in h.items():
            self.assertIn(event, ("PreToolUse", "PostToolUse"))
            for g in groups:
                for one in g["hooks"]:
                    m = re.search(r"\$\{CLAUDE_PLUGIN_ROOT\}/([^\"]+)", one["command"])
                    self.assertTrue(m and os.path.exists(os.path.join(PLUGIN, m.group(1))), one["command"])

    def test_rules_json(self):
        cfg = json.loads(read("skills", "model-review", "scripts", "review_rules.json"))
        for key in ("sheet", "materials", "edges", "parts", "geometry", "holes", "joints", "hardware", "names"):
            self.assertIn(key, cfg)
        for key in ("no_edge_re", "no_edge_allowed_re"):
            re.compile(cfg["materials"][key])
        for key in ("hinge_re", "slide_re", "handle_re", "ignore_re", "article_re"):
            re.compile(cfg["hardware"][key])


class Skills(unittest.TestCase):
    def test_every_skill_has_frontmatter(self):
        for name in os.listdir(SKILLS):
            text = read("skills", name, "SKILL.md")
            m = re.match(r"---\n(.*?)\n---\n", text, re.S)
            self.assertTrue(m, name)
            self.assertIn("name: " + name, m.group(1))
            self.assertRegex(m.group(1), r"description: \S")

    def test_files_named_in_skills_exist(self):
        missing = []
        for name in os.listdir(SKILLS):
            text = read("skills", name, "SKILL.md")
            for rel in set(re.findall(r"`((?:references|scripts)/[\w./-]+\.\w+)`", text)):
                # ссылка может вести в справочник соседнего скила плагина
                if not any(os.path.exists(os.path.join(SKILLS, other, rel)) for other in os.listdir(SKILLS)):
                    missing.append(name + ": " + rel)
        self.assertEqual(missing, [])

    def test_installer_copies_existing_files(self):
        text = read("skills", "bazis-script", "scripts", "install.ps1")
        block = re.search(r"\$flat = @\((.*?)\)", text, re.S).group(1)
        for rel in re.findall(r"'([^']+)'", block):
            self.assertTrue(os.path.exists(os.path.join(RUNTIME, rel.replace("\\", os.sep))), rel)

    def test_new_skill_has_no_personal_data(self):
        # репозиторий публичный: в скиле ревью не должно быть путей автора, телефонов и номеров заказов
        for path in walk(os.path.join(SKILLS, "model-review"), (".md", ".py", ".js", ".ps1", ".json")):
            with open(path, encoding="utf-8-sig") as fh:
                text = fh.read()
            self.assertNotIn("Jarvis", text, path)
            self.assertIsNone(re.search(r"\+7[\s(]*\d{3}", text), path)


class Sources(unittest.TestCase):
    def test_runtime_is_ascii(self):
        # Базис читает lib.js и агента как ANSI, PowerShell 5.1 читает ps1 без BOM как ANSI
        files = ["lib.js", "Claude Agent.js", "agent-loop-fallback.js", "probe.js", "bz.ps1", "install.ps1"]
        files = [os.path.join(RUNTIME, f) for f in files] + [os.path.join(SKILLS, "model-review", "scripts", "review.ps1")]
        for path in files:
            with open(path, "rb") as fh:
                raw = fh.read()
            bad = [i for i, b in enumerate(raw) if b > 126]
            self.assertEqual(bad[:1], [], "%s: не ASCII, строка %s" % (path, raw[:bad[0]].count(b"\n") + 1 if bad else 0))

    def test_python_compiles(self):
        for path in walk(PLUGIN, (".py",)):
            py_compile.compile(path, doraise=True)

    def test_lib_version_matches_docs(self):
        lib = read("skills", "bazis-script", "scripts", "lib.js")
        agent = read("skills", "bazis-script", "scripts", "Claude Agent.js")
        skill = read("skills", "bazis-script", "SKILL.md")
        v = re.search(r"BZ\.VERSION = (\d+);", lib).group(1)
        a = re.search(r"caps\.agent = '([\d.]+)';", agent).group(1)
        self.assertIn("lib %s" % v, skill)
        self.assertIn("agent %s" % a, skill)


@unittest.skipUnless(shutil.which("node"), "нужен Node")
class NodeSuites(unittest.TestCase):
    def run_node(self, name):
        r = subprocess.run(["node", os.path.join(HERE, name)], capture_output=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stdout.decode("utf-8", "replace") + r.stderr.decode("utf-8", "replace"))

    def test_lib_and_collector(self):
        self.run_node("test_lib.js")

    def test_hooks(self):
        self.run_node("test_hooks.js")

    def test_js_syntax(self):
        for path in list(walk(os.path.join(SKILLS, "bazis-script", "scripts"), (".js",))) + list(walk(os.path.join(PLUGIN, "hooks"), (".js",))):
            if os.path.basename(os.path.dirname(path)) == "examples" or "model-review" in path:
                continue                      # команды агента проверяет test_lib.js: они выполняются внутри блока
            r = subprocess.run(["node", "--check", path], capture_output=True)
            self.assertEqual(r.returncode, 0, path + "\n" + r.stderr.decode("utf-8", "replace"))


class CabinetCalc(unittest.TestCase):
    def test_suite(self):
        script = os.path.join(SKILLS, "ldsp-furniture-design", "scripts", "test_cabinet_calc.py")
        r = subprocess.run([sys.executable, script], capture_output=True, timeout=120)
        self.assertEqual(r.returncode, 0, r.stderr.decode("utf-8", "replace"))


if __name__ == "__main__":
    unittest.main()
