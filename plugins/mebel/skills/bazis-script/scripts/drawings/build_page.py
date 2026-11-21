# -*- coding: utf-8 -*-
import json, sys
parts = json.load(open(r"C:\Users\Jarvis\Documents\Bazis11\_claude\elevation.svg.html", encoding="utf-8"))
tpl = open(r"C:\Users\Jarvis\Documents\Bazis11\_claude\page_template.html", encoding="utf-8").read()
out = tpl.replace("{{FRONT}}", parts["front"]).replace("{{SIDE}}", parts["side"]).replace("{{TABLES}}", parts["tables"]).replace("{{FACADE}}", parts.get("facade", ""))
dst = sys.argv[1]
open(dst, "w", encoding="utf-8").write(out)
print("written", dst, len(out))
