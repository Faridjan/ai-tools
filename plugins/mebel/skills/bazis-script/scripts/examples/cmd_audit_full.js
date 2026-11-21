// Сквозной аудит модели: пересечения, зазоры дверей и ящиков, наполнение в проёмах, полки, пазы, ХДФ, кромки.
const r = BZ.r, near = BZ.near;
const b6 = c => [c.GabMin.x, c.GabMax.x, c.GabMin.y, c.GabMax.y, c.GabMin.z, c.GabMax.z].map(r);
const out = { inspect: null, doors: [], drawers: [], filling: [], shelves: [], leds: [], hdf: [], edges: [], notes: [] };
try { const ins = BZ.inspect(); out.inspect = ins && ins.count !== undefined ? ins : (ins || 'n/a'); } catch (e) { out.inspect = 'ERR ' + e.message; }
const all = BZ.all();
const leaf = all.map(i => i.obj).filter(o => !o.List && BZ.panel(o));
const top = all.filter(i => i.depth === 0).map(i => i.obj);
const byName = re => leaf.filter(o => re.test(String(o.Name)));

// ---- двери: зазоры между собой, до цоколя, до планки, до фальшпланок
const doors = byName(/^ШС - Дверь/).sort((a, b) => a.GabMin.y - b.GabMin.y || a.GabMin.x - b.GabMin.x);
for (const d of doors) {
  const g = b6(d);
  const nb = doors.filter(o => o !== d && Math.abs(o.GabMin.y - d.GabMin.y) < 5).map(o => o.GabMin.x > d.GabMax.x ? r(o.GabMin.x - d.GabMax.x) : (o.GabMax.x < d.GabMin.x ? r(d.GabMin.x - o.GabMax.x) : 'нахлёст'));
  out.doors.push(String(d.Name).replace('ШС - ', '') + ' ' + g[0] + '..' + g[1] + ' x ' + g[2] + '..' + g[3] + ' | толщина ' + r(g[5] - g[4]) + ' | зазоры по бокам ' + nb.join('/'));
}
const dmaxY = Math.max(...doors.map(o => o.GabMax.y));
out.notes.push('верх дверей ' + r(dmaxY) + ', потолочная планка на 3033: зазор ' + r(3033 - dmaxY));
const dminY = Math.min(...doors.map(o => o.GabMin.y));
const plinth = byName(/Цоколь видимый/)[0];
if (plinth) out.notes.push('низ дверей ' + r(dminY) + ', верх цоколя ' + r(plinth.GabMax.y) + ': зазор ' + r(dminY - plinth.GabMax.y));

// ---- ящики: фасад против проёма, короб, направляющие
for (const blk of all.filter(i => i.depth === 0 && /^Ящик выдвижной/.test(String(i.obj.Name))).map(i => i.obj)) {
  const kids = BZ.all(blk);
  const fac = kids.find(s => /^ШС - Ящик фасад/.test(String(s.obj.Name)));
  const box = kids.find(s => /^Короб ящика$/.test(String(s.obj.Name)));
  const rail = kids.find(s => s.obj.List && /Комплект направляющих/.test(String(s.obj.Name)));
  if (!fac) continue;
  const f = b6(fac.obj), bx = box ? b6(box.obj) : null;
  out.drawers.push(String(blk.Name) + ' | фасад ' + r(f[1] - f[0]) + 'x' + r(f[3] - f[2]) + ' @y ' + f[2] + '..' + f[3] + ' z ' + f[4] + '..' + f[5] + (bx ? ' | короб ' + r(bx[1] - bx[0]) + ' глуб ' + r(bx[5] - bx[4]) : '') + (rail ? ' | направляющие ' + b6(rail.obj).join(',') : ''));
}

// ---- наполнение GTV и доска: габариты и свободные зоны
for (const o of top) {
  const n = String(o.Name).replace(/\r.*/, '');
  if (!/GTV|Пантограф|Гладильная|IB1135|SMART/.test(n)) continue;
  const g = b6(o);
  out.filling.push(n.slice(0, 46) + ' | x ' + g[0] + '..' + g[1] + ' (' + r(g[1] - g[0]) + ') | y ' + g[2] + '..' + g[3] + ' | z ' + g[4] + '..' + g[5]);
}

// ---- полки: пролёт и глубина
for (const o of byName(/^ШС - Полка$/)) {
  const g = b6(o); const span = r(g[1] - g[0]), dep = r(g[5] - g[4]);
  out.shelves.push('полка y' + g[2] + ' x ' + g[0] + '..' + g[1] + ' | пролёт ' + span + ' | глубина ' + dep + (span > 620 ? ' | ВНИМАНИЕ: пролёт больше 620 при ЛДСП 16' : ''));
}

// ---- пазы LED: где и не задевают ли отверстия крепежа
const holes = [];
for (const it of all) { const o = it.obj; if (o.List) continue; let H = null; try { H = o.Holes; } catch (e) { continue; } if (!H || !H.Count) continue; for (let j = 0; j < H.Count; j++) { const h = H[j]; if (!h || h.Diameter < 6) continue; let g = null; try { g = o.ToGlobal(h.Position); } catch (e) { g = h.Position; } holes.push({ d: r(h.Diameter), g }); } }
for (const o of leaf) {
  const p = BZ.panel(o); const cuts = BZ.cuts(p).filter(c => /LED/.test(c.name)); if (!cuts.length) continue;
  const g = b6(o);
  const near6 = holes.filter(h => Math.abs(h.g.x - (g[0] + g[1]) / 2) < 20 && h.g.y >= g[2] - 5 && h.g.y <= g[3] + 5).length;
  out.leds.push(String(o.Name).replace('ШС - ', '') + ' x' + g[0] + ' | пазов ' + cuts.length + ' | отверстий Ø6+ на этой панели рядом ' + near6);
}

// ---- ХДФ против корпуса
for (const o of byName(/Задняя стенка|ХДФ/)) { const g = b6(o); out.hdf.push(String(o.Name).replace('ШС - ', '') + ' ' + r(g[1] - g[0]) + 'x' + r(g[3] - g[2]) + ' @z ' + g[4] + '..' + g[5]); }

// ---- кромки: видимые торцы без кромки
const needEdge = [];
for (const o of leaf) {
  const n = String(o.Name).replace(/\r.*/, ''); const p = BZ.panel(o); const bt = BZ.butts(p);
  if (/Подложка|Задняя стенка|Дно ящ/.test(n)) continue;
  if (!bt.length) needEdge.push(n + ' ' + b6(o).slice(0, 4).join(',') + ' — без кромки');
}
out.edges = needEdge.slice(0, 12);
out.counts = { панелей: leaf.length, дверей: doors.length, полок: byName(/^ШС - Полка$/).length, отверстийØ6плюс: holes.length };
out;
