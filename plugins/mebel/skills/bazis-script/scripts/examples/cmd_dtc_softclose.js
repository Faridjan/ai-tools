// Ящики: DTC D-Motion Push-to-Open 500 (со штангой) -> DTC D-Motion Soft-Close 500 (DS10500H), на тех же местах.
// Положение нового комплекта выравнивается по направляющей: тот же левый край, низ и фронт, что у старой. Модель НЕ сохраняется.
const FS = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\Фрагменты\\ТБМ DTC D-Motion\\Комплект направляющих Soft-Close скрытого монтажа DTC D-Motion, L=500мм, полного выдвижения.fr3d';
if (!BZ.fs.existsSync(FS)) throw new Error('нет комплекта Soft-Close');
const b6 = c => [c.GabMin.x, c.GabMax.x, c.GabMin.y, c.GabMax.y, c.GabMin.z, c.GabMax.z].map(BZ.r).join(' ');
const out = { done: [], bad: [] };
const blocks = BZ.all().filter(i => i.depth === 0 && /^Ящик выдвижной/.test(String(i.obj.Name))).map(i => i.obj);
for (const blk of blocks) {
  const items = BZ.all(blk);
  const old = items.find(s => s.obj.List && /^Комплект направляющих Push-to-Open скрытого монтажа DTC/.test(String(s.obj.Name)));
  if (!old) { out.bad.push(blk.Name + ': нет Push-комплекта'); continue; }
  const rails = BZ.all(old.obj).filter(s => !s.obj.List && /^Направляющая .*DTC D-Motion/.test(String(s.obj.Name))).map(s => s.obj);
  if (rails.length !== 2) { out.bad.push(blk.Name + ': направляющих ' + rails.length); continue; }
  const rx0 = Math.min(rails[0].GabMin.x, rails[1].GabMin.x), rx1 = Math.max(rails[0].GabMax.x, rails[1].GabMax.x);
  const ry0 = rails[0].GabMin.y, rz1 = rails[0].GabMax.z;
  const owner = old.owner;
  let kit = null;
  try { kit = OpenFurniture(FS).MountBox(V(rx0, ry0, rz1), V(rx1 - rx0, 47, 500), AxisZ, AxisY); } catch (e) { out.bad.push(blk.Name + ': ' + e.message); continue; }
  if (!kit) { out.bad.push(blk.Name + ': Mount null'); continue; }
  try { kit.Owner = owner || blk; } catch (e) { out.bad.push(blk.Name + ': Owner ' + e.message); }
  const nr = BZ.all(kit).filter(s => !s.obj.List && /^Направляющая .*DTC D-Motion/.test(String(s.obj.Name))).map(s => s.obj);
  if (nr.length !== 2) { out.bad.push(blk.Name + ': новых направляющих ' + nr.length); }
  else {
    const nx0 = Math.min(nr[0].GabMin.x, nr[1].GabMin.x);
    BZ.move(kit, rx0 - nx0, ry0 - nr[0].GabMin.y, rz1 - nr[0].GabMax.z);
  }
  try { DeleteObject(old.obj); } catch (e) { out.bad.push(blk.Name + ': не удалил Push ' + e.message); }
  const kl = BZ.all(blk).find(s => /^Ящик DTC D-Motion Push/.test(String(s.obj.Name)));
  if (kl) try { kl.obj.Name = 'Ящик DTC D-Motion Soft-Close 500 (DS10500H), короб ЛДСП 16'; } catch (e) {}
  const nr2 = BZ.all(kit).filter(s => !s.obj.List && /^Направляющая .*DTC D-Motion/.test(String(s.obj.Name))).map(s => b6(s.obj));
  out.done.push(String(blk.Name) + ' | было ' + [rx0, rx1, ry0, rz1].map(BZ.r).join(' ') + ' | стало ' + nr2.join(' ; ') + ' | части ' + [...new Set(BZ.all(kit).map(s => String(s.obj.Name).slice(0, 25)))].join(', '));
}
out.leftPush = BZ.all().filter(i => /Push-to-Open скрытого монтажа DTC|Штанга для стабилизации/.test(String(i.obj.Name))).length;
out.model = BZ.bounds().size.map(BZ.r).join('x');
out;
