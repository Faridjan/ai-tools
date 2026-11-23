// Review collector: reads the open model and writes _claude\review_data.json for review.py.
// It only reads. No Undo, no Build, no moves: safe to run on any model at any time.
// Run through review.ps1 (it sends this file with -NoInspect), not by hand.
//
// Every step is guarded. A step that fails is written to collectErrors and the matching check in
// review.py is reported as "not checked": a missing check must never look like a clean result.
// Syntax: Node 8 (no ?., ??, catch without binding, flat, Object.fromEntries).
const SCHEMA = 1;
const R = v => Math.round(v * 100) / 100;
const v3 = v => [R(v.x), R(v.y), R(v.z)];
const errIdx = {}, collectErrors = [];
function fail(step, e) {
  const msg = String(e && e.message ? e.message : e);
  if (!errIdx[step]) { errIdx[step] = { step: step, count: 0, error: msg }; collectErrors.push(errIdx[step]); }
  errIdx[step].count++;
}
function step(name, fn, dflt) { try { return fn(); } catch (e) { fail(name, e); return dflt; } }
function nth(coll, arrName, i) { return coll[arrName] ? coll[arrName][i] : coll[i]; }

const items = BZ.all();
const ctx = step('roles', () => BZ.roleCtx(), null);
const idOf = (o, path) => { const u = BZ.uid(o); return u === null ? 'p' + path : 'u' + u; };

// AnimationType value -> name
const animNames = {};
step('animation enum', () => {
  if (typeof AnimationType === 'undefined') throw new Error('AnimationType is not defined in this Bazis');
  for (const k of ['None', 'Custom', 'DoorLeft', 'DoorRight', 'DoorFlap', 'DoorLift', 'SDoorLeft', 'SDoorRight', 'Box', 'Support', 'Handle', 'Facade']) {
    if (AnimationType[k] !== undefined) animNames[String(AnimationType[k])] = k;
  }
});

const pathId = {};
for (const it of items) pathId[it.path] = idOf(it.obj, it.path);
const ancIds = it => {
  const out = [], parts = it.path.split('/');
  for (let i = 1; i < parts.length; i++) out.push(pathId[parts.slice(0, i).join('/')]);
  return out;
};

const blocks = [], panels = [], parts = [], holes = [];
const objById = {};

for (const it of items) {
  const o = it.obj, id = pathId[it.path], anc = ancIds(it);
  objById[id] = o;
  const base = { id: id, path: it.path, name: String(o.Name === undefined || o.Name === null ? '' : o.Name), anc: anc };
  step('box', () => { base.min = v3(o.GabMin); base.max = v3(o.GabMax); });
  step('art', () => { if (o.ArtPos) base.art = String(o.ArtPos); });
  step('visible', () => { if (o.Visible === false) base.hidden = true; });

  if (o.List) {
    base.fastener = BZ.isFastener(o);
    base.kind = BZ.blockKind(o);
    base.kindStrict = BZ.blockKind(o, true);
    step('anim', () => {
      const t = o.AnimType;
      if (t !== undefined && t !== null) { base.anim = animNames[String(t)] || String(t); }
      const a = o.DoorAngle; if (a !== undefined && a !== null) base.angle = R(Number(a));
    });
    step('block count', () => { const l = BZ.list(o); base.n = l ? l.Count : 0; });
    blocks.push(base);
    continue;
  }

  // holes that this object drills (hardware parts carry them; panels usually have none of their own)
  step('holes', () => {
    const H = o.Holes; if (!H || !H.Count) return;
    for (let j = 0; j < H.Count; j++) {
      const h = H[j]; if (!h) continue;
      const rec = { owner: id, d: R(h.Diameter), depth: R(h.Depth) };
      const g = o.ToGlobal(h.Position); rec.p = v3(g);
      try {
        const dir = h.Direction;
        if (dir) { const g2 = o.ToGlobal(V(h.Position.x + dir.x, h.Position.y + dir.y, h.Position.z + dir.z)); rec.dir = [R(g2.x - g.x), R(g2.y - g.y), R(g2.z - g.z)]; }
      } catch (e) {}
      holes.push(rec);
    }
  });

  const p = BZ.panel(o);
  if (!p) { parts.push(base); continue; }

  base.orient = BZ.orient(o);
  base.role = ctx ? step('role', () => BZ.role(o, ctx), 'other') : 'other';
  step('panel dims', () => { base.t = R(p.Thickness); base.cw = R(p.ContourWidth); base.ch = R(p.ContourHeight); base.mat = String(p.MaterialName || ''); });
  step('texture', () => { base.tex = Number(p.TextureOrientation) || 0; });
  step('rect', () => { base.rect = (typeof p.IsContourRectangle === 'function') ? !!p.IsContourRectangle() : (p.IsContourRectangle !== false); });

  const buttAt = {};
  step('butts', () => {
    const B = p.Butts; if (!B) return;
    for (let i = 0; i < B.Count; i++) {
      const b = nth(B, 'Butts', i);
      const rec = { mat: String(b.Material || ''), t: R(b.Thickness) };
      try { rec.w = R(b.Width); } catch (e) {}
      try { rec.clip = !!b.ClipPanel; } catch (e) {}
      buttAt[b.ElemIndex] = rec;
    }
  });
  base.edges = [];
  step('contour', () => {
    const c = p.Contour;
    for (let i = 0; i < c.Count; i++) {
      const e = nth(c, 'Objects', i), rec = { i: i };
      let line = true;
      try { if (typeof e.IsLine === 'function') line = !!e.IsLine(); } catch (e1) {}
      rec.line = line;
      try {
        if (e.Pos1 && e.Pos2) {
          rec.a = v3(o.ToGlobal(V(e.Pos1.x, e.Pos1.y, 0)));
          rec.b = v3(o.ToGlobal(V(e.Pos2.x, e.Pos2.y, 0)));
          rec.len = R(Math.sqrt(Math.pow(e.Pos2.x - e.Pos1.x, 2) + Math.pow(e.Pos2.y - e.Pos1.y, 2)));
        }
        if (!line && typeof e.ObjLength === 'function') rec.len = R(e.ObjLength());
      } catch (e2) { fail('contour element', e2); }
      if (buttAt[i]) rec.butt = buttAt[i];
      try { rec.visible = !!p.IsButtVisible(i, 5); } catch (e3) { rec.visible = null; fail('IsButtVisible', e3); }
      base.edges.push(rec);
    }
  });
  step('cuts', () => { const c = BZ.cuts(p); if (c.length) base.cuts = c; });
  step('plastics', () => { const q = BZ.plastics(p); if (q.length) base.plastics = q.length; });
  panels.push(base);
}

// Fasteners and the panels each of them joins
const fastened = [], seenF = {};
let joinsAvailable = true;
for (const pn of panels) {
  const o = objById[pn.id];
  let list = null;
  try { list = o.FindConnectedFasteners(); } catch (e) { fail('FindConnectedFasteners', e); joinsAvailable = false; break; }
  if (!list) continue;
  for (let i = 0; i < list.length; i++) {
    const f = list[i]; if (!f) continue;
    // one fastener is reported by each panel it joins: recognise it by name and box
    // (object identity of Bazis wrappers is not relied on)
    const box = step('fastener box', () => [v3(f.GabMin), v3(f.GabMax)], [[], []]);
    const key = String(f.Name) + ':' + box[0].join(',') + ':' + box[1].join(',');
    if (!seenF[key]) {
      seenF[key] = { name: String(f.Name || ''), min: box[0], max: box[1], panels: [] };
      fastened.push(seenF[key]);
    }
    if (seenF[key].panels.indexOf(pn.id) < 0) seenF[key].panels.push(pn.id);
  }
}

const data = {
  schema: SCHEMA,
  collectedAt: new Date().toISOString(),
  lib: BZ.VERSION,
  model: {
    file: step('model file', () => String(Action.ModelFilename || ''), ''),
    size: step('model size', () => v3(Model.GSize), null),
    bounds: ctx ? ctx.b : null,
    carcass: ctx ? ctx.c : null,
    topCount: step('model count', () => Model.Count, null)
  },
  sheetDefault: BZ.SHEET,
  blocks: blocks, panels: panels, parts: parts, holes: holes,
  fastened: joinsAvailable ? fastened : null,
  sections: step('sections', () => BZ.sections(), null),
  collectErrors: collectErrors
};
BZ.writeJson('review_data.json', data);
log('review collector: panels ' + panels.length + ', blocks ' + blocks.length + ', hardware parts ' + parts.length + ', holes ' + holes.length + ', fastener links ' + (joinsAvailable ? fastened.length : 'n/a') + ', failed steps ' + collectErrors.length);
({ panels: panels.length, blocks: blocks.length, parts: parts.length, holes: holes.length, failedSteps: collectErrors.map(e => e.step + ' x' + e.count + ': ' + e.error) });
