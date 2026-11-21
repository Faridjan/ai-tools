// Что из присадки реально просверлит станок ДСП Центра, а что останется размечать на месте.
// Лимиты производства: сквозные Ø3..20 и 60; глухие Ø3..35 глубиной 5..14; торцевые 4.5x37, 5x55, 8x55.
const r = BZ.r;
const out = { machinable: [], marksOnly: [], deepEnd: [], totals: {} };
const mach = {}, mark = {}, endh = {};
let nM = 0, nK = 0, nE = 0;
for (const it of BZ.all()) {
  const o = it.obj;
  let H = null; try { H = o.Holes; } catch (e) {}
  if (!H || !H.Count) continue;
  const nm = String(o.Name).replace(/\r[\s\S]*/, '').trim().slice(0, 34);
  for (let j = 0; j < H.Count; j++) {
    const h = H[j]; if (!h) continue;
    const d = r(h.Diameter), dp = r(h.Depth);
    const key = nm + ' Ø' + d + 'x' + dp;
    if (dp > 20) { endh[key] = (endh[key] || 0) + 1; nE++; }           // торцевые под стяжку/шток
    else if (dp >= 5 && d >= 3 && d <= 35) { mach[key] = (mach[key] || 0) + 1; nM++; }
    else { mark[key] = (mark[key] || 0) + 1; nK++; }                    // глубина < 5 = метка, станок не берёт
  }
}
const fmt = obj => Object.keys(obj).sort().map(k => k + ' — ' + obj[k] + ' шт');
out.machinable = fmt(mach);
out.marksOnly = fmt(mark);
out.deepEnd = fmt(endh);
out.totals = { 'станок, пласть': nM, 'торцевые/глубокие': nE, 'метки <5 мм': nK, 'всего': nM + nE + nK };
out;
