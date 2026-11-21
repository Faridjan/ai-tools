// Перевод на фурнитуру из каталога ДСП Центра (модель НЕ сохраняется, сохранение отдельной командой):
// 1) ящики: Firmax 3D-Control с толк. NL500 + фиксаторы -> DTC D-Motion Push-to-Open 500 (к покупке DF10500H + штанга HT0FH02), короба и фасады прежние;
// 2) FLIPPER 2574 20 + штоки 2574 36 -> полкодержатель Ø5 (модель "Полкодержатель D5", к покупке Hafele 282.24.720 со штырём в полку).
const FK = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\Фрагменты\\ТБМ DTC D-Motion\\Комплект направляющих Push-to-Open скрытого монтажа DTC D-Motion, L=500мм, полного выдвижения.fr3d';
const D5 = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\Фурнитура\\Полкодержатели\\Полкодержатель D5 никель.f3d';
if (!BZ.fs.existsSync(FK) || !BZ.fs.existsSync(D5)) throw new Error('нет файлов фурнитуры');
const b6 = c => [c.GabMin.x, c.GabMax.x, c.GabMin.y, c.GabMax.y, c.GabMin.z, c.GabMax.z].map(BZ.r).join(' ');
const out = { drawers: [], shelf: [], bad: [] };

// ---------- 1. ящики ----------
const blocks = BZ.all().filter(i => i.depth === 0 && /^Ящик выдвижной/.test(String(i.obj.Name))).map(i => i.obj);
if (blocks.length !== 6) throw new Error('ожидал 6 ящиков, нашёл ' + blocks.length);
for (const blk of blocks) {
  const items = BZ.all(blk);
  const rails = items.find(s => /^Направляющие 3D-Control с толк/.test(String(s.obj.Name)));
  const fix = items.find(s => /^Фиксаторы передние 3D Control/.test(String(s.obj.Name)));
  const kitList = items.find(s => /^Ящик 3D-Control с толк/.test(String(s.obj.Name)));
  if (!rails) { out.bad.push(blk.Name + ': нет направляющих Firmax'); continue; }
  const r = rails.obj;
  const x0 = r.GabMin.x + 2, x1 = r.GabMax.x - 2, y0 = r.GabMin.y, zf = r.GabMax.z;
  const ownerOfRails = rails.owner;
  let kit = null;
  try {
    kit = OpenFurniture(FK).MountBox(V(x0, y0, zf), V(x1 - x0, 47, 500), AxisZ, AxisY);
  } catch (e) { out.bad.push(blk.Name + ': DTC не встал ' + e.message); continue; }
  if (!kit) { out.bad.push(blk.Name + ': DTC Mount вернул null'); continue; }
  try { kit.Owner = ownerOfRails || blk; } catch (e) { out.bad.push(blk.Name + ': Owner ' + e.message); }
  try { DeleteObject(r); } catch (e) { out.bad.push(blk.Name + ': не удалил направляющие ' + e.message); }
  if (fix) try { DeleteObject(fix.obj); } catch (e) { out.bad.push(blk.Name + ': не удалил фиксаторы ' + e.message); }
  if (kitList) try { kitList.obj.Name = 'Ящик DTC D-Motion Push-to-Open 500, короб ЛДСП 16'; } catch (e) {}
  out.drawers.push(String(blk.Name) + ' | DTC ' + b6(kit) + ' | было ' + [x0 - 2, x1 + 2, y0, zf].map(BZ.r).join(' '));
}

// ---------- 2. полкодержатели ----------
const leaf = () => BZ.all().map(i => i.obj).filter(o => !o.List && BZ.panel(o));
const shelves = leaf().filter(o => /^ШС - Полка/.test(o.Name));
const sides = leaf().filter(o => /Стойка|Перегородка/.test(o.Name) && BZ.orient(o) === 'X' && o.GabMax.y - o.GabMin.y > 1500);
const flips = BZ.all().filter(i => i.depth === 0 && /^FLIPPER Полкодержатель/.test(String(i.obj.Name))).map(i => i.obj);
const toks = BZ.all().filter(i => i.depth === 0 && /^Шток для полкодержателя FLIPPER/.test(String(i.obj.Name))).map(i => i.obj);
const plan = [];
for (const f of flips) {
  const cx = (f.GabMin.x + f.GabMax.x) / 2, cz = (f.GabMin.z + f.GabMax.z) / 2, yb = f.GabMin.y + 1.3;
  const sh = shelves.find(s => cx >= s.GabMin.x - 20 && cx <= s.GabMax.x + 20 && Math.abs(yb - s.GabMin.y) < 3);
  if (!sh) { out.bad.push('FLIPPER ' + b6(f) + ': нет полки'); continue; }
  const leftEnd = Math.abs(cx - sh.GabMin.x) < Math.abs(cx - sh.GabMax.x);
  const face = leftEnd ? sh.GabMin.x - 1 : sh.GabMax.x + 1;
  const sd = sides.find(s => leftEnd ? Math.abs(s.GabMax.x - face) < 3 : Math.abs(s.GabMin.x - face) < 3);
  if (!sd) { out.bad.push('FLIPPER ' + b6(f) + ': нет стойки у ' + BZ.r(face)); continue; }
  plan.push({ f, sh, sd, x: leftEnd ? sd.GabMax.x : sd.GabMin.x, y: sh.GabMin.y, z: Math.round(cz) });
}
if (plan.length !== flips.length) out.bad.push('план полкодержателей ' + plan.length + ' из ' + flips.length);
const mounted = [];
for (const p of plan) {
  let m = null;
  try { m = OpenFurniture(D5).Mount(BZ.panel(p.sh), BZ.panel(p.sd), p.x, p.y, p.z); } catch (e) { out.bad.push('D5 ' + e.message); }
  if (!m) { out.bad.push('D5 не встал у ' + [p.x, p.y, p.z].map(BZ.r).join(',')); continue; }
  try { m.Name = 'Полкодержатель Ø5 со штырём в полку (к покупке Hafele 282.24.720)'; } catch (e) {}
  mounted.push(m);
  out.shelf.push(b6(m) + ' | полка ' + BZ.r(p.y) + ' стойка ' + BZ.r(p.sd.GabMin.x));
}
if (mounted.length === flips.length) {
  for (const o of flips.concat(toks)) try { DeleteObject(o); } catch (e) { out.bad.push('не удалил FLIPPER ' + e.message); }
} else out.bad.push('FLIPPER НЕ удалены: встало ' + mounted.length + ' из ' + flips.length);
out.shelf = out.shelf.slice(0, 6).concat(['... всего ' + out.shelf.length]);
out;
