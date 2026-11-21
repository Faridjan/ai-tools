// Финальная проверка пазов: учитываем, с какой ПЛАСТИ идёт паз и с какой пласти заходит отверстие.
// Конфликт = отверстие на той же пласти в зоне паза, либо сквозное отверстие в зоне паза.
const r = BZ.r, near = BZ.near;
const out = { cuts: [], conflicts: [], near: [] };
const all = BZ.all();
const leaf = all.map(i => i.obj).filter(o => !o.List && BZ.panel(o));
const holes = [];
for (const it of all) {
  const o = it.obj; if (o.List) continue;
  let H = null; try { H = o.Holes; } catch (e) { continue; }
  if (!H || !H.Count) continue;
  for (let j = 0; j < H.Count; j++) {
    const h = H[j]; if (!h) continue;
    let g = null; try { g = o.ToGlobal(h.Position); } catch (e) { g = h.Position; }
    holes.push({ name: String(o.Name).replace(/\r.*/, '').slice(0, 26), d: r(h.Diameter), depth: r(h.Depth), x: r(g.x), y: r(g.y), z: r(g.z) });
  }
}
for (const o of leaf) {
  const p = BZ.panel(o); const C = p.Cuts; if (!C || !C.Count) continue;
  if (BZ.orient(o) !== 'X') continue;
  const t = r(p.Thickness);
  const face0 = r(o.ToGlobal(V(0, 0, 0)).x), faceT = r(o.ToGlobal(V(0, 0, p.Thickness)).x);
  const gy = (o.GabMin.y + o.GabMax.y) / 2, gx = o.GabMin.x;
  const A0 = o.ToObject(V(gx, gy, 400)), A1 = o.ToObject(V(gx, gy, 600));
  const ax = { x: A1.x - A0.x, y: A1.y - A0.y }, len2 = ax.x * ax.x + ax.y * ax.y;
  for (let i = 0; i < C.Count; i++) {
    const cut = C.Cuts ? C.Cuts[i] : C[i];
    if (!cut || !/LED/.test(String(cut.Name))) continue;
    const el = cut.Trajectory.Objects ? cut.Trajectory.Objects[0] : cut.Trajectory[0];
    const ln = el && typeof el.AsLine === 'function' ? el.AsLine() : el;
    if (!ln || !ln.Pos1) continue;
    const tpar = ((ln.Pos1.x - A0.x) * ax.x + (ln.Pos1.y - A0.y) * ax.y) / len2;
    const zc = r(400 + tpar * 200);
    let fromZero = true;
    try { const mn = cut.Contour.Min, mx = cut.Contour.Max; fromZero = Math.abs(mn.y) < Math.abs(mx.y - t); } catch (e) {}
    const face = fromZero ? face0 : faceT;
    out.cuts.push(String(o.Name).replace('ШС - ', '') + ' панель ' + r(o.GabMin.x) + '..' + r(o.GabMax.x) + ': паз с пласти ' + face + ', ось ' + zc);
    const inPanel = h => h.x >= o.GabMin.x - 2 && h.x <= o.GabMax.x + 2 && h.y >= o.GabMin.y - 2 && h.y <= o.GabMax.y + 2;
    for (const h of holes.filter(inPanel)) {
      const sameFace = near(h.x, face, 1.2);
      const through = h.depth >= t - 1;
      const dz = Math.abs(h.z - zc);
      if ((sameFace || through) && dz <= 6) out.conflicts.push(String(o.Name).replace('ШС - ', '') + ' пласть ' + face + ' ось ' + zc + ': ' + h.name + ' Ø' + h.d + 'x' + h.depth + ' @z' + h.z + ' y' + h.y + (through ? ' (сквозное)' : ''));
      else if ((sameFace || through) && dz < 18) out.near.push(String(o.Name).replace('ШС - ', '') + ' пласть ' + face + ' ось ' + zc + ': ' + h.name + ' Ø' + h.d + ' z' + h.z + ' зазор ' + r(dz - 6));
    }
  }
}
out.near = [...new Set(out.near)].slice(0, 12);
out.summary = 'пазов ' + out.cuts.length + ', конфликтов ' + out.conflicts.length;
out;
