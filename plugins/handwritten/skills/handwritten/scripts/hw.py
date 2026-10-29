#!/usr/bin/env python3
"""Сборка и рендер рукописного листа.

  hw.py build content.html -o out.html [--title T] [--format landscape] [--paper grid] [--lang ru]
               [--jira-base URL] [--jira-projects PROJ,OPS] [--png] [--open] [--scale 2]
  hw.py render out.html [-o out.png] [--scale 2]

build вшивает фрагмент разметки в shell.html вместе с engine.css/engine.js -> один самодостаточный HTML.
Открытый в браузере, он работает как холст: пан, зум, мини-карта. --open открывает его сразу.
Общих словарей нет: все статьи пишутся под доску в её <dl class="glossary">. data-src (пути к файлам,
ключи Jira, URL) превращаются в ссылки: файл в git-репозитории с GitHub-remote -> ссылка на GitHub с номерами строк.
Каждый ключ Jira (PROJ-123) в тексте, схемах, подписях и карточках движок делает ссылкой на задачу:
база - --jira-base или HW_JIRA_BASE, проекты - --jira-projects или HW_JIRA_PROJECTS (иначе любой ключ,
кроме похожих на ключи стандартов из JIRA_SKIP: SHA-256, UTF-8, ICD-10...).
render снимает PNG ровно по листу. На macOS - системным WebKit (scripts/snap.swift, компилируется
один раз в ~/.cache/handwritten/snap), иначе - headless Chromium. Предупреждения движка (битые селекторы
стрелок, неизвестные дудлы, контент шире листа) печатаются как WARN - их нужно исправить.
"""
import argparse
import html
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

SCRIPTS = pathlib.Path(__file__).resolve().parent
ASSETS = SCRIPTS.parent / "assets"
SNAP_BIN = pathlib.Path.home() / ".cache" / "handwritten" / "snap"
JIRA_BASE = os.environ.get("HW_JIRA_BASE", "")
JIRA_PROJECTS = os.environ.get("HW_JIRA_PROJECTS", "")
# префиксы, которые выглядят как ключ задачи, но это стандарты, кодировки и версии: SHA-256, UTF-8, ICD-10
JIRA_SKIP = ("SHA", "MD", "UTF", "ISO", "RFC", "TLS", "SSL", "HTTP", "HTTPS", "IPV", "CVE", "CWE", "COVID", "SARS",
             "AES", "RSA", "DES", "ECDSA", "ICD", "CPT", "HL7", "X12", "PEP", "IEEE", "WCAG", "ES", "ECMA",
             "UTC", "GMT", "GPT", "ASCII", "BASE", "CP", "WIN", "IE", "MP", "PCI", "SOC", "NIST", "OWASP", "BS")
JIRA_RE = re.compile(r"(?<![\w\-/.#])([A-Z][A-Z0-9_]{1,9})-([1-9]\d{0,6})(?![\w]|[-.]\d)")
FORMATS = ("landscape", "portrait", "square", "insta", "story", "wide", "board")
PAPERS = ("grid", "dots", "lines", "plain", "kraft")
BROWSERS = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
]


def find_browser():
    if os.environ.get("HW_BROWSER"):
        return os.environ["HW_BROWSER"]
    for b in BROWSERS:
        if os.path.exists(b):
            return b
    for name in ("google-chrome", "chromium", "chromium-browser", "brave-browser", "microsoft-edge"):
        p = shutil.which(name)
        if p:
            return p
    sys.exit("Не найден Chromium-браузер для PNG. Поставь Chrome/Brave или задай HW_BROWSER=/path/to/browser")


# ---------- источники: data-src -> ссылки ----------
_git_cache = {}
SRC_WARN = []


def _git(cwd, *args):
    r = subprocess.run(["git", "-C", str(cwd), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def _repo_info(top):
    if top in _git_cache:
        return _git_cache[top]
    remote = _git(top, "remote", "get-url", "origin")
    m = re.match(r"(?:git@github\.com:|https://github\.com/)([^/]+/[^/]+?)(?:\.git)?$", remote)
    web = f"https://github.com/{m.group(1)}" if m else ""
    remote_sha = ""
    for ref in ("origin/HEAD", "origin/main", "origin/master", "origin/develop"):
        remote_sha = _git(top, "rev-parse", "--verify", "-q", ref)
        if remote_sha:
            break
    head = _git(top, "rev-parse", "HEAD")
    head_pushed = bool(_git(top, "branch", "-r", "--contains", head)) if head else False
    info = {"web": web, "remote_sha": remote_sha, "head": head, "head_pushed": head_pushed, "name": pathlib.Path(top).name}
    _git_cache[top] = info
    return info


def resolve_target(target, roots):
    t = target.strip()
    if re.match(r"^(https?|file|vscode):", t):
        return "", t
    if re.fullmatch(r"[A-Z][A-Z0-9]+-\d+", t):
        return t, (JIRA_BASE + t) if JIRA_BASE else ""
    m = re.match(r"^(.*?)(?::(\d+)(?:-(\d+))?)?$", t)
    path_s, l1, l2 = m.group(1), m.group(2), m.group(3)
    cands = [pathlib.Path(os.path.expanduser(path_s))]
    if not cands[0].is_absolute():
        cands = [pathlib.Path(os.path.expanduser(r)) / path_s for r in roots]
    f = next((c for c in cands if c.exists()), None)
    if not f:
        SRC_WARN.append(t)
        return t, ""
    f = f.resolve()
    lines = f":{l1}" + (f"-{l2}" if l2 else "") if l1 else ""
    top = _git(f.parent if f.is_file() else f, "rev-parse", "--show-toplevel")
    if top:
        info = _repo_info(top)
        rel = str(f.relative_to(top))
        label = f"{info['name']}/{rel}{lines}"
        if info["web"]:
            sha = ""
            if info["remote_sha"] and subprocess.run(["git", "-C", top, "cat-file", "-e", f"{info['remote_sha']}:{rel}"], capture_output=True).returncode == 0:
                sha = info["remote_sha"]
            elif info["head_pushed"]:
                sha = info["head"]
            if sha:
                kind = "blob" if f.is_file() else "tree"
                anchor = f"#L{l1}" + (f"-L{l2}" if l2 else "") if l1 else ""
                return label, f"{info['web']}/{kind}/{sha}/{rel}{anchor}"
        return label, f.as_uri()
    return f"{f.name}{lines}", f.as_uri()


def resolve_sources(text, roots):
    def one(m):
        items = []
        for raw in re.split(r"\s;\s", html.unescape(m.group(1))):
            raw = raw.strip()
            if not raw:
                continue
            lm = re.match(r"^(.*?)\s=\s(.+)$", raw)
            label, target = (lm.group(1).strip(), lm.group(2)) if lm else ("", raw)
            auto, url = resolve_target(target, roots)
            if url and not label and not auto:
                items.append(url)  # голый URL: метку движок сделает сам (домен и хвост пути)
                continue
            label = label or auto or target
            items.append(f"{label} = {url}" if url else label)
        return 'data-src="' + html.escape(" ; ".join(items), quote=True) + '"'
    return re.sub(r'data-src="([^"]*)"', one, text)


def jira_keys(content, projects):
    """Ключи Jira, которые движок сделает ссылками: текст без тегов плюс подписи и пояснения из атрибутов."""
    content = re.sub(r"<(\w+)\b[^>]*\sdata-nojira\b[^>]*>.*?</\1>", " ", content, flags=re.S)
    attrs = re.findall(r'\sdata-(?:tip|more|say|label|full|note|msg|center|at|left|right)="([^"]*)"', content)
    text = html.unescape(re.sub(r"<[^>]*>", " ", content) + " " + " ".join(attrs))
    only = {p.strip() for p in projects.split(",") if p.strip()}
    return sorted({m.group(0) for m in JIRA_RE.finditer(text) if (m.group(1) in only if only else m.group(1) not in JIRA_SKIP)})


def build(a):
    global JIRA_BASE
    JIRA_BASE = a.jira_base  # и для data-src, и для ключей в тексте
    content = pathlib.Path(a.content).read_text(encoding="utf-8")
    SRC_WARN.clear()
    if "glossary" not in content:
        print("WARN: нет <dl class=\"glossary\">: общих словарей больше нет, статьи пишутся под доску")
    keys = jira_keys(content, a.jira_projects)
    content = resolve_sources(content, [str(pathlib.Path(a.content).resolve().parent), os.getcwd()])
    if SRC_WARN:
        print("WARN: источник не найден (путь от папки content.html или cwd): " + ", ".join(sorted(set(SRC_WARN))))
    if keys and not a.jira_base:
        print("WARN: на доске ключи Jira, но адрес не задан - ссылок не будет (--jira-base или HW_JIRA_BASE): " + ", ".join(keys))
    elif keys:
        print(f"jira: {len(keys)} ссылками на {a.jira_base}: " + ", ".join(keys)
              + " (не задача - оберни в data-nojira; свои проекты - --jira-projects)")
    subs = {
        "TITLE": html.escape(a.title),
        "LANG": a.lang,
        "FORMAT": a.format,
        "PAPER": a.paper,
        "CSS": (ASSETS / "engine.css").read_text(encoding="utf-8"),
        "JS": (ASSETS / "engine.js").read_text(encoding="utf-8"),
        "CONTENT": content,
        "JIRA": html.escape(a.jira_base, quote=True),
        "JIRA_PROJECTS": html.escape(a.jira_projects, quote=True),
        "JIRA_SKIP": ",".join(JIRA_SKIP),
    }
    shell = (ASSETS / "shell.html").read_text(encoding="utf-8")
    out = re.sub(r"\{\{(\w+)\}\}", lambda m: subs.get(m.group(1), m.group(0)), shell)
    dst = pathlib.Path(a.output)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(out, encoding="utf-8")
    print(f"html: {dst.resolve()}")
    if a.png:
        # board большой - в масштабе 2 PNG выходит гигантским
        render(dst, dst.with_suffix(".png"), a.scale or (1 if a.format == "board" else 2))
    if a.open:
        opener = "open" if sys.platform == "darwin" else "xdg-open"
        subprocess.run([opener, str(dst.resolve())], check=False)
        print(f"открыт в браузере: {dst.resolve()}")


def ensure_snap():
    src = SCRIPTS / "snap.swift"
    if SNAP_BIN.exists() and SNAP_BIN.stat().st_mtime >= src.stat().st_mtime:
        return SNAP_BIN
    SNAP_BIN.parent.mkdir(parents=True, exist_ok=True)
    print("компилирую snap (один раз, ~30 с)...", flush=True)
    r = subprocess.run(["swiftc", "-O", str(src), "-o", str(SNAP_BIN)], capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("swiftc не справился:\n" + r.stderr[-2000:])
    return SNAP_BIN


def report(png, w, h, scale, warn, page_log="", tiles=()):
    print(f"png:  {pathlib.Path(png).resolve()}  ({w}x{h} css px, x{scale:g})")
    if tiles:
        print("preview (смотреть по кускам, лист длинный): " + ", ".join(tiles))
    if warn:
        print("WARN: " + html.unescape(warn))
    extra = [l for l in page_log.splitlines() if l.startswith("[page]") and "[handwritten]" not in l]
    if extra:
        print("PAGE: " + " | ".join(extra[:10]))


def render_webkit(src, png, scale):
    preview = pathlib.Path(tempfile.gettempdir()) / "handwritten-preview" / pathlib.Path(png).stem
    shutil.rmtree(preview, ignore_errors=True)
    cmd = [str(ensure_snap()), str(src), str(png), f"{scale:g}", str(preview)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=150)
    if r.returncode != 0 and "timeout" in r.stderr:
        # изредка WebKit подвисает на сети (шрифты с CDN) - второй заход обычно проходит
        print("snap: таймаут, повторяю...", flush=True)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=150)
    if r.returncode != 0:
        sys.exit("snap: " + (r.stderr.strip()[-2000:] or "упал без сообщения"))
    info = json.loads(r.stdout.strip().splitlines()[-1])
    report(png, info["w"], info["h"], scale, info.get("warn", ""), r.stderr, info.get("tiles", []))


def render_chromium(src, png, scale):
    browser = find_browser()
    url = pathlib.Path(src).resolve().as_uri() + "?render=1"
    with tempfile.TemporaryDirectory() as prof:
        base = [
            browser, "--headless=new", f"--user-data-dir={prof}", "--no-first-run", "--no-default-browser-check",
            "--use-mock-keychain", "--hide-scrollbars", "--disable-gpu", "--virtual-time-budget=20000",
            "--run-all-compositor-stages-before-draw",
        ]
        dom = subprocess.run(base + ["--window-size=2400,1600", "--dump-dom", url],
                             capture_output=True, text=True, timeout=90).stdout
        body = re.search(r"<body([^>]*)>", dom)
        attrs = dict(re.findall(r'data-(\w+)="([^"]*)"', body.group(1))) if body else {}
        if attrs.get("ready") != "1":
            sys.exit("Движок не дошёл до конца (нет data-ready). Проверь сеть и разметку.")
        w, h = int(attrs["w"]), int(attrs["h"])
        subprocess.run(base + [f"--window-size={w},{h}", f"--force-device-scale-factor={scale:g}", f"--screenshot={png}", url],
                       capture_output=True, text=True, timeout=90)
    if not pathlib.Path(png).exists():
        sys.exit("Скриншот не создан")
    report(png, w, h, scale, attrs.get("warn", ""))


def render(src, png, scale):
    if sys.platform == "darwin" and shutil.which("swiftc") and not os.environ.get("HW_BROWSER"):
        render_webkit(src, png, scale)
    else:
        render_chromium(src, png, scale)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sp = p.add_subparsers(dest="cmd", required=True)
    b = sp.add_parser("build")
    b.add_argument("content")
    b.add_argument("-o", "--output", required=True)
    b.add_argument("--title", default="Заметки")
    b.add_argument("--format", default="landscape", choices=FORMATS)
    b.add_argument("--paper", default="grid", choices=PAPERS)
    b.add_argument("--lang", default="ru")
    b.add_argument("--jira-base", default=JIRA_BASE, help="адрес задач Jira, к нему дописывается ключ; пустой - без ссылок")
    b.add_argument("--jira-projects", default=JIRA_PROJECTS, help="ключи проектов через запятую: ссылками станут только они")
    b.add_argument("--png", action="store_true")
    b.add_argument("--open", action="store_true", help="открыть HTML-холст в браузере")
    b.add_argument("--scale", type=float, default=None, help="масштаб PNG (по умолчанию 2, для board 1)")
    r = sp.add_parser("render")
    r.add_argument("html")
    r.add_argument("-o", "--output")
    r.add_argument("--scale", type=float, default=2)
    a = p.parse_args()
    if a.cmd == "build":
        build(a)
    else:
        render(a.html, a.output or str(pathlib.Path(a.html).with_suffix(".png")), a.scale)


if __name__ == "__main__":
    main()
