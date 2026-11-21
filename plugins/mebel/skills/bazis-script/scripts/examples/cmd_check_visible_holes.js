// Ревизия присадки: с какой пласти заходит каждое отверстие крепежа и видна ли эта поверхность.
// Скрытыми считаем: наружные пласти крайних стоек (к стене), низ дна (за цоколем), стык крышки нижнего короба
// и дна антресоли, верх крышки антресоли (под потолочной планкой), наружные пласти правого/левого короба в стыке.
const near = BZ.near, r = BZ.r;
const FAST = /Стяжка-евровинт|^Эксцентрик|^Шток эксцентрика|^Шкант мебельный|Стяжка межсекционная|Полкодержатель|Планка монтажная|Петля Clickline|Firmax Clickline/;
const panels = BZ.all().map(i => i.obj).filter(o => !o.List && BZ.panel(o));
// [regex имени панели, ось, координата грани] — эти поверхности не видны в собранном шкафу
const HIDDEN = [
  [/^ШС - Стойка$/, 'x', 28], [/^ШС - Стойка$/, 'x', 2572],
  [/^ШС - Стойка антресоли$/, 'x', 28], [/^ШС - Стойка антресоли$/, 'x', 2572],
  [/^ШС - Стойка$/, 'x', 1300], [/^ШС - Стойка$/, 'x', 1300],
  [/^ШС - Дно$/, 'y', 80], [/^ШС - Крышка$/, 'y', 2433], [/^ШС - Дно антресоли$/, 'y', 2433],
  [/^ШС - Крышка антресоли$/, 'y', 3030], [/^ШС - Цоколь$/, 'y', 0], [/^ШС - Цоколь$/, 'z', 594],
  [/Подложка/, 'z', 594], [/Подложка/, 'z', 610],
];
function faceOf(g) {
  for (const p of panels) {
    const a = p.GabMin, b = p.GabMax;
    const inX = g.x >= a.x - 1 && g.x <= b.x + 1, inY = g.y >= a.y - 1 && g.y <= b.y + 1, inZ = g.z >= a.z - 1 && g.z <= b.z + 1;
    if (!(inX && inY && inZ)) continue;
    for (const [ax, lo, hi] of [['x', a.x, b.x], ['y', a.y, b.y], ['z', a.z, b.z]]) {
      if (near(g[ax], lo, 0.8)) return { p, ax, co: r(lo) };
      if (near(g[ax], hi, 0.8)) return { p, ax, co: r(hi) };
    }
  }
  return null;
}
const isHidden = (name, ax, co) => HIDDEN.some(([re, a, c]) => re.test(name) && a === ax && near(co, c, 1));
const visible = {}, hidden = {}, unknown = [];
for (const it of BZ.all()) {
  const o = it.obj; if (o.List) continue;
  const nm = String(o.Name).replace(/\r.*/, '');
  if (!FAST.test(nm)) continue;
  let H = null; try { H = o.Holes; } catch (e) { continue; }
  if (!H || !H.Count) continue;
  for (let j = 0; j < H.Count; j++) {
    let h = null; try { h = H[j]; } catch (e) {} if (!h) continue;
    const d = r(h.Diameter); if (d < 6) continue; // мелкие саморезные отверстия не считаем
    let g = null; try { g = o.ToGlobal(h.Position); } catch (e) { g = h.Position; }
    const f = faceOf(g);
    if (!f) { unknown.push(nm.slice(0, 28) + ' d' + d + ' @' + [g.x, g.y, g.z].map(r).join(',')); continue; }
    const pn = String(f.p.Name).replace(/\r.*/, '');
    const key = pn + ' | ' + f.ax + '=' + f.co + ' | Ø' + d;
    if (isHidden(pn, f.ax, f.co)) hidden[key] = (hidden[key] || 0) + 1;
    else visible[key] = (visible[key] || 0) + 1;
  }
}
({ visible, hidden, unknownCount: unknown.length, unknown: unknown.slice(0, 10) });
