// Точечная правка осей пазов под LED по пластям:
//  - пласти, смотрящие в секции с ящиками (722 и 1316), должны иметь ось 488: метки направляющих DTC стоят на z=503,
//    при оси 500 паз 494..506 их накрывает, при оси 488 зона 482..494 даёт зазор 9 мм;
//  - на перегородке 706..722 противоположную пласть 706 уводим на 500, чтобы два паза не оказались друг напротив друга;
//  - то же самое повторяем в антресоли, чтобы линии света совпадали по вертикали.
// Модель НЕ сохраняется здесь.
const r = BZ.r, near = BZ.near;
// [regex имени, GabMin.x панели, координата пласти, новая ось]
const PLAN = [
  [/^ШС - Стойка$/, 1300, 1316, 488],
  [/^ШС - Стойка антресоли$/, 1300, 1316, 488],
  [/^ШС - Перегородка$/, 706, 722, 488],
  [/^ШС - Перегородка$/, 706, 706, 500],
  [/^ШС - Перегородка антресоли$/, 706, 722, 488],
  [/^ШС - Перегородка антресоли$/, 706, 706, 500],
];
const out = { moved: [], skipped: [], bad: [] };
const leaf = BZ.all().map(i => i.obj).filter(o => !o.List && BZ.panel(o));
for (const [re, xmin, faceX, want] of PLAN) {
  const o = leaf.find(p => re.test(String(p.Name)) && near(p.GabMin.x, xmin, 0.6));
  if (!o) { out.bad.push(re + ' x' + xmin + ': панель не найдена'); continue; }
  const p = BZ.panel(o), C = p.Cuts, t = r(p.Thickness);
  const face0 = r(o.ToGlobal(V(0, 0, 0)).x), faceT = r(o.ToGlobal(V(0, 0, p.Thickness)).x);
  const gy = (o.GabMin.y + o.GabMax.y) / 2, gx = o.GabMin.x;
  const A0 = o.ToObject(V(gx, gy, 400)), A1 = o.ToObject(V(gx, gy, 600));
  const ax = { x: A1.x - A0.x, y: A1.y - A0.y }, len2 = ax.x * ax.x + ax.y * ax.y;
  let done = false;
  for (let i = 0; i < C.Count && !done; i++) {
    const cut = C.Cuts ? C.Cuts[i] : C[i];
    if (!cut || !/LED/.test(String(cut.Name))) continue;
    const el = cut.Trajectory.Objects ? cut.Trajectory.Objects[0] : cut.Trajectory[0];
    const ln = el && typeof el.AsLine === 'function' ? el.AsLine() : el;
    if (!ln || !ln.Pos1) continue;
    let fromZero = true;
    try { const mn = cut.Contour.Min, mx = cut.Contour.Max; fromZero = Math.abs(mn.y) < Math.abs(mx.y - t); } catch (e) {}
    const face = fromZero ? face0 : faceT;
    if (!near(face, faceX, 1.2)) continue;
    const tpar = ((ln.Pos1.x - A0.x) * ax.x + (ln.Pos1.y - A0.y) * ax.y) / len2;
    const zc = r(400 + tpar * 200);
    if (near(zc, want, 0.6)) { out.skipped.push(String(o.Name).replace('ШС - ', '') + ' пласть ' + faceX + ': уже ' + want); done = true; continue; }
    const B1 = o.ToObject(V(gx, gy, zc)), B2 = o.ToObject(V(gx, gy, want));
    BZ.changing(o);
    cut.Trajectory.Move(B2.x - B1.x, B2.y - B1.y);
    try { o.Build(); } catch (e) {}
    out.moved.push(String(o.Name).replace('ШС - ', '') + ' пласть ' + faceX + ': ось ' + zc + ' -> ' + want);
    done = true;
  }
  if (!done) out.bad.push(String(o.Name) + ' пласть ' + faceX + ': паз не найден');
}
out.model = BZ.bounds().size.map(r).join('x');
out;
