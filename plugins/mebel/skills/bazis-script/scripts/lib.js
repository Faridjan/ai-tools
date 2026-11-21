// ============================================================
//  Claude helper library for BAZIS-Mebelshik 11 scripts  (v4)
//  Loaded by "Claude Agent.js" via system.require at start.
//  Hot reload inside a running agent: BZ.reload()
//  Written in conservative ES5 so it loads on any engine; commands
//  themselves may use ES2015+ (engine is Node 8.11.3).
//  File is ASCII only on purpose (system.require reads it as ANSI):
//  Cyrillic goes through \uXXXX.
// ============================================================

var BZ = {};
BZ.VERSION = 4;
BZ.DIR = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\_claude\\';
BZ.EPS = 0.5;
BZ.autoInspect = true;      // agent runs BZ.inspect() after a command that changed the model
// The scripted ModelInspector of Bazis 11.6 returned no errors at all in live tests on 14.09.2026 (8 mm overlap,
// 3000 mm panel on a 2800 sheet, unknown material, panels without fasteners), whatever options were set.
// BZ.inspect therefore appends its own checks (BZ.check): panel overlap and panel vs sheet size.
BZ.ownChecks = true;
BZ.SHEET = { len: 2800, wid: 2070, trim: 10 };   // used when the material string has no size like 2800*2070
BZ.inspectOptions = { ObjIntersectionAnalyze: true, FastIntersectionAnalyze: true, FastIncorrectAnalyze: true,
                      PanelNotFixedAnalyze: false, PanelTooLargeAnalyze: true, PlasticTooLargeAnalyze: false,
                      MatNotExistsAnalyze: true, MatOutOfStockAnalyze: false };

// ---------- node modules (Bazis 10+ scripts run inside Node.js) ----------
BZ.fs = null; BZ.vm = null; BZ.path = null;
try { BZ.fs = require('fs'); } catch (e) { BZ.fs = null; }
try { BZ.vm = require('vm'); } catch (e) { BZ.vm = null; }
try { BZ.path = require('path'); } catch (e) { BZ.path = null; }

// ---------- logging ----------
BZ._log = [];
function log() {
    var s = [];
    for (var i = 0; i < arguments.length; i++) {
        var a = arguments[i];
        s.push(typeof a === 'object' ? BZ.json(a) : String(a));
    }
    BZ._log.push(s.join(' '));
}

// ---------- JSON with \u escapes (safe for both ANSI and UTF-8 readers) ----------
BZ.esc = function (s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
        var c = s.charCodeAt(i);
        if (c > 126 || c < 32) {
            var h = c.toString(16);
            while (h.length < 4) h = '0' + h;
            out += '\\u' + h;
        } else if (c === 34) out += '\\"';
        else if (c === 92) out += '\\\\';
        else out += s.charAt(i);
    }
    return out;
};
BZ.json = function (v, ind, lvl) {
    ind = ind || 0; lvl = lvl || 0;
    var pad = ind ? '\n' + new Array(lvl * ind + 1).join(' ') : '';
    var pad2 = ind ? '\n' + new Array((lvl + 1) * ind + 1).join(' ') : '';
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number') return isFinite(v) ? String(Math.round(v * 1000) / 1000) : 'null';
    if (typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return '"' + BZ.esc(v) + '"';
    if (typeof v === 'function') return '"[function]"';
    if (Object.prototype.toString.call(v) === '[object Array]') {
        if (!v.length) return '[]';
        var a = [];
        for (var i = 0; i < v.length; i++) a.push(pad2 + BZ.json(v[i], ind, lvl + 1));
        return '[' + a.join(',') + pad + ']';
    }
    if (typeof v === 'object') {
        var o = [];
        for (var k in v) if (v.hasOwnProperty(k)) o.push(pad2 + '"' + BZ.esc(k) + '":' + (ind ? ' ' : '') + BZ.json(v[k], ind, lvl + 1));
        if (!o.length) return '{}';
        return '{' + o.join(',') + pad + '}';
    }
    return '"' + BZ.esc(String(v)) + '"';
};

// ---------- files ----------
BZ._full = function (name) { return (name.indexOf(':') > 0 || name.charAt(0) === '\\') ? name : BZ.DIR + name; };
BZ.write = function (name, text) {
    if (BZ.fs) BZ.fs.writeFileSync(BZ._full(name), text, 'utf8');
    else system.writeTextFile(BZ._full(name), text);
};
BZ.read = function (name) {
    if (BZ.fs) return BZ.fs.readFileSync(BZ._full(name), 'utf8');
    return system.readTextFile(BZ._full(name));
};
BZ.exists = function (name) {
    if (BZ.fs) return BZ.fs.existsSync(BZ._full(name));
    return system.fileExists(BZ._full(name));
};
BZ.writeJson = function (name, obj) { BZ.write(name, BZ.json(obj, 1)); };
// CSV with BOM so Excel opens Cyrillic correctly
BZ.writeCsv = function (name, rows, sep) {
    sep = sep || ';';
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var cells = [];
        for (var j = 0; j < rows[i].length; j++) {
            var c = rows[i][j]; if (c === null || c === undefined) c = '';
            c = String(c);
            if (c.indexOf(sep) >= 0 || c.indexOf('"') >= 0 || c.indexOf('\n') >= 0) c = '"' + c.replace(/"/g, '""') + '"';
            cells.push(c);
        }
        lines.push(cells.join(sep));
    }
    BZ.write(name, '\ufeff' + lines.join('\r\n'));
};

// Re-read lib.js into the running agent (no restart needed). Keeps the current command log.
BZ.reload = function () {
    if (!BZ.fs || !BZ.vm) throw new Error('reload needs fs and vm');
    var keep = BZ._log, auto = BZ.autoInspect;
    BZ.vm.runInThisContext(BZ.fs.readFileSync(BZ.DIR + 'lib.js', 'utf8'), { filename: 'lib.js' });
    BZ._log = keep; BZ.autoInspect = auto;
    try { if (typeof global !== 'undefined') { global.BZ = BZ; global.log = log; global.V = V; } } catch (e) {}
    return BZ.VERSION;
};

// ---------- vectors ----------
function V(x, y, z) { return NewVector(x, y, z); }
BZ.v3 = function (v) { return [v.x, v.y, v.z]; };
BZ.near = function (a, b, tol) { return Math.abs(a - b) <= (tol === undefined ? BZ.EPS : tol); };
BZ.r = function (x) { return Math.round(x * 100) / 100; };

// ---------- model traversal ----------
// Items: {obj, path, depth, owner, anc}; anc = owner blocks from the top-level one down to the closest
BZ.all = function (root) {
    var res = [];
    function walk(o, path, depth, owner, anc) {
        res.push({ obj: o, path: path, depth: depth, owner: owner, anc: anc });
        if (o.List) {
            var l = BZ.list(o), sub = anc.concat([o]);
            if (l) for (var i = 0; i < l.Count; i++) walk(l.Objects[i], path + '/' + i, depth + 1, o, sub);
        }
    }
    var top = root || Model;
    for (var i = 0; i < top.Count; i++) walk(top.Objects[i], String(i), 0, root || null, []);
    return res;
};
// List3D accessor: AsList is a method in d.ts (Bazis 10+) and a property in Bazis 8 types
BZ.list = function (o) {
    try { if (typeof o.AsList === 'function') return o.AsList(); return o.AsList || null; } catch (e) { return null; }
};
BZ.panel = function (o) { try { return o.AsPanel || null; } catch (e) { return null; } };
BZ.isFastener = function (o) {
    try { if (!o.List) return false; if (typeof o.IsFastener === 'function') return !!o.IsFastener(); return !!o.IsFastener; } catch (e) { return false; }
};
// UID or null. An object created in the current command has UID -1 until the agent commits: treat it as no UID.
BZ.uid = function (o) { try { var u = o.UID; return (u === undefined || u === null || u < 0) ? null : u; } catch (e) { return null; } };
BZ.size = function (o) { return [o.GabMax.x - o.GabMin.x, o.GabMax.y - o.GabMin.y, o.GabMax.z - o.GabMin.z]; };

// Orientation: which global axis the thickness lies on
//  'X' - side/stand/partition, 'Y' - shelf/bottom/top, 'Z' - back/facade/plinth
BZ.orient = function (o) {
    var s = BZ.size(o);
    var m = Math.min(s[0], s[1], s[2]);
    if (m === s[0]) return 'X';
    if (m === s[1]) return 'Y';
    return 'Z';
};

// Model bounds computed over panels only (ignores service objects like the bounding frame)
BZ.bounds = function () {
    var items = BZ.all(), mn = null, mx = null;
    for (var i = 0; i < items.length; i++) {
        var o = items[i].obj; if (o.List || !BZ.panel(o)) continue;
        var a = o.GabMin, c = o.GabMax;
        if (!mn) { mn = [a.x, a.y, a.z]; mx = [c.x, c.y, c.z]; continue; }
        mn = [Math.min(mn[0], a.x), Math.min(mn[1], a.y), Math.min(mn[2], a.z)];
        mx = [Math.max(mx[0], c.x), Math.max(mx[1], c.y), Math.max(mx[2], c.z)];
    }
    if (!mn) { mn = BZ.v3(Model.GMin); mx = BZ.v3(Model.GMax); }
    return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
};

// Carcass X-extent: vertical panels at least half as deep as the deepest one
// (narrow fillers/strips do not move the carcass edge)
BZ.carcass = function () {
    var xs = BZ.find(function (o) { return !!BZ.panel(o) && BZ.orient(o) === 'X'; });
    var maxD = 0, i;
    for (i = 0; i < xs.length; i++) maxD = Math.max(maxD, BZ.size(xs[i])[2]);
    var x0 = null, x1 = null;
    for (i = 0; i < xs.length; i++) {
        if (BZ.size(xs[i])[2] < maxD * 0.5) continue;
        x0 = x0 === null ? xs[i].GabMin.x : Math.min(x0, xs[i].GabMin.x);
        x1 = x1 === null ? xs[i].GabMax.x : Math.max(x1, xs[i].GabMax.x);
    }
    if (x0 === null) { var b = BZ.bounds(); x0 = b.min[0]; x1 = b.max[0]; maxD = b.size[2]; }
    return { x0: x0, x1: x1, depth: maxD };
};
// Kind of an owner block: 'fastener', 'drawer', 'door' or null.
// AnimType is used when the engine exposes AnimationType, otherwise block names are used.
// strict: doors only by AnimType, so a group block named "Fasady" does not become one movable unit.
BZ.DRAWER_RE = /(^|[^\u0430-\u044f\u0451])\u044f\u0449\u0438\u043a\u0430?($|[^\u0430-\u044f\u0451])/;   // word yashchik / yashchika
BZ.DOOR_RE = /^\s*(\u0434\u0432\u0435\u0440|\u0444\u0430\u0441\u0430\u0434)/;                              // name starts with dver / fasad
BZ.blockKind = function (b, strict) {
    if (BZ.isFastener(b)) return 'fastener';
    var t;
    try { t = b.AnimType; } catch (e) { t = undefined; }
    if (t !== undefined && t !== null && typeof AnimationType !== 'undefined') {
        try {
            if (AnimationType.Box !== undefined && t === AnimationType.Box) return 'drawer';
            var doors = [AnimationType.DoorLeft, AnimationType.DoorRight, AnimationType.DoorFlap,
                         AnimationType.DoorLift, AnimationType.SDoorLeft, AnimationType.SDoorRight];
            for (var i = 0; i < doors.length; i++) if (doors[i] !== undefined && t === doors[i]) return 'door';
        } catch (e2) {}
    }
    var n = '';
    try { n = String(b.Name || '').toLowerCase(); } catch (e3) {}
    if (BZ.DRAWER_RE.test(n)) return 'drawer';
    if (!strict && BZ.DOOR_RE.test(n)) return 'door';
    return null;
};
// UID -> {fastener, drawer, door} for objects that sit inside such blocks
BZ.membership = function (items) {
    items = items || BZ.all();
    var m = {};
    for (var i = 0; i < items.length; i++) {
        var it = items[i]; if (!it.anc || !it.anc.length) continue;
        var u = BZ.uid(it.obj); if (u === null) continue;
        var r = null;
        for (var j = 0; j < it.anc.length; j++) {
            var k = BZ.blockKind(it.anc[j]);
            if (k) { r = r || {}; r[k] = true; }
        }
        if (r) m[u] = r;
    }
    return m;
};
BZ.roleCtx = function () { return { b: BZ.bounds(), c: BZ.carcass(), m: BZ.membership() }; };

// Name hints (lowercase; Cyrillic as \u escapes)
BZ.ROLE_NAMES = [
    [BZ.DRAWER_RE, 'drawer'],                                                                  // drawer parts first: bokovina yashchika, dno yashchika
    [/\u0446\u043e\u043a\u043e\u043b/, 'plinth'],                                             // tsokol
    [/\u0437\u0430\u0433\u043b\u0443\u0448\u043a|\u043f\u043b\u0430\u043d\u043a|\u0444\u0430\u043b\u044c\u0448/, 'filler'], // zaglushk | plank | falsh
    [/\u0437\u0430\u0434\u043d|\u0434\u0432\u043f|\u0445\u0434\u0444/, 'back'],              // zadn | dvp | hdf
    [/\u043f\u043e\u043b\u043a/, 'shelf'],                                                   // polk
    [/(^|[^\u0430-\u044f\u0451])\u0434\u043d\u043e/, 'bottom'],                              // dno (not inside "odno")
    [/\u043a\u0440\u044b\u0448/, 'top'],                                                     // krysh
    [/\u0444\u0430\u0441\u0430\u0434|\u0434\u0432\u0435\u0440/, 'facade'],                    // fasad | dver
    [/\u0431\u043e\u043a\u043e\u0432\u0438\u043d/, 'side'],                                  // bokovin
    [/\u0441\u0442\u043e\u0439\u043a|\u043f\u0435\u0440\u0435\u0433\u043e\u0440\u043e\u0434/, 'stand'] // stoyk | peregorod
];

// Furniture role: name hints first, geometry as fallback. Returns one of
//  side_left, side_right, partition, bottom, top, shelf, back, plinth, facade, filler, other
BZ.role = function (o, ctx) {
    var p = BZ.panel(o); if (!p) return 'other';
    if (!ctx || !ctx.b || !ctx.c || !ctx.m) ctx = BZ.roleCtx();
    var mem = ctx.m[BZ.uid(o)];
    if (mem && mem.fastener) return 'other';     // part of a fastener block
    if (mem && mem.drawer) return 'drawer';      // part of a drawer block
    if (mem && mem.door) return 'facade';        // part of a door block
    var b = ctx.b, c = ctx.c, s = BZ.size(o), or = BZ.orient(o), T = 3;
    function side() {
        if (BZ.near(o.GabMin.x, c.x0, T)) return 'side_left';
        if (BZ.near(o.GabMax.x, c.x1, T)) return 'side_right';
        return null;
    }
    var n = String(o.Name || '').toLowerCase();
    for (var i = 0; i < BZ.ROLE_NAMES.length; i++) {
        if (!BZ.ROLE_NAMES[i][0].test(n)) continue;
        var r = BZ.ROLE_NAMES[i][1];
        if (r === 'side') return side() || ((o.GabMin.x - c.x0) < (c.x1 - o.GabMax.x) ? 'side_left' : 'side_right');
        if (r === 'stand') { if (or === 'X') return side() || 'partition'; continue; }
        return r;
    }
    if (or === 'X') {
        if (s[2] < c.depth * 0.5) return 'filler';
        return side() || 'partition';
    }
    if (or === 'Y') {
        if (BZ.near(o.GabMax.y, b.max[1], T)) return 'top';
        if (o.GabMin.y <= b.min[1] + 150) return 'bottom';
        return 'shelf';
    }
    var t = Math.min(s[0], s[1], s[2]);
    if (t <= 6) return 'back';
    if (s[1] <= 200 && o.GabMin.y <= b.min[1] + 150) return 'plinth';
    if (BZ.near(o.GabMin.z, b.min[2], T) || BZ.near(o.GabMax.z, b.max[2], T)) return 'facade';
    return 'other';
};

// Butts / cuts / plastics of a panel as plain data
BZ.butts = function (p) {
    var out = [];
    try {
        var B = p.Butts; if (!B) return out;
        for (var i = 0; i < B.Count; i++) {
            var b = B.Butts ? B.Butts[i] : B[i];
            out.push({ i: b.ElemIndex, mat: b.Material, t: b.Thickness, sign: b.Sign });
        }
    } catch (e) {}
    return out;
};
BZ.cuts = function (p) {
    var out = [];
    try {
        var C = p.Cuts; if (!C) return out;
        for (var i = 0; i < C.Count; i++) { var c = C.Cuts ? C.Cuts[i] : C[i]; out.push({ name: c.Name, sign: c.Sign }); }
    } catch (e) {}
    return out;
};
BZ.plastics = function (p) {
    var out = [];
    try {
        var P = p.Plastics; if (!P) return out;
        for (var i = 0; i < P.Count; i++) { var q = P.Plastics ? P.Plastics[i] : P[i]; out.push({ mat: q.Material, t: q.Thickness }); }
    } catch (e) {}
    return out;
};
BZ.userProps = function (o) {
    var out = {};
    try {
        var n = o.UserPropCount || 0;
        for (var i = 0; i < n; i++) { var k = o.UserPropertyName[i]; out[k] = o.UserProperty[k]; }
    } catch (e) {}
    return out;
};

// Record describing one object
BZ.info = function (o, path, ctx) {
    var r = {
        path: path, uid: BZ.uid(o), name: o.Name, list: !!o.List,
        pos: [BZ.r(o.PositionX), BZ.r(o.PositionY), BZ.r(o.PositionZ)],
        min: BZ.v3(o.GabMin), max: BZ.v3(o.GabMax)
    };
    try { if (o.Owner && o.Owner.Name) r.owner = o.Owner.Name; } catch (e) {}
    try { if (o.ArtPos) r.art = o.ArtPos; } catch (e) {}
    try { if (o.Visible === false) r.hidden = true; } catch (e) {}
    if (o.List) { if (BZ.isFastener(o)) r.fastener = true; return r; }
    var p = BZ.panel(o);
    if (p) {
        r.cw = p.ContourWidth; r.ch = p.ContourHeight; r.t = p.Thickness;
        r.mat = p.MaterialName; r.orient = BZ.orient(o); r.role = BZ.role(o, ctx);
        try { r.rect = (typeof p.IsContourRectangle === 'function') ? p.IsContourRectangle() : p.IsContourRectangle; } catch (e) {}
        var b = BZ.butts(p); if (b.length) r.butts = b;
        var c = BZ.cuts(p); if (c.length) r.cuts = c;
        var q = BZ.plastics(p); if (q.length) r.plastics = q;
        var up = BZ.userProps(o); for (var k in up) { r.props = up; break; }
    }
    return r;
};

// Full dump -> object (also written to <fileName> when given)
BZ.dump = function (fileName) {
    var items = BZ.all(), out = [], ctx = BZ.roleCtx();
    for (var i = 0; i < items.length; i++) out.push(BZ.info(items[i].obj, items[i].path, ctx));
    var res = {
        size: BZ.v3(Model.GSize), min: BZ.v3(Model.GMin), max: BZ.v3(Model.GMax),
        panelsBounds: ctx.b, carcass: ctx.c, count: Model.Count, objects: out
    };
    try { res.file = Action.ModelFilename; } catch (e) {}
    if (fileName) BZ.writeJson(fileName, res);
    return res;
};

// Horizontal zones (tiers) between carcass horizontals (roles top/bottom), gaps > 100 mm.
BZ.zones = function (ctx) {
    ctx = ctx || BZ.roleCtx();
    var b = ctx.b, hz = [], i;
    var ys = BZ.find(function (o) { return !!BZ.panel(o) && BZ.orient(o) === 'Y'; });
    for (i = 0; i < ys.length; i++) {
        var r = BZ.role(ys[i], ctx);
        if (r === 'top' || r === 'bottom') hz.push([ys[i].GabMin.y, ys[i].GabMax.y]);
    }
    hz.sort(function (a, c) { return a[0] - c[0]; });
    var zones = [], prev = b.min[1];
    for (i = 0; i < hz.length; i++) {
        if (hz[i][0] - prev > 100) zones.push([BZ.r(prev), BZ.r(hz[i][0])]);
        prev = Math.max(prev, hz[i][1]);
    }
    if (b.max[1] - prev > 100) zones.push([BZ.r(prev), BZ.r(b.max[1])]);
    if (!zones.length) zones.push([BZ.r(b.min[1]), BZ.r(b.max[1])]);
    return zones;
};

// Sections (cells): for every zone, split X by vertical panels spanning that zone.
// Each: {zone, y0, y1, h, x0, x1, w, left, right, shelves:[y...]}
BZ.sections = function () {
    var ctx = BZ.roleCtx(), zones = BZ.zones(ctx), out = [], TOL = 20;
    var xs = BZ.find(function (o) { return !!BZ.panel(o) && BZ.orient(o) === 'X'; });
    var shelves = BZ.find(function (o) { return !!BZ.panel(o) && BZ.orient(o) === 'Y' && BZ.role(o, ctx) === 'shelf'; });
    for (var zi = 0; zi < zones.length; zi++) {
        var y0 = zones[zi][0], y1 = zones[zi][1];
        var st = [];
        for (var i = 0; i < xs.length; i++) if (xs[i].GabMin.y <= y0 + TOL && xs[i].GabMax.y >= y1 - TOL) st.push(xs[i]);
        st.sort(function (a, c) { return a.GabMin.x - c.GabMin.x; });
        for (i = 0; i + 1 < st.length; i++) {
            var L = st[i], R = st[i + 1];
            var x0 = L.GabMax.x, x1 = R.GabMin.x;
            if (x1 - x0 < 50) continue;
            var ys = [];
            for (var j = 0; j < shelves.length; j++) {
                var s = shelves[j];
                if (s.GabMin.x >= x0 - 2 && s.GabMax.x <= x1 + 2 && s.GabMin.y >= y0 - 2 && s.GabMax.y <= y1 + 2) ys.push(BZ.r(s.GabMin.y));
            }
            ys.sort(function (a, c) { return a - c; });
            out.push({ zone: zi, y0: y0, y1: y1, h: BZ.r(y1 - y0), x0: BZ.r(x0), x1: BZ.r(x1), w: BZ.r(x1 - x0), left: L.Name, right: R.Name, shelves: ys });
        }
    }
    return out;
};
// shelves (objects) of a section returned by BZ.sections()
BZ.sectionShelves = function (sec) {
    var ctx = BZ.roleCtx();
    return BZ.find(function (o) {
        return !!BZ.panel(o) && BZ.orient(o) === 'Y' && BZ.role(o, ctx) === 'shelf' &&
            o.GabMin.x >= sec.x0 - 2 && o.GabMax.x <= sec.x1 + 2 && o.GabMin.y >= sec.y0 - 2 && o.GabMax.y <= sec.y1 + 2;
    });
};

// ---------- selection helpers ----------
BZ.find = function (filter) {
    var items = BZ.all(), out = [];
    for (var i = 0; i < items.length; i++) {
        var o = items[i].obj;
        if (o.List) continue;
        if (filter(o, items[i].path)) out.push(o);
    }
    return out;
};
BZ.panels = function () { return BZ.find(function (o) { return !!BZ.panel(o); }); };
BZ.byName = function (re) { return BZ.find(function (o) { return re.test(o.Name); }); };
BZ.byUid = function (uid) { var r = BZ.find(function (o) { return BZ.uid(o) === uid; }); return r.length ? r[0] : null; };
BZ.byRole = function (role) { var ctx = BZ.roleCtx(); return BZ.find(function (o) { return BZ.role(o, ctx) === role; }); };
BZ.inY = function (y0, y1, tol) { return BZ.find(function (o) { return BZ.near(o.GabMin.y, y0, tol) && BZ.near(o.GabMax.y, y1, tol); }); };
BZ.aboveY = function (y) { return BZ.find(function (o) { return o.GabMin.y >= y - BZ.EPS; }); };
BZ.belowY = function (y) { return BZ.find(function (o) { return o.GabMax.y <= y + BZ.EPS; }); };
BZ.inBox = function (min, max, tol) {
    tol = tol === undefined ? BZ.EPS : tol;
    return BZ.find(function (o) {
        return o.GabMin.x >= min[0] - tol && o.GabMax.x <= max[0] + tol &&
               o.GabMin.y >= min[1] - tol && o.GabMax.y <= max[1] + tol &&
               o.GabMin.z >= min[2] - tol && o.GabMax.z <= max[2] + tol;
    });
};
BZ.selected = function () { var out = []; for (var i = 0; i < Model.SelectionCount; i++) out.push(Model.Selections[i]); return out; };

// Panel by UID whose global box matches [x0, x1, y0, y1, z0, z1] (shorter arrays and nulls skip checks).
// Falls back to the only panel with that box; throws otherwise, so a command never edits the wrong part.
BZ.pick = function (uid, box, tol) {
    box = box || []; tol = tol === undefined ? 0.6 : tol;
    function fits(o) {
        if (!BZ.panel(o)) return false;
        var v = [o.GabMin.x, o.GabMax.x, o.GabMin.y, o.GabMax.y, o.GabMin.z, o.GabMax.z];
        for (var i = 0; i < box.length && i < 6; i++) if (box[i] !== null && box[i] !== undefined && !BZ.near(v[i], box[i], tol)) return false;
        return true;
    }
    var o = (uid === null || uid === undefined) ? null : BZ.byUid(uid);
    if (o && fits(o)) return o;
    var c = BZ.find(fits);
    if (c.length === 1) return c[0];
    throw new Error('BZ.pick: uid ' + uid + ' box [' + box.join(',') + '] candidates ' + c.length);
};

// Movable units: a part inside a fastener, drawer or door block becomes the outermost such block
// (doors only by AnimType); duplicates and units nested in other picked units are dropped.
BZ.units = function (objs) {
    objs = BZ.arr(objs);
    var items = BZ.all(), byUid = {}, i, j;
    for (i = 0; i < items.length; i++) { var u = BZ.uid(items[i].obj); if (u !== null) byUid[u] = items[i]; }
    var picked = [], seen = {};
    for (i = 0; i < objs.length; i++) {
        var it = byUid[BZ.uid(objs[i])], unit = objs[i];
        if (it) for (j = 0; j < it.anc.length; j++) if (BZ.blockKind(it.anc[j], true)) { unit = it.anc[j]; break; }
        var key = BZ.uid(unit); key = key === null ? 'i' + i : 'u' + key;
        if (!seen[key]) { seen[key] = true; picked.push(unit); }
    }
    var out = [];
    for (i = 0; i < picked.length; i++) {
        var pit = byUid[BZ.uid(picked[i])], inside = false;
        if (pit) for (j = 0; j < pit.anc.length && !inside; j++) { var au = BZ.uid(pit.anc[j]); if (au !== null && seen['u' + au]) inside = true; }
        if (!inside) out.push(picked[i]);
    }
    return out;
};

// Sheet and edge materials used in the model: exact strings to reuse in setMaterial / addButt.
// A base material is stored as "Name\rArticle", or just "Name" when its article is empty,
// so the string alone does not tell whether the material is in the base (checked live 14.09.2026).
BZ._mat = function (s, r) {
    s = String(s || ''); r.material = s;
    try { r.name = ExtractMatName(s); r.code = ExtractMatCode(s); } catch (e) { r.name = s; r.code = ''; }
    return r;
};
BZ.materials = function () {
    var sheets = {}, edges = {}, sl = [], el = [], ps = BZ.panels();
    for (var i = 0; i < ps.length; i++) {
        var p = BZ.panel(ps[i]), key = p.MaterialName + '|' + p.Thickness;
        if (!sheets[key]) { sheets[key] = BZ._mat(p.MaterialName, { t: p.Thickness, panels: 0 }); sl.push(sheets[key]); }
        sheets[key].panels++;
        var bt = BZ.butts(p);
        for (var j = 0; j < bt.length; j++) {
            var ek = bt[j].mat + '|' + bt[j].t;
            if (!edges[ek]) { edges[ek] = BZ._mat(bt[j].mat, { t: bt[j].t, edges: 0 }); el.push(edges[ek]); }
            edges[ek].edges++;
        }
    }
    return { sheets: sl, edges: el };
};

// ---------- editing ----------
BZ.changing = function (o) { try { if (o.List) Undo.RecursiveChanging(o); else Undo.Changing(o); } catch (e) { try { Undo.Changing(o); } catch (e2) {} } };
BZ.arr = function (objs) { if (objs && !objs.length && objs.Name !== undefined) return [objs]; return objs || []; };

// Move object(s) by a GLOBAL delta. Uses TranslateGCS so it is correct inside rotated blocks.
BZ.move = function (objs, dx, dy, dz) {
    objs = BZ.arr(objs);
    for (var i = 0; i < objs.length; i++) {
        var o = objs[i]; BZ.changing(o);
        var ok = false;
        try { if (typeof o.TranslateGCS === 'function') { o.TranslateGCS(V(dx || 0, dy || 0, dz || 0)); ok = true; } } catch (e) { ok = false; }
        if (!ok) { o.PositionX += dx || 0; o.PositionY += dy || 0; o.PositionZ += dz || 0; }
    }
    return objs.length;
};

// Set a contour dimension so that the GLOBAL extent along axis (0=x,1=y,2=z) becomes newLen,
// then keep the min (or max) face fixed.
BZ._resize = function (o, axis, newLen, keepMax) {
    var p = BZ.panel(o); if (!p) return false;
    BZ.changing(o);
    var lo = [o.GabMin.x, o.GabMin.y, o.GabMin.z][axis], hi = [o.GabMax.x, o.GabMax.y, o.GabMax.z][axis];
    var s = BZ.size(o);
    var useCH = BZ.near(p.ContourHeight, s[axis], 1);
    var useCW = BZ.near(p.ContourWidth, s[axis], 1);
    if (!useCH && !useCW) return false;
    if (useCH && !useCW) p.ContourHeight = newLen;
    else if (useCW && !useCH) p.ContourWidth = newLen;
    else { p.ContourHeight = newLen; }
    try { o.Build(); } catch (e) {}
    var cur = [o.GabMin.x, o.GabMin.y, o.GabMin.z][axis];
    var target = keepMax ? (hi - newLen) : lo;
    var fix = target - cur;
    if (Math.abs(fix) > 0.01) {
        var d = [0, 0, 0]; d[axis] = fix;
        BZ.move(o, d[0], d[1], d[2]);
    }
    return true;
};
BZ.setHeight = function (o, h, keepTop) { return BZ._resize(o, 1, h, !!keepTop); };
BZ.setWidth = function (o, w, keepRight) { return BZ._resize(o, 0, w, !!keepRight); };
BZ.setDepth = function (o, d, keepFront) { return BZ._resize(o, 2, d, !!keepFront); };

// Evenly distribute horizontal shelves between y0 (top face of the bottom) and y1 (underside of the top).
// Positions are rounded to whole mm; with step (e.g. 32 for shelf-support holes) they snap to y0 + k*step.
BZ.spreadShelves = function (shelves, y0, y1, step) {
    shelves = BZ.arr(shelves);
    shelves.sort(function (a, b) { return a.GabMin.y - b.GabMin.y; });
    var n = shelves.length; if (!n) return 0;
    var tot = 0; for (var i = 0; i < n; i++) tot += BZ.size(shelves[i])[1];
    var gap = (y1 - y0 - tot) / (n + 1);
    var y = y0 + gap;
    for (i = 0; i < n; i++) {
        var h = BZ.size(shelves[i])[1];
        var target = step ? y0 + Math.round((y - y0) / step) * step : Math.round(y);
        target = Math.max(y0, Math.min(target, y1 - h));
        BZ.move(shelves[i], 0, target - shelves[i].GabMin.y, 0);
        y += h + gap;
    }
    return BZ.r(gap);
};

// Material of panel(s). Thickness is NOT changed automatically (pass t to change it too).
BZ.setMaterial = function (objs, name, t) {
    objs = BZ.arr(objs); var n = 0;
    for (var i = 0; i < objs.length; i++) {
        var p = BZ.panel(objs[i]); if (!p) continue;
        BZ.changing(objs[i]); p.MaterialName = name; if (t) p.Thickness = t; try { objs[i].Build(); } catch (e) {}
        n++;
    }
    return n;
};

// Add a butt (edge band) record directly to panel contour element idx.
// opts: {width, sign, clip} or a sign string (v3 signature). Band width defaults to the nearest standard
// width >= panel thickness + 3 (19 for 16 mm): Bazis analysis wants the band wider than the panel. clip defaults to true.
BZ.BUTT_WIDTHS = [19, 22, 26, 28, 35, 42, 54];
BZ.buttWidth = function (t) {
    for (var i = 0; i < BZ.BUTT_WIDTHS.length; i++) if (BZ.BUTT_WIDTHS[i] >= t + 3) return BZ.BUTT_WIDTHS[i];
    return Math.ceil(t + 3);
};
BZ.addButt = function (o, idx, material, thickness, opts) {
    var p = BZ.panel(o); if (!p) return null;
    if (typeof opts === 'string') opts = { sign: opts };
    opts = opts || {};
    BZ.changing(o);
    var b = p.Butts.Add();
    b.ElemIndex = idx; b.Material = material; b.Thickness = thickness || 0.4;
    try { b.Width = opts.width || BZ.buttWidth(p.Thickness); } catch (e) {}
    if (opts.sign !== undefined) b.Sign = opts.sign;
    // ClipPanel true keeps the panel size (live: without it a 2 mm band made a 700 panel 702); Bazis-made edges have it
    try { b.ClipPanel = opts.clip === undefined ? true : !!opts.clip; } catch (e2) {}
    try { o.Build(); } catch (e3) {}
    return b;
};
BZ.visibleEdges = function (o, dist) {
    var p = BZ.panel(o), out = []; if (!p) return out;
    for (var i = 0; i < p.Contour.Count; i++) { try { if (p.IsButtVisible(i, dist || 5)) out.push(i); } catch (e) {} }
    return out;
};
BZ.rename = function (objs, fn) { objs = BZ.arr(objs); for (var i = 0; i < objs.length; i++) { BZ.changing(objs[i]); objs[i].Name = fn(objs[i].Name, objs[i], i); } return objs.length; };

// New panel exactly in the global box [x0, x1, y0, y1, z0, z1]. orient: 'X' vertical (side), 'Y' horizontal (shelf),
// 'Z' frontal (facade, back). Logs a line when the result differs from the box. 'Y' is not tested live yet.
BZ.addBox = function (orient, name, box, material, thickness, tex) {
    var x0 = box[0], x1 = box[1], y0 = box[2], y1 = box[3], z0 = box[4], z1 = box[5], o;
    if (orient === 'X') o = AddVertPanel(z0, y0, z1, y1, x0);
    else if (orient === 'Y') o = AddHorizPanel(x0, z0, x1, z1, y0);
    else if (orient === 'Z') o = AddFrontPanel(x0, y0, x1, y1, z0);
    else throw new Error('BZ.addBox: orient must be X, Y or Z');
    var p = BZ.panel(o);
    if (material) p.MaterialName = material;
    if (thickness) p.Thickness = thickness;
    if (tex !== undefined && tex !== null) { try { p.TextureOrientation = tex; } catch (e) {} }
    o.Name = name;
    try { o.Build(); } catch (e2) {}
    BZ.move(o, x0 - o.GabMin.x, y0 - o.GabMin.y, z0 - o.GabMin.z);
    var s = BZ.size(o), want = [x1 - x0, y1 - y0, z1 - z0];
    for (var i = 0; i < 3; i++) if (!BZ.near(s[i], want[i], 0.6)) { log('BZ.addBox: ' + name + ' size ' + BZ.json(s) + ' expected ' + BZ.json(want)); break; }
    return o;
};

// ---------- snapshots / diff ----------
// Snapshot of leaf objects: box, name, material, thickness, edges (index:thickness:material), texture orientation
BZ.snapshot = function () {
    var items = BZ.all(), m = {};
    for (var i = 0; i < items.length; i++) {
        var o = items[i].obj; if (o.List) continue;
        var key = BZ.uid(o); if (key === null) key = 'p' + items[i].path;
        var p = BZ.panel(o), sig = '', tex = null;
        if (p) {
            var bt = BZ.butts(p);
            for (var j = 0; j < bt.length; j++) sig += bt[j].i + ':' + bt[j].t + ':' + bt[j].mat + ';';
            try { tex = String(p.TextureOrientation); } catch (e) { tex = null; }
        }
        m[key] = { n: o.Name, p: items[i].path, min: BZ.v3(o.GabMin), max: BZ.v3(o.GabMax), mat: p ? p.MaterialName : null, t: p ? p.Thickness : null, b: sig, tex: tex };
    }
    return m;
};
// Changes between snapshots. A path shift alone (after adding or deleting objects) is not a change.
// Edges and texture are compared only when both snapshots have them (a v3 snapshot does not).
BZ.diff = function (a, b) {
    var out = [], k;
    function core(r, full) { return BZ.json(full ? [r.n, r.min, r.max, r.mat, r.t, r.b, r.tex] : [r.n, r.min, r.max, r.mat, r.t]); }
    for (k in b) if (b.hasOwnProperty(k)) {
        if (!a[k]) { out.push({ op: 'add', name: b[k].n, path: b[k].p, min: b[k].min, max: b[k].max }); continue; }
        var full = a[k].b !== undefined && b[k].b !== undefined;
        if (core(a[k], full) === core(b[k], full)) continue;
        var d = { op: 'mod', name: b[k].n, path: b[k].p, before: [a[k].min, a[k].max], after: [b[k].min, b[k].max] };
        if (a[k].n !== b[k].n) d.rename = [a[k].n, b[k].n];
        if (a[k].mat !== b[k].mat) d.mat = [a[k].mat, b[k].mat];
        if (a[k].t !== b[k].t) d.t = [a[k].t, b[k].t];
        if (full && a[k].b !== b[k].b) d.butts = [a[k].b, b[k].b];
        if (full && a[k].tex !== b[k].tex) d.tex = [a[k].tex, b[k].tex];
        out.push(d);
    }
    for (k in a) if (a.hasOwnProperty(k) && !b[k]) out.push({ op: 'del', name: a[k].n, path: a[k].p });
    return out;
};

// ---------- model inspector ----------
// Sheet for a material string: size from the name ("2800*2070*16 mm", "2750x1830") or BZ.SHEET.
BZ.sheetOf = function (material) {
    var m = /(\d{4})\s*[*xX\u0445\u0425]\s*(\d{4})/.exec(String(material || ''));
    if (m) { var a = +m[1], b = +m[2]; return { len: Math.max(a, b), wid: Math.min(a, b), trim: BZ.SHEET.trim, fromName: true }; }
    return { len: BZ.SHEET.len, wid: BZ.SHEET.wid, trim: BZ.SHEET.trim, fromName: false };
};

// Own checks. SheetSize: the panel contour does not fit its sheet minus trim; texture Horizontal (1) runs along
// ContourWidth, Vertical (2) along ContourHeight (checked live), None (0) may be turned. Overlap: two rectangular
// panels whose boxes intersect deeper than tol (default 1 mm) on all three axes. Panels inside fastener blocks
// are skipped; non-rectangular panels stay out of the overlap check because a notch makes the box lie.
BZ.check = function (opts) {
    opts = opts || {};
    var tol = opts.tol === undefined ? 1 : opts.tol;
    var items = BZ.all(), ps = [], errs = [], i, j, k;
    for (i = 0; i < items.length; i++) {
        var it = items[i], o = it.obj; if (o.List) continue;
        var p = BZ.panel(o); if (!p) continue;
        var skip = false;
        for (j = 0; j < it.anc.length; j++) if (BZ.isFastener(it.anc[j])) { skip = true; break; }
        if (skip) continue;
        var rect = true;
        try { rect = (typeof p.IsContourRectangle === 'function') ? !!p.IsContourRectangle() : (p.IsContourRectangle !== false); } catch (e) {}
        ps.push({ o: o, p: p, rect: rect, min: BZ.v3(o.GabMin), max: BZ.v3(o.GabMax) });
    }
    for (i = 0; i < ps.length; i++) {
        var q = ps[i], s = BZ.sheetOf(q.p.MaterialName), L = s.len - 2 * s.trim, W = s.wid - 2 * s.trim;
        var cw = q.p.ContourWidth, ch = q.p.ContourHeight, tex = 0;
        try { tex = Number(q.p.TextureOrientation) || 0; } catch (e2) {}
        var fits = tex === 1 ? (cw <= L && ch <= W) : tex === 2 ? (ch <= L && cw <= W) : (Math.max(cw, ch) <= L && Math.min(cw, ch) <= W);
        if (!fits) errs.push({ type: 'SheetSize', msg: 'panel ' + BZ.r(ch) + ' x ' + BZ.r(cw) + ' (ContourHeight x ContourWidth, texture ' + tex + ') does not fit sheet ' + s.len + ' x ' + s.wid + ' minus trim ' + s.trim + (s.fromName ? '' : ' (default sheet)'), objects: [q.o.Name] });
    }
    for (i = 0; i < ps.length; i++) {
        if (!ps[i].rect) continue;
        for (j = i + 1; j < ps.length; j++) {
            if (!ps[j].rect) continue;
            var a = ps[i], b = ps[j], ov = [], deep = true;
            for (k = 0; k < 3; k++) { ov.push(Math.min(a.max[k], b.max[k]) - Math.max(a.min[k], b.min[k])); if (ov[k] <= tol) deep = false; }
            if (deep) errs.push({ type: 'Overlap', msg: 'panels overlap ' + BZ.r(ov[0]) + ' x ' + BZ.r(ov[1]) + ' x ' + BZ.r(ov[2]) + ' mm', objects: [a.o.Name, b.o.Name] });
        }
    }
    return errs;
};

// Bazis ModelInspector as such (kept in case a later build fills ErrorList)
BZ._bazisInspect = function (opts) {
    if (typeof NewModelInspector !== 'function') return { available: false, count: 0, errors: [] };
    var insp = NewModelInspector();
    try {
        var O = insp.Options, src = opts || BZ.inspectOptions;
        for (var k in src) if (src.hasOwnProperty(k)) { try { O[k] = src[k]; } catch (e) {} }
        insp.Options = O;
    } catch (e2) {}
    insp.Run(Model);
    var L = insp.ErrorList, n = 0;
    try { n = (L.Count !== undefined) ? L.Count : L.length; } catch (e3) { n = 0; }
    var errs = [];
    for (var i = 0; i < n; i++) {
        var E = L[i] !== undefined ? L[i] : (L.Items ? L.Items[i] : null); if (!E) continue;
        var names = [];
        try { for (var j = 0; j < E.ErrorObjectsCount; j++) { var ob = E.ErrorObjects[j]; if (ob) names.push(ob.Name); } } catch (e4) {}
        errs.push({ type: E.ErrorType, msg: E.ErrorMessage, objects: names.length ? names : E.ObjectsNames });
    }
    return { available: true, count: n, errors: errs };
};
// What the agent runs after a changing command: Bazis inspector plus own checks (opts.own === false skips them)
BZ.inspect = function (opts) {
    var r = BZ._bazisInspect(opts), own = [];
    if (BZ.ownChecks && !(opts && opts.own === false)) {
        try { own = BZ.check(); } catch (e) { own = [{ type: 'CheckError', msg: String(e), objects: [] }]; }
    }
    var errs = (r.errors || []).concat(own);
    return { available: true, count: errs.length, bazis: r.count || 0, own: own.length, errors: errs };
};

// ---------- specification ----------
BZ.spec = function (fileName) {
    var items = BZ.all(), ctx = BZ.roleCtx(), groups = {}, order = [];
    for (var i = 0; i < items.length; i++) {
        var o = items[i].obj; if (o.List) continue;
        var p = BZ.panel(o); if (!p) continue;
        var L = Math.max(p.ContourWidth, p.ContourHeight), W = Math.min(p.ContourWidth, p.ContourHeight);
        var bt = BZ.butts(p), bs = [];
        for (var j = 0; j < bt.length; j++) bs.push(bt[j].i + ':' + bt[j].t);
        bs.sort();
        var key = [o.Name, p.MaterialName, p.Thickness, BZ.r(L), BZ.r(W), bs.join(',')].join('|');
        if (!groups[key]) { groups[key] = { name: o.Name, material: p.MaterialName, t: p.Thickness, L: BZ.r(L), W: BZ.r(W), qty: 0, butts: bt.length, buttSig: bs.join(','), cuts: BZ.cuts(p).length, role: BZ.role(o, ctx), rect: true, art: '' }; order.push(key); }
        var g = groups[key]; g.qty++;
        try { if (p.IsContourRectangle === false || (typeof p.IsContourRectangle === 'function' && !p.IsContourRectangle())) g.rect = false; } catch (e) {}
        try { if (o.ArtPos) g.art = o.ArtPos; } catch (e2) {}
    }
    var rows = [];
    for (i = 0; i < order.length; i++) rows.push(groups[order[i]]);
    if (fileName) {
        var csv = [['Name', 'Material', 'T', 'L', 'W', 'Qty', 'Butts', 'ButtSig', 'Cuts', 'Role', 'Rect', 'Art']];
        for (i = 0; i < rows.length; i++) { var r = rows[i]; csv.push([r.name, r.material, r.t, r.L, r.W, r.qty, r.butts, r.buttSig, r.cuts, r.role, r.rect ? 1 : 0, r.art]); }
        BZ.writeCsv(fileName, csv);
    }
    return rows;
};

BZ.ranges = function () {
    var items = BZ.all(), out = [];
    for (var i = 0; i < items.length; i++) {
        var o = items[i].obj; if (o.List) continue;
        out.push({ p: items[i].path, n: o.Name, y: [o.GabMin.y, o.GabMax.y], x: [o.GabMin.x, o.GabMax.x], z: [o.GabMin.z, o.GabMax.z] });
    }
    return out;
};

// Backup of the open model FILE: _claude\<name>_BACKUP_yyyyMMdd_HHmmss.b3d
// It copies the last SAVED state from disk: unsaved changes made in Bazis are not in it.
BZ.backup = function () {
    var src = null; try { src = Action.ModelFilename; } catch (e) {}
    if (!src) { log('backup: the model has never been saved, there is no file to copy'); return null; }
    if (!BZ.fs) return null;
    var d = new Date(); function z(n) { return (n < 10 ? '0' : '') + n; }
    var stamp = d.getFullYear() + z(d.getMonth() + 1) + z(d.getDate()) + '_' + z(d.getHours()) + z(d.getMinutes()) + z(d.getSeconds());
    var base = src.replace(/^.*[\\\/]/, '').replace(/\.b3d$/i, '');
    var dst = BZ.DIR + base + '_BACKUP_' + stamp + '.b3d';
    BZ.fs.writeFileSync(dst, BZ.fs.readFileSync(src));
    return dst;
};

// Save the open model into its own file. Only when the user asked for it.
// The previous file is backed up first. Unsaved edits are lost if Bazis closes, so offer this after a series of edits.
BZ.save = function () {
    var file = null; try { file = Action.ModelFilename; } catch (e) {}
    if (!file) throw new Error('BZ.save: the model has no file yet, the user has to save it once in Bazis');
    var bak = BZ.backup();
    Action.SaveModel(file);
    var now = null; try { now = Action.ModelFilename; } catch (e2) {}
    return { file: file, backup: bak, sameFile: now === file };
};

BZ.caps = function () {
    var c = { lib: BZ.VERSION, fs: !!BZ.fs, vm: !!BZ.vm, path: !!BZ.path };
    try { c.node = process.version; } catch (e) { c.node = null; }
    try { c.api = system.apiVersion; } catch (e) {}
    try { c.es6 = eval('(() => { let a = [1,2].map(v => v * 2); const t = `x${a[1]}`; class K {} return t === "x4"; })()'); } catch (e) { c.es6 = false; }
    c.inspector = typeof NewModelInspector === 'function';
    c.loadSave = typeof LoadModel === 'function' || (typeof Action.LoadModel === 'function');
    return c;
};
