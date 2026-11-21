# -*- coding: utf-8 -*-
"""Три PNG с чертежами: вид спереди, фасад с дверями, вид сбоку. SVG из elevation.svg.html, рендер headless Edge."""
import json, os, subprocess, sys
SRC = r"C:\Users\Jarvis\Documents\Bazis11\_claude\elevation.svg.html"
OUTDIR = sys.argv[1]
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
parts = json.load(open(SRC, encoding="utf-8"))
CSS = """
body{margin:0;background:#F2F4F6;color:#1F2A37;font-family:"Segoe UI",Arial,sans-serif}
.wrap{padding:24px 28px;background:#F2F4F6}
h1{font-size:26px;margin:0 0 4px;font-weight:600} .sub{color:#4B5868;font-size:14px;margin:0 0 14px}
.dwg{width:1540px;height:auto;display:block;background:#E8ECF0;border:1px solid #C9D1DA;font-family:Consolas,monospace}
.side .dwg{width:520px}
.ldsp{fill:#E8DCC4;stroke:#8C7A5B;stroke-width:.8} .ldsp.front{fill:#F1E7D3} .facade{fill:#F1E7D3;stroke:#8C7A5B;stroke-width:.8}
.door{fill:#EADFCB;stroke:#6F5F45;stroke-width:1} .hinge{fill:#fff;stroke:#2B6CB0;stroke-width:1.2} .push{fill:#B8763A;stroke:none}
.edge{fill:#8C7A5B;opacity:.85} .edge.front{fill:#B8763A;opacity:.7} .back{fill:#DDE3E9} .wall{fill:#C9D1DA}
.hw{fill:url(#hatch);stroke:#5B7A99;stroke-width:.9} .hl{stroke:#5B7A99;stroke-width:.7;opacity:.55}
.mounted{fill:#F5D9B3;stroke:#B8763A;stroke-width:.9;stroke-dasharray:5 3} .led{stroke:#D4A017;stroke-width:2.2} .floor{stroke:#1F2A37;stroke-width:1.6}
.dim{stroke:#2B6CB0;stroke-width:.8;fill:none} .dim.tick{stroke-width:1.1} .ext{stroke:#2B6CB0;stroke-width:.5;opacity:.6}
text{fill:#1F2A37;font-size:10.5px} .dt{fill:#2B6CB0;font-size:10.5px;font-weight:600} .dt2{fill:#2B6CB0;font-size:9px;font-weight:600}
.lab{fill:#1F2A37;font-size:9.5px} .lab2{fill:#4B5868;font-size:8.5px} .lvl{fill:#4B5868;font-size:8px} .clr{fill:#7A8797;font-size:8px} .sec{fill:#1F2A37;font-size:11px;font-weight:600;letter-spacing:.04em}
"""
PAGES = [
    ("01_vid_speredi.png", "Закладная спальня. Вид спереди без дверей", "Корпус 2600 x 3030 x 610, секции в свету 662 / 562 / 562 / 662, отметки полок от пола, все размеры в мм", parts["front"], "front", 1600, 1920),
    ("02_fasad_dveri_petli.png", "Закладная спальня. Фасад, двери, петли", "8 накладных дверей с ручками по месту, петли DTC Pivot Star с доводчиком: 160° на двух средних нижних дверях, 110° на остальных; кружки это чашки петель", parts["facade"], "front", 1600, 1920),
    ("03_vid_sboku.png", "Закладная спальня. Вид сбоку через секцию 2", "Стена, ХДФ 3, корпус 587, фальшпланка 16, итого 610; козырёк над ящиками, корзина, доска", parts["side"], "side", 600, 2080),
]
os.makedirs(OUTDIR, exist_ok=True)
made = []
for fn, title, sub, svg, cls, w, h in PAGES:
    html_path = os.path.join(OUTDIR, fn.replace(".png", ".html"))
    open(html_path, "w", encoding="utf-8").write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="wrap {cls}"><h1>{title}</h1><p class="sub">{sub}</p>{svg}</div></body></html>')
    png = os.path.join(OUTDIR, fn)
    profile = os.path.join(OUTDIR, "_edge_profile")
    url = "file:///" + html_path.replace("\\", "/")
    for mode in ("--headless=new", "--headless"):
        cmd = [EDGE, mode, "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", f"--user-data-dir={profile}", f"--window-size={w},{h}", f"--screenshot={png}", url]
        res = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
        if os.path.exists(png) and os.path.getsize(png) > 1000:
            break
    made.append((fn, os.path.exists(png), os.path.getsize(png) if os.path.exists(png) else 0, res.returncode, (res.stderr or "")[-300:]))
for m in made: print(m)
