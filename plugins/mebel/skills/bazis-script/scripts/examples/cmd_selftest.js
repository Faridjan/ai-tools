// Самотест агента и lib.js v4: движок, дамп, роли, секции, материалы, units, спецификация, инспектор, обратимый сдвиг.
// Запуск: bz.ps1 -File C:\Users\Jarvis\Documents\Bazis11\_claude\cmd_selftest.js
if (BZ.VERSION < 4) throw new Error('загружен lib.js v' + BZ.VERSION + ', сначала выполнить BZ.reload()');
const out = { caps: BZ.caps() };
log('кириллица в команде работает');
const d = BZ.dump('dump.json');
out.count = d.count;
out.bounds = d.panelsBounds.size;
const roles = {};
for (const o of d.objects) if (o.role) roles[o.role] = (roles[o.role] || 0) + 1;
out.roles = roles;
out.sections = BZ.sections();
const mats = BZ.materials();
out.materials = mats.sheets.map(m => m.name + ' | ' + m.code + ' | t=' + m.t + ' | x' + m.panels);
out.edges = mats.edges.map(m => m.name + ' | ' + m.code + ' | t=' + m.t + ' | x' + m.edges);
out.specRows = BZ.spec('spec.csv').length;
out.inspect = BZ.inspect();
const nested = BZ.find((o, path) => path.indexOf('/') > 0);
out.units = { nestedParts: nested.length, units: BZ.units(nested).length };
out.snapshotSelfDiff = BZ.diff(BZ.snapshot(), BZ.snapshot()).length;   // должно быть 0
const sh = BZ.byRole('shelf')[0];
if (sh) {
  const y0 = sh.GabMin.y;
  BZ.move(sh, 0, 5, 0);
  const y1 = sh.GabMin.y;
  BZ.move(sh, 0, -5, 0);
  out.moveTest = { name: sh.Name, y0, y1, back: sh.GabMin.y, ok: Math.abs(y1 - y0 - 5) < 0.01 && Math.abs(sh.GabMin.y - y0) < 0.01 };
}
out;
