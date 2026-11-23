// Minimal stand-in for the BAZIS-Mebelshik 11 script API, enough to run lib.js, the agent,
// the review collector and the command samples in plain Node. It models axis-aligned panels,
// blocks, hardware parts with holes, fastener links and edge visibility.
// It is NOT Bazis: it proves the logic of our scripts, not the behaviour of the real API.
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const SCRIPTS = path.join(__dirname, '..', 'skills', 'bazis-script', 'scripts');

function vec(x, y, z) { return { x: x, y: y, z: z }; }

function install(opts) {
  opts = opts || {};
  const G = global;
  const state = { uid: 1, top: [], fasteners: [], saved: [], commits: 0, file: opts.file === undefined ? 'C:\\models\\test.b3d' : opts.file };
  const AnimationType = { None: 0, Custom: 1, DoorLeft: 2, DoorRight: 3, DoorFlap: 4, DoorLift: 5, SDoorLeft: 6, SDoorRight: 7, Box: 8, Support: 9, Handle: 10, Facade: 11 };

  function allPanels() {
    const out = [];
    (function walk(list) { for (const o of list) { if (o.List) walk(o._kids); else if (o._isPanel) out.push(o); } })(state.top);
    return out;
  }

  // CW / CH -> global axis per orientation (thickness axis first)
  const MAP = { X: { t: 0, cw: 2, ch: 1 }, Y: { t: 1, cw: 0, ch: 2 }, Z: { t: 2, cw: 0, ch: 1 } };

  function base(name, min, max) {
    const o = { Name: name, UID: state.uid++, List: false, Visible: true, ArtPos: '', _min: min.slice(), _max: max.slice(), Owner: null };
    Object.defineProperty(o, 'GabMin', { get() { return vec(o._min[0], o._min[1], o._min[2]); } });
    Object.defineProperty(o, 'GabMax', { get() { return vec(o._max[0], o._max[1], o._max[2]); } });
    for (const [k, i] of [['PositionX', 0], ['PositionY', 1], ['PositionZ', 2]]) {
      Object.defineProperty(o, k, { get() { return o._min[i]; }, set(v) { const d = v - o._min[i]; o._min[i] += d; o._max[i] += d; } });
    }
    o.TranslateGCS = v => { o._min[0] += v.x; o._max[0] += v.x; o._min[1] += v.y; o._max[1] += v.y; o._min[2] += v.z; o._max[2] += v.z; };
    o.Build = () => {};
    return o;
  }

  function panel(name, box, orient, o2) {
    o2 = o2 || {};
    const m = MAP[orient];
    const o = base(name, [box[0], box[2], box[4]], [box[1], box[3], box[5]]);
    o._isPanel = true; o._orient = orient;
    o.AsPanel = o;
    o.MaterialName = o2.mat === undefined ? '\u041b\u0414\u0421\u041f \u0411\u0435\u043b\u044b\u0439 2800*2070*16 \u043c\u043c\rW1000' : o2.mat;
    o.TextureOrientation = o2.tex === undefined ? 0 : o2.tex;
    o.IsContourRectangle = o2.rect === undefined ? true : o2.rect;
    if (o2.art) o.ArtPos = o2.art;
    if (o2.hidden) o.Visible = false;
    const dim = (i) => o._max[i] - o._min[i];
    Object.defineProperty(o, 'Thickness', { get() { return dim(m.t); }, set(v) { o._max[m.t] = o._min[m.t] + v; } });
    Object.defineProperty(o, 'ContourWidth', { get() { return dim(m.cw); }, set(v) { o._max[m.cw] = o._min[m.cw] + v; } });
    Object.defineProperty(o, 'ContourHeight', { get() { return dim(m.ch); }, set(v) { o._max[m.ch] = o._min[m.ch] + v; } });
    o.ToGlobal = v => { const g = o._min.slice(); g[m.cw] += v.x; g[m.ch] += v.y; g[m.t] += v.z; return vec(g[0], g[1], g[2]); };
    o.ToObject = v => { const g = [v.x, v.y, v.z]; return vec(g[m.cw] - o._min[m.cw], g[m.ch] - o._min[m.ch], g[m.t] - o._min[m.t]); };
    const line = (x1, y1, x2, y2) => ({ Pos1: { x: x1, y: y1 }, Pos2: { x: x2, y: y2 }, IsLine: () => true, AsLine() { return this; } });
    Object.defineProperty(o, 'Contour', { get() {
      const w = o.ContourWidth, h = o.ContourHeight;
      const els = [line(0, 0, w, 0), line(w, 0, w, h), line(w, h, 0, h), line(0, h, 0, 0)];
      return { Count: 4, Objects: els, 0: els[0], 1: els[1], 2: els[2], 3: els[3] };
    } });
    const butts = [];
    o.Butts = { get Count() { return butts.length; }, Butts: butts, Add() { const b = { ElemIndex: 0, Material: '', Thickness: 0, Width: 0, Sign: '', ClipPanel: false }; butts.push(b); return b; } };
    for (const i of (o2.butts || [])) {
      const b = o.Butts.Add(); b.ElemIndex = i; b.Material = o2.buttMat || '\u041f\u0412\u0425 \u0411\u0435\u043b\u044b\u0439\rE1000'; b.Thickness = o2.buttT || 1; b.Width = 19; b.ClipPanel = true;
    }
    const cuts = (o2.cuts || []).map(n => ({ Name: n, Sign: '' }));
    o.Cuts = { Count: cuts.length, Cuts: cuts };
    o.Plastics = { Count: 0, Plastics: [] };
    // an edge is visible unless another panel sits right outside its middle
    o.IsButtVisible = (i, dist) => {
      if (o2.visibleThrows) throw new Error('IsButtVisible failed');
      const e = o.Contour.Objects[i];
      const a = o.ToGlobal(vec(e.Pos1.x, e.Pos1.y, dim(m.t) / 2)), b = o.ToGlobal(vec(e.Pos2.x, e.Pos2.y, dim(m.t) / 2));
      const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2];
      const c = [(o._min[0] + o._max[0]) / 2, (o._min[1] + o._max[1]) / 2, (o._min[2] + o._max[2]) / 2];
      const ax = [0, 1, 2].filter(k => k !== m.t).sort((p, q) => Math.abs(mid[q] - c[q]) / dim(q) - Math.abs(mid[p] - c[p]) / dim(p))[0];
      const probe = mid.slice(); probe[ax] += (mid[ax] > c[ax] ? 1 : -1) * Math.min(dist, 1);
      return !allPanels().some(q => q !== o && [0, 1, 2].every(k => probe[k] >= q._min[k] && probe[k] <= q._max[k]));
    };
    o.FindConnectedFasteners = () => {
      if (opts.noFastenerApi) throw new Error('FindConnectedFasteners is not supported');
      return state.fasteners.filter(f => f.panels.indexOf(o) >= 0).map(f => f.obj);
    };
    o.Holes = { Count: 0 };
    return o;
  }

  // hardware body. holes: [{d, depth, p: [x, y, z] global, dir: [x, y, z]}]
  function part(name, box, holes) {
    const o = base(name, [box[0], box[2], box[4]], [box[1], box[3], box[5]]);
    const hs = (holes || []).map(h => ({ Diameter: h.d, Depth: h.depth, Position: vec(h.p[0] - o._min[0], h.p[1] - o._min[1], h.p[2] - o._min[2]), Direction: h.dir ? vec(h.dir[0], h.dir[1], h.dir[2]) : undefined }));
    o.Holes = Object.assign({ Count: hs.length }, hs);
    o.ToGlobal = v => vec(v.x + o._min[0], v.y + o._min[1], v.z + o._min[2]);
    o.FindFastenedObjects = () => { const f = state.fasteners.find(x => x.obj === o); return f ? f.panels.slice() : []; };
    return o;
  }

  function block(name, kids, o2) {
    o2 = o2 || {};
    const o = { Name: name, UID: state.uid++, List: true, Visible: true, ArtPos: '', _kids: kids.slice(), Owner: null,
                AnimType: o2.anim === undefined ? AnimationType.None : o2.anim, DoorAngle: o2.angle === undefined ? 0 : o2.angle };
    for (const k of kids) k.Owner = o;
    const ext = (i, fn, init) => o._kids.reduce((a, k) => fn(a, i === 0 ? k.GabMin : k.GabMax), init);
    Object.defineProperty(o, 'GabMin', { get() { return o._kids.length ? vec(Math.min(...o._kids.map(k => k.GabMin.x)), Math.min(...o._kids.map(k => k.GabMin.y)), Math.min(...o._kids.map(k => k.GabMin.z))) : vec(0, 0, 0); } });
    Object.defineProperty(o, 'GabMax', { get() { return o._kids.length ? vec(Math.max(...o._kids.map(k => k.GabMax.x)), Math.max(...o._kids.map(k => k.GabMax.y)), Math.max(...o._kids.map(k => k.GabMax.z))) : vec(0, 0, 0); } });
    o.AsList = () => ({ Count: o._kids.length, Objects: o._kids });
    o.IsFastener = () => !!o2.fastener;
    o.TranslateGCS = v => { for (const k of o._kids) k.TranslateGCS(v); };
    o.Build = () => {};
    for (const [k, i] of [['PositionX', 'x'], ['PositionY', 'y'], ['PositionZ', 'z']]) Object.defineProperty(o, k, { get() { return o.GabMin[i]; } });
    return o;
  }

  const Model = {
    get Count() { return state.top.length; },
    get Objects() { return state.top; },
    get GMin() { const b = block('', state.top); return b.GabMin; },
    get GMax() { const b = block('', state.top); return b.GabMax; },
    get GSize() { const a = Model.GMin, c = Model.GMax; return vec(c.x - a.x, c.y - a.y, c.z - a.z); },
    SelectionCount: 0, Selections: []
  };
  // block('') above re-parents: restore owners of top-level objects
  const fixOwners = () => { for (const o of state.top) o.Owner = null; };

  G.Model = new Proxy(Model, { get(t, k) { const v = t[k]; fixOwners(); return v; } });
  G.NewVector = vec;
  G.AnimationType = AnimationType;
  G.Undo = { Changing() {}, RecursiveChanging() {} };
  G.Action = {
    Interactive: true, OnFinish: null,
    get ModelFilename() { return state.file; },
    Commit() { state.commits++; }, Continue() {}, Finish() { state.finished = true; },
    SaveModel(f) { state.saved.push(f); },
    ArrangePositions() { let n = 1; for (const p of allPanels()) p.ArtPos = String(n++); return true; }
  };
  G.ExtractMatName = s => String(s).split('\r')[0];
  G.ExtractMatCode = s => String(s).split('\r')[1] || '';
  G.system = {
    apiVersion: 'mock',
    require(file) { vm.runInThisContext(fs.readFileSync(file, 'latin1'), { filename: file }); },
    writeTextFile(f, t) { fs.writeFileSync(f, t, 'latin1'); },
    readTextFile(f) { return fs.readFileSync(f, 'latin1'); },
    fileExists(f) { return fs.existsSync(f); },
    sleep() {}
  };
  const adder = orient => (a, b, c, d, pos) => {
    const box = orient === 'X' ? [pos, pos + 16, b, d, a, c] : orient === 'Y' ? [a, c, pos, pos + 16, b, d] : [a, c, b, d, pos, pos + 16];
    const o = panel('new', box, orient); o.UID = -1; state.top.push(o); return o;
  };
  G.AddVertPanel = adder('X'); G.AddHorizPanel = adder('Y'); G.AddFrontPanel = adder('Z');
  G.require = require;

  return {
    state, AnimationType, panel, part, block, allPanels,
    add(o) { state.top.push(o); return o; },
    remove(o) { state.top = state.top.filter(x => x !== o); },
    fasten(obj, panels) { state.fasteners.push({ obj: obj, panels: panels }); return obj; },
    loadLib(dir) {
      const file = path.join(dir || SCRIPTS, 'lib.js');
      vm.runInThisContext(fs.readFileSync(file, 'latin1'), { filename: file });
      if (opts.dir) global.BZ.DIR = opts.dir;
      return global.BZ;
    },
    // run a command file the way the agent does: wrapped in a block, last expression is the result
    run(file) {
      const code = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
      return vm.runInThisContext('{' + code + '\n}', { filename: path.basename(file) });
    }
  };
}

module.exports = { install, SCRIPTS };
