// Шестая петля на две широкие нижние двери (680 x 2343, ~18 кг): 5 петель по нагрузке проходят,
// но шаг 550 мм для полотна такой ширины великоват — перекладываем на 6 с шагом ~430,
// обходя направляющие брючниц (секция 1: y 1045..1120, секция 4: y 605..680).
// Модель НЕ сохраняется здесь.
const r = BZ.r, near = BZ.near;
const H110 = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\Фрагменты\\Петли\\ClickLine\\Петля Clickline, 90°_110°, накладная, H02, Firmax.fr3d';
const out = { removed: [], added: [], bad: [] };
if (!BZ.fs.existsSync(H110)) { out.bad.push('нет файла петли'); out; } else {
  const leaf = BZ.all().map(i => i.obj);
  const door1 = leaf.find(o => /^ШС - Дверь секция 1$/.test(String(o.Name).replace(/\r[\s\S]*/, '').trim()));
  const door4 = leaf.find(o => /^ШС - Дверь секция 4$/.test(String(o.Name).replace(/\r[\s\S]*/, '').trim()));
  const post1 = leaf.find(o => BZ.panel(o) && !o.List && /^ШС - Стойка$/.test(String(o.Name).replace(/\r[\s\S]*/, '').trim()) && near(o.GabMin.x, 28, 0.6) && o.GabMax.y < 2440);
  const post4 = leaf.find(o => BZ.panel(o) && !o.List && /^ШС - Стойка$/.test(String(o.Name).replace(/\r[\s\S]*/, '').trim()) && near(o.GabMin.x, 2556, 0.6) && o.GabMax.y < 2440);
  const JOBS = [
    { name: 'секция 1', door: door1, post: post1, x: 44, cx: 53.25, ys: [188, 617, 990, 1475, 1904, 2331] },
    { name: 'секция 4', door: door4, post: post4, x: 2556, cx: 2546.75, ys: [188, 560, 1046, 1475, 1904, 2331] }
  ];
  for (const j of JOBS) {
    if (!j.door || !j.post) { out.bad.push(j.name + ': не найдена ' + (j.door ? 'стойка' : 'дверь')); continue; }
    // снять существующие петли этой двери (нижний ярус)
    const tops = BZ.all().filter(it => it.depth === 0).map(it => it.obj);
    const old = tops.filter(o => /Петля Clickline/.test(String(o.Name)) &&
      near((o.GabMin.x + o.GabMax.x) / 2, j.cx, 6) && o.GabMax.y < 2433);
    for (const o of old) { try { BZ.changing(o); DeleteObject(o); out.removed.push(j.name + ' y' + r((o.GabMin.y + o.GabMax.y) / 2)); } catch (e) { out.bad.push('del ' + e.message); } }
    for (const y of j.ys) {
      let o = null;
      try { o = OpenFurniture(H110).Mount(BZ.panel(j.post), BZ.panel(j.door), j.x, y, 594); } catch (e) { out.bad.push(j.name + ' y' + y + ': ' + e.message); continue; }
      if (o) out.added.push(j.name + ' y' + y); else out.bad.push(j.name + ' y' + y + ': Mount вернул null');
    }
  }
  out.size = BZ.bounds().size.map(r).join('x');
  out;
}
