# -*- coding: utf-8 -*-
"""
Сквозной тест без Базиса (только Windows): install.ps1 разворачивает рантайм во временную папку,
настоящий Claude Agent.js работает в Node поверх макета API, команды идут через настоящий bz.ps1,
полный прогон review.ps1 даёт отчёт. Проверяет протокол обмена, коды возврата и защиту от гонок.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
PLUGIN = os.path.abspath(os.path.join(HERE, ".."))
SCRIPTS = os.path.join(PLUGIN, "skills", "bazis-script", "scripts")
REVIEW = os.path.join(PLUGIN, "skills", "model-review", "scripts", "review.ps1")
PS = ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]


def text(raw):
    """PowerShell пишет в кодировке консоли: UTF-8 или OEM, смотря как запущен."""
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("oem", "replace")


def child_env():
    """Окружение для Windows PowerShell 5.1. PSModulePath от PowerShell 7 (так запускает GitHub Actions)
    ломает в нём автозагрузку модулей, поэтому переменную убираем: 5.1 возьмёт свою."""
    env = dict(os.environ, BZ_HOST_PROCESS="node")
    env.pop("PSModulePath", None)
    return env


def ps(script, *args, cwd=None, timeout=120):
    env = child_env()
    r = subprocess.run(PS + [script] + list(args), capture_output=True, cwd=cwd, env=env, timeout=timeout)
    return r.returncode, text(r.stdout) + text(r.stderr)


@unittest.skipUnless(sys.platform == "win32" and shutil.which("node") and shutil.which("powershell"),
                     "нужны Windows, PowerShell и Node")
class EndToEnd(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="mebel-e2e-")
        cls.bazis = os.path.join(cls.tmp, "Bazis11")
        os.makedirs(cls.bazis)
        cls.work = os.path.join(cls.bazis, "_claude")
        cls.bz = os.path.join(cls.work, "bz.ps1")
        code, out = ps(os.path.join(SCRIPTS, "install.ps1"), "-Bazis", cls.bazis)
        assert code == 0, out
        cls.install_out = out
        cls.host = subprocess.Popen(["node", os.path.join(HERE, "mock_agent_host.js"), cls.bazis],
                                    stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        hb = os.path.join(cls.work, "heartbeat.json")
        for _ in range(100):
            if os.path.exists(hb):
                break
            time.sleep(0.1)
        else:
            cls.host.kill()
            raise AssertionError("агент не запустился: " + cls.host.stdout.read().decode("utf-8", "replace"))

    @classmethod
    def tearDownClass(cls):
        try:
            ps(cls.bz, "-Stop")
            cls.host.wait(timeout=10)
        except Exception:
            cls.host.kill()
        cls.host.stdout.close()
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def cmd(self, name, code):
        path = os.path.join(self.work, name)
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(code)
        return path

    def test_01_install(self):
        with open(os.path.join(PLUGIN, ".claude-plugin", "plugin.json"), encoding="utf-8") as fh:
            version = json.load(fh)["version"]
        with open(os.path.join(self.work, "plugin_version.txt")) as fh:
            self.assertEqual(fh.read().strip(), version)
        with open(os.path.join(self.work, "lib.js"), encoding="ascii") as fh:
            lib = fh.read()
        self.assertIn(self.bazis.replace("\\", "\\\\"), lib)
        self.assertNotIn("Documents\\\\Bazis11", lib)      # путь автора заменён
        with open(self.bz, encoding="utf-8-sig") as fh:
            self.assertIn(self.bazis, fh.read())
        self.assertTrue(os.path.exists(os.path.join(self.bazis, "Scripts", "Claude Agent.js")))
        self.assertIn("NOTE: model backups", self.install_out)

    def test_02_status(self):
        code, out = ps(self.bz, "-Status")
        self.assertEqual(code, 0)
        self.assertIn("AGENT: alive", out)
        self.assertIn('"agent":"3.2"', out.replace(" ", ""))
        self.assertIn("RUNTIME:", out)

    def test_03_selftest(self):
        code, out = ps(self.bz, "-File", os.path.join(self.work, "cmd_selftest.js"))
        self.assertEqual(code, 0, out)
        self.assertIn("[OK]", out)

    def test_04_failed_command_returns_6(self):
        code, out = ps(self.bz, "-File", self.cmd("cmd_t_fail.js", "log('before');\nthrow new Error('boom');"))
        self.assertEqual(code, 6, out)
        self.assertIn("[ERROR]", out); self.assertIn("boom", out); self.assertIn("line: 2", out)

    def test_05_partial_change_is_reported(self):
        code, out = ps(self.bz, "-File", self.cmd(
            "cmd_t_partial.js", "const s = BZ.byRole('shelf')[0]; BZ.move(s, 0, 5, 0); throw new Error('half');"))
        self.assertEqual(code, 6, out)
        self.assertIn("PARTIAL", out)
        code, out = ps(self.bz, "-File", self.cmd("cmd_t_back.js", "BZ.move(BZ.byRole('shelf')[0], 0, -5, 0); 'ok'"))
        self.assertEqual(code, 0, out)
        self.assertIn("inspect: clean", out)
        self.assertIn("review.ps1", out)       # чистый inspect не выдаётся за полную проверку

    def test_06_unserializable_result_still_answers(self):
        code, out = ps(self.bz, "-File", self.cmd("cmd_t_cycle.js", "const a = { n: 1 }; a.self = a; a;"), timeout=30)
        self.assertEqual(code, 0, out)
        self.assertIn("circular", out)
        code, out = ps(self.bz, "-File", self.cmd("cmd_t_obj.js", "BZ.panels()[0];"), "-TimeoutSec", "20", timeout=40)
        self.assertEqual(code, 0, out)         # раньше: объект Базиса в ret -> нет result.json -> таймаут

    def test_07_long_command_is_not_agent_death(self):
        code, out = ps(self.bz, "-File", self.cmd(
            "cmd_t_slow.js", "const t = Date.now(); while (Date.now() - t < 9000) {} 'slow done';"), timeout=60)
        self.assertEqual(code, 0, out)
        self.assertNotIn("agent died", out)
        self.assertIn("slow done", out)

    def test_08_parallel_sessions_do_not_clobber(self):
        a = self.cmd("cmd_t_a.js", "const t = Date.now(); while (Date.now() - t < 1500) {} 'marker-A';")
        b = self.cmd("cmd_t_b.js", "'marker-B';")
        env = child_env()
        pa = subprocess.Popen(PS + [self.bz, "-File", a], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        pb = subprocess.Popen(PS + [self.bz, "-File", b], stdout=subprocess.PIPE, stderr=subprocess.STDOUT, env=env)
        oa, ob = text(pa.communicate(timeout=60)[0]), text(pb.communicate(timeout=60)[0])
        self.assertEqual((pa.returncode, pb.returncode), (0, 0), oa + ob)
        self.assertIn("marker-A", oa); self.assertNotIn("marker-B", oa)
        self.assertIn("marker-B", ob); self.assertNotIn("marker-A", ob)

    def test_09_file_argument(self):
        self.cmd("cmd_t_rel.js", "'relative ok';")
        code, out = ps(self.bz, "-File", "cmd_t_rel.js", cwd=self.work)
        self.assertEqual(code, 0, out); self.assertIn("relative ok", out)
        code, out = ps(self.bz, "-File", os.path.join(self.work, "no_such.js"))
        self.assertEqual(code, 1, out); self.assertIn("not found", out)
        code, out = ps(self.bz, "-File", self.cmd("cmd_t_empty.js", "  \n"))
        self.assertEqual(code, 1, out)

    def test_10_review_handoff(self):
        code, out = ps(REVIEW, "-Bazis", self.bazis, "-Mode", "handoff", "-Hidden", "left,right,top,back,bottom",
                       "-Expect", "800x2000x521", timeout=180)
        self.assertEqual(code, 0, out)
        self.assertIn("VERDICT=READY", out)
        rep = os.path.join(self.work, "review")
        for name in ("review_report.md", "review_report.json", "cutlist.csv", "hardware.csv"):
            self.assertTrue(os.path.exists(os.path.join(rep, name)), name)
        code, out = ps(REVIEW, "-Bazis", self.bazis, "-Expect", "800x2000x500", timeout=180)
        self.assertEqual(code, 1, out)
        self.assertIn("M04", out)

    def test_11_review_finds_a_broken_model(self):
        # сдвинули полку в боковину и сняли кромку с дверей: ревью должно это поймать
        code, out = ps(self.bz, "-File", self.cmd(
            "cmd_t_break.js", "BZ.move(BZ.byRole('shelf')[0], -8, 0, 0); 'broken';"), "-NoInspect")
        self.assertEqual(code, 0, out)
        try:
            code, out = ps(REVIEW, "-Bazis", self.bazis, "-Hidden", "left,right,top,back,bottom", timeout=180)
            self.assertEqual(code, 1, out)
            self.assertIn("G01", out)
            self.assertIn("VERDICT=NOT_READY", out)
        finally:
            ps(self.bz, "-File", self.cmd("cmd_t_fix.js", "BZ.move(BZ.byRole('shelf')[0], 8, 0, 0); 'fixed';"), "-NoInspect")


if __name__ == "__main__":
    unittest.main()
