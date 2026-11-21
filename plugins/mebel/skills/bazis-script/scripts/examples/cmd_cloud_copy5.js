// Копия для облака v5 = v4 + удаление штанг синхронизации DTC (в облаке это листовой материал, штанга HT0FH02 добавляется в заказ вручную).
// Удаляются только верхние из совпавших объектов (без потомков уже удаляемых), чтобы не ловить ссылки на удалённые.
const MAIN = 'C:\\Users\\Jarvis\\Desktop\\Закладная спальня.b3d';
const COPY = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\_claude\\Закладная спальня_облако.b3d';
const out = { steps: [] };
out.steps.push('saved main: ' + JSON.stringify(BZ.save()));

const DEL = /GTV Вешалка|GTV Корзина|SMART Направляющ|SMART Заглушка|Шток для полкодержателя FLIPPER|Адаптер\+толкатель|Толкатель регулируемый|^Штанга для стабилизации|^Держатель штанги/i;
const all = BZ.all();
const hits = all.filter(it => it.depth <= 6 && DEL.test(String(it.obj.Name || '')));
const hitSet = new Set(hits.map(it => it.obj));
const tops = hits.filter(it => !it.anc.some(a => hitSet.has(a)));
const names = {};
for (const it of tops) {
  const nm = String(it.obj.Name || '').replace(/\r.*$/, '').slice(0, 50);
  try { DeleteObject(it.obj); names[nm] = (names[nm] || 0) + 1; } catch (e) { names[nm + ' ERR'] = String(e); }
}
out.deleted = names;

const widened = [], freed = {};
const FREE = /^(Бок ящ\.|Зад\. ст\. ящ\.|Дно ящ\.|ШС - Цоколь$)/;
for (const it of BZ.all()) {
  const o = it.obj; if (o.List) continue; const p = BZ.panel(o); if (!p) continue;
  const nm = String(o.Name || '').replace(/\r.*$/, '');
  if (FREE.test(nm)) { try { BZ.changing(o); p.TextureOrientation = TextureOrientation.None; freed[nm] = (freed[nm] || 0) + 1; } catch (e) {} }
  const B = o.Butts; if (!B || !B.Count) continue;
  const s = BZ.size(o); const d = s.slice().sort((a, b) => a - b);
  if (d[1] >= 60 && d[2] >= 100) continue;
  const tAxis = s.indexOf(d[0]); let axis = -1;
  for (let a = 0; a < 3; a++) if (a !== tAxis && s[a] < 60) axis = a;
  if (axis < 0) continue;
  BZ._resize(o, axis, 70, false);
  widened.push(nm + ' ' + BZ.r(s[axis]) + '->70');
}
out.freed = freed; out.widened = widened;
const leftBars = BZ.all().filter(it => /Штанга для стабилизации|Держатель штанги/.test(String(it.obj.Name))).length;
out.steps.push('штанг осталось ' + leftBars);
Action.SaveModel(COPY);
out.steps.push('saved copy exists=' + BZ.exists(COPY));
out.steps.push('LoadModel main again: ' + Action.LoadModel(MAIN) + ', file=' + Action.ModelFilename + ', objects=' + Model.Count);
out;
