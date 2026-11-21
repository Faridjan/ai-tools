// Проба API и свойств Базиса, только чтение: модель не меняется.
// Запуск: bz.ps1 -File C:\Users\Jarvis\Documents\Bazis11\_claude\cmd_probe_library.js
// Ответы вписать в references/bazis-library.md (раздел 7) скила ldsp-furniture-design
// и снять пометки [предположение] там, где ответ получен.
const r = { lib: BZ.VERSION, apiVersion: system.apiVersion };
const typeOf = n => { try { return eval('typeof ' + n); } catch (e) { return 'err'; } };
const dumpEnum = n => {
  if (typeOf(n) === 'undefined') return 'undefined';
  try { return JSON.stringify(eval(n)); } catch (e) { return 'есть, не сериализуется: ' + e; }
};

r.globals = {};
for (const n of ['OpenFurniture', 'NewFurniture', 'NewFragment', 'NewParamFastenerDB', 'ExtractMatName', 'ExtractMatCode',
  'FormatMatName', 'NewButtMaterialInput', 'NewMaterialInput', 'AddBlock', 'AddVertPanel', 'AddHorizPanel', 'AddFrontPanel',
  'NewModelTransformer', 'DeleteObject'])
  r.globals[n] = typeOf(n);

r.enums = {};
for (const n of ['TextureOrientation', 'AnimationType', 'DatumMode', 'FurniturePosition', 'ftoVertical', 'ftoHorizontal'])
  r.enums[n] = dumpEnum(n);

r.action = {};
for (const n of ['ReplaceFurniture', 'Revert', 'Commit', 'SaveModel', 'LoadModel', 'NewFurniture'])
  r.action[n] = typeof Action[n];

// Значения TextureOrientation у панелей: ось толщины и какая сторона контура длиннее
r.textureByOrient = {};
for (const o of BZ.panels()) {
  const p = BZ.panel(o);
  const k = BZ.orient(o) + (p.ContourWidth >= p.ContourHeight ? ' CW>=CH' : ' CW<CH');
  let v;
  try { v = String(p.TextureOrientation); } catch (e) { v = 'err'; }
  const bucket = r.textureByOrient[k] = r.textureByOrient[k] || {};
  bucket[v] = (bucket[v] || 0) + 1;
}

// Свойства первой кромки в модели: ширина ленты, подрезка, припуск
for (const o of BZ.panels()) {
  const B = BZ.panel(o).Butts;
  if (!B || !B.Count) continue;
  const b = B.Butts ? B.Butts[0] : B[0], props = {};
  for (const k of ['ElemIndex', 'Sign', 'Material', 'Thickness', 'Width', 'ClipPanel', 'Overhung', 'Allowance', 'CutIndex']) {
    try { props[k] = b[k]; } catch (e) { props[k] = 'err'; }
  }
  r.buttSample = { panel: o.Name, t: BZ.panel(o).Thickness, props };
  break;
}

// Блоки верхнего уровня: AnimType и как их видит BZ.blockKind
r.blocks = [];
for (let i = 0; i < Model.Count && r.blocks.length < 30; i++) {
  const o = Model.Objects[i];
  if (!o.List) continue;
  let t;
  try { t = o.AnimType; } catch (e) { t = 'err'; }
  r.blocks.push({ name: o.Name, animType: t, kind: BZ.blockKind ? BZ.blockKind(o) : 'lib < 4' });
}
r;
