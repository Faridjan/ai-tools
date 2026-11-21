// Полная спецификация: панели (BZ.spec), длины кромки, площади по материалам, фурнитура и крепёж по артикулам
const rows = BZ.spec('spec_panels.csv');
const near = BZ.near;
// длина кромки по каждому торцу: суммируем длины элементов контура с кромкой
const edge = {}; let edgeTotal = 0;
const panelArea = {};
for (const it of BZ.all()) {
  const o = it.obj; if (o.List) continue; const p = BZ.panel(o); if (!p) continue;
  const mat = p.MaterialName.split('\r')[0];
  if (/^ШС - |^Бок ящ|^Зад\. ст|^Дно ящ/.test(o.Name)) {
    const a = p.ContourWidth * p.ContourHeight / 1e6; panelArea[mat] = (panelArea[mat] || 0) + a;
    const c = p.Contour, B = p.Butts;
    for (let i = 0; i < B.Count; i++) {
      const b = B.Butts ? B.Butts[i] : B[i]; const e = c[b.ElemIndex] !== undefined ? c[b.ElemIndex] : c.Objects[b.ElemIndex]; const l = typeof e.AsLine === 'function' ? e.AsLine() : e;
      if (!l || !l.Pos1) continue; const len = Math.sqrt(Math.pow(l.Pos2.x - l.Pos1.x, 2) + Math.pow(l.Pos2.y - l.Pos1.y, 2));
      const key = b.Material.split('\r')[0] + ' ' + b.Thickness; edge[key] = (edge[key] || 0) + len; edgeTotal += len;
    }
  }
}
// фурнитура: верхние блоки и крепёж
const top = BZ.all().filter(it => it.depth === 0).map(it => it.obj);
const hw = {};
const add = (k, n) => { hw[k] = (hw[k] || 0) + (n || 1); };
for (const o of top) {
  const n = o.Name, art = (n.split('\r')[1] || '').trim(), base = n.split('\r')[0];
  if (/^ШС - |Габаритная рамка|^Наполнение|^Дверь распашная/.test(base)) continue;
  if (/^Ящик выдвижной/.test(base)) { add('Направляющие DTC D-Motion 500 скрытого монтажа с доводчиком, полного выдвижения, 35 кг, 3D-замок, комплект | DS10500H'); continue; }
  if (/^Полкодержатель со штырём в полку/.test(base)) { add('Полкодержатель Hafele со штырём в полку, отверстие 5, сверлится станком | 282.24.720'); continue; }
  if (/Корзина ажурная SMART/.test(base)) { add('Корзина ажурная GTV SMART 600, белая, без направляющих | W-WKO60-BP-10'); add('Направляющие шариковые GTV Versalite Plus H45 450 с доводчиком, комплект 2 шт | PK-L-H45-450'); continue; }
  if (/Вешалка для брюк SMART/.test(base)) { add('Брючница GTV SMART 700, белая, без направляющих | W-WSPD70-BP-10'); add('Направляющие шариковые GTV Versalite Plus H45 450 с доводчиком, комплект 2 шт | PK-L-H45-450'); continue; }
  if (/Вешалка для ремней/.test(base)) { add('Вешалка для ремней и галстуков GTV SMART L, белая | W-WKRP-BP-10'); add('Направляющая шариковая GTV Versalite Plus H45 450, 1 шт | PK-L-H45-450'); continue; }
  if (/^Пантограф/.test(base)) { add('Пантограф GTV PG-ST стальной с масляным амортизатором, 545..700, белый/хром | PG-ST4560-10'); continue; }
  if (/FRM5812/.test(base)) { add('Гладильная доска поворотно-выдвижная Firmax 300x430x140, белая рама (3D в модели: аналог МДМ IB1135) | FRM5812.430'); continue; }
  if (/Петля Clickline/.test(base)) { add((/165/.test(base) && (o.GabMin.y + o.GabMax.y) / 2 < 2433) ? 'Петля DTC Pivot Star New 160° накладная с доводчиком, средние двери у ящиков (в каталоге ДСП Центра нет) | C81A805FAB' : 'Петля DTC Pivot Star New 110° накладная с доводчиком | C81A875FAB'); add('Планка монтажная DTC Pivot Star, H=2, два отверстия | 81H20AQA'); continue; }
  if (/[Тт]олкатель регулируемый/.test(base)) { add('Толкатель push-to-open накладной магнитный с адаптером (3D: AQ 09.0020+09.0019, к покупке GTV или Firmax) | push'); continue; }
  if (/KON 7,0/.test(n)) { add('Конфирмат 6,3x50 (в модели KON 7x50, присадка та же) | 1501001'); continue; }
  if (/Эксцентрик, Permo/.test(base)) { add('Минификс-стяжка: эксцентрик 15 + шток, комплект (козырьки к перегородкам) | Минификс'); continue; }
  if (/Шток эксцентрика/.test(base)) { continue; }
  if (/Шкант мебельный/.test(base)) { add('Шкант 8x30 Hafele | 267.82.230'); continue; }
  if (/^FLIPPER/.test(base)) { add('Полкодержатель со стягиванием Italiana Ferramenta FLIPPER, прозрачный | 2574 20'); continue; }
  if (/Шток для полкодержателя FLIPPER/.test(base)) { add('Шток FLIPPER с евровинтом | 2574 36'); continue; }
  if (/Стяжка межсекционная \(винт\)/.test(base)) { add('Стяжка межсекционная для стоек 16+16, комплект винт+гайка (в заказе 108804, уточняется у менеджера) | 108804'); continue; }
  if (/Стяжка межсекционная \(гайка\)/.test(base)) { continue; }
  if (/Уголок монтажный/.test(base)) { add('Уголок L-образный белый для крепления к стене | Уголок L-обр'); continue; }
  add('ПРОЧЕЕ: ' + base.slice(0, 60) + (art ? ' | ' + art : ''));
}
// пазы под LED-ленту: суммарная длина
let ledLen = 0; const ledCuts = [];
for (const it of BZ.all()) { const o = it.obj; if (o.List) continue; const p = BZ.panel(o); if (!p) continue; for (const c of BZ.cuts(p)) if (/LED/.test(c.name)) { const len = /Полка/.test(o.Name) ? (o.GabMax.x - o.GabMin.x) : /антресоли/.test(o.Name) ? 565 : (/Стойка|Перегородка/.test(o.Name) ? ((near(o.GabMin.x, 1284, 1) || near(o.GabMin.x, 1300, 1) || (/Перегородка/.test(o.Name) && false)) ? 1533 : 2321) : 0); ledLen += len; ledCuts.push(o.Name.replace('ШС - ', '') + ' ' + BZ.r(o.GabMin.x) + ': ' + len); } }
const out = { panels: rows, edge, edgeTotal: BZ.r(edgeTotal), panelArea, hardware: hw, ledCuts, ledLen };
BZ.writeJson('spec_full.json', out);
log('панелей позиций', rows.length, '| кромка м', BZ.r(edgeTotal / 1000), '| площади', JSON.stringify(panelArea), '| фурнитуры позиций', Object.keys(hw).length, '| LED мм', ledLen);
