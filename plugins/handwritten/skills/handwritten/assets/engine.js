/* handwritten engine: превращает разметку в рукописный лист.
   Порядок важен: сначала всё, что меняет раскладку (дудлы, скетчи), потом то, что по ней меряется
   (рамки, выделения, стрелки). Итог пишется в body[data-w|data-h|data-ready|data-warn] для рендера. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const root = document.documentElement;
  if (/[?&]render\b/.test(location.search)) root.classList.add('render');

  const warns = [];
  const warn = (m) => { warns.push(m); console.warn('[handwritten]', m); };

  let seed = 424242;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const nextSeed = () => Math.floor(rnd() * 1e6) + 1;

  const tok = (n) => getComputedStyle(root).getPropertyValue('--' + n).trim();
  const INKS = ['ink', 'muted', 'blue', 'red', 'green', 'purple', 'orange', 'paper'];
  const HLS = ['yellow', 'pink', 'green', 'blue', 'orange', 'purple'];
  const ink = (c, fb = 'ink') => { c = c || fb; return INKS.includes(c) ? tok(c) : c; };
  const hl = (c, fb = 'yellow') => { c = c || fb; return HLS.includes(c) ? tok('hl-' + c) : ink(c); };
  const accentOf = (el) => getComputedStyle(el).getPropertyValue('--accent').trim() || tok('ink');

  const pen = (stroke, extra = {}) => ({
    stroke, strokeWidth: 1.8, roughness: 0.9, bowing: 0.8, disableMultiStroke: true, seed: nextSeed(), ...extra,
  });

  function svgEl(w, h, css) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('width', w); s.setAttribute('height', h);
    if (css) s.style.cssText = css;
    return s;
  }

  /* ---------- лёгкий наклон ---------- */
  function tilt(sheet) {
    sheet.querySelectorAll('.block, .sticky, .note, .frame, .callout, .tag, .pill').forEach((el) => {
      if (el.style.getPropertyValue('--r') || el.hasAttribute('data-straight')) return;
      const k = el.classList.contains('sticky') ? 3.4 : el.classList.contains('note') ? 5 : 1.0;
      el.style.setProperty('--r', ((rnd() - 0.5) * k).toFixed(2) + 'deg');
    });
  }

  /* ---------- библиотека дудлов, координаты 0..100 ---------- */
  const star = (cx, cy, R, r) => Array.from({ length: 10 }, (_, i) => {
    const a = (-90 + i * 36) * Math.PI / 180, q = i % 2 ? r : R;
    return [cx + q * Math.cos(a), cy + q * Math.sin(a)];
  });
  const DOODLES = {
    bulb: (g, o, f, s) => [g.path('M36 64 C20 52 20 20 50 18 C80 20 80 52 64 64 L63 74 L37 74 Z', f), g.line(39, 82, 61, 82, o), g.line(43, 90, 57, 90, o),
      g.path('M44 62 L44 48 L50 54 L56 48 L56 62', o), g.line(50, 2, 50, 10, o), g.line(14, 16, 20, 23, o), g.line(86, 16, 80, 23, o), g.line(4, 42, 12, 42, o), g.line(96, 42, 88, 42, o)],
    star: (g, o, f) => [g.polygon(star(50, 54, 46, 19), f)],
    check: (g, o) => [g.linearPath([[12, 54], [40, 82], [90, 18]], { ...o, strokeWidth: o.strokeWidth * 1.6 })],
    cross: (g, o) => [g.line(18, 18, 82, 82, { ...o, strokeWidth: o.strokeWidth * 1.6 }), g.line(82, 18, 18, 82, { ...o, strokeWidth: o.strokeWidth * 1.6 })],
    warn: (g, o, f, s) => [g.polygon([[50, 8], [95, 90], [5, 90]], f), g.line(50, 38, 50, 64, { ...o, strokeWidth: o.strokeWidth * 1.4 }), g.circle(50, 77, 7, s)],
    question: (g, o, f, s) => [g.path('M30 34 C30 10 72 8 72 32 C72 50 50 48 50 66', { ...o, strokeWidth: o.strokeWidth * 1.4 }), g.circle(50, 84, 8, s)],
    exclaim: (g, o, f, s) => [g.line(50, 8, 50, 64, { ...o, strokeWidth: o.strokeWidth * 1.8 }), g.circle(50, 84, 9, s)],
    search: (g, o, f) => [g.circle(42, 42, 58, f), g.line(63, 63, 92, 92, { ...o, strokeWidth: o.strokeWidth * 1.8 })],
    clock: (g, o, f) => [g.circle(50, 50, 88, f), g.line(50, 50, 50, 22, o), g.line(50, 50, 70, 60, o)],
    cloud: (g, o, f) => [g.path('M26 76 C6 76 4 52 24 50 C22 28 48 20 57 38 C64 22 88 28 83 48 C100 50 98 76 78 76 Z', f)],
    db: (g, o, f) => [g.path('M16 20 L16 80 C16 96 84 96 84 80 L84 20', f), g.ellipse(50, 20, 68, 22, f), g.path('M16 50 C16 66 84 66 84 50', o)],
    server: (g, o, f, s) => [g.rectangle(12, 10, 76, 36, f), g.rectangle(12, 54, 76, 36, f), g.circle(26, 28, 6, s), g.circle(26, 72, 6, s), g.line(44, 28, 76, 28, o), g.line(44, 72, 76, 72, o)],
    person: (g, o, f) => [g.circle(50, 28, 32, f), g.path('M18 94 C18 62 34 56 50 56 C66 56 82 62 82 94', f)],
    people: (g, o, f) => [g.circle(34, 34, 26, f), g.path('M8 90 C8 62 20 56 34 56 C48 56 60 62 60 90', f), g.circle(70, 30, 22, f), g.path('M58 54 C62 52 66 52 70 52 C84 52 94 58 94 84', o)],
    heart: (g, o, f) => [g.path('M50 88 C10 62 8 26 30 20 C43 17 50 30 50 36 C50 30 57 17 70 20 C92 26 90 62 50 88 Z', f)],
    target: (g, o, f, s) => [g.circle(50, 50, 90, o), g.circle(50, 50, 58, f), g.circle(50, 50, 22, s)],
    bolt: (g, o, f) => [g.polygon([[60, 4], [20, 56], [46, 56], [38, 96], [80, 40], [54, 40], [66, 4]], f)],
    flag: (g, o, f) => [g.line(20, 96, 20, 6, { ...o, strokeWidth: o.strokeWidth * 1.3 }), g.path('M20 10 C40 0 56 22 86 10 L86 52 C56 64 40 42 20 52 Z', f)],
    book: (g, o, f) => [g.path('M50 26 C36 14 20 14 5 18 L5 82 C20 78 36 78 50 90 C64 78 80 78 95 82 L95 18 C80 14 64 14 50 26 Z', f), g.line(50, 26, 50, 90, o)],
    gear: (g, o, f) => [g.circle(50, 50, 60, f), g.circle(50, 50, 22, o),
      ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return g.line(50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a), 50 + 44 * Math.cos(a), 50 + 44 * Math.sin(a), { ...o, strokeWidth: o.strokeWidth * 2.4 }); })],
    rocket: (g, o, f) => [g.path('M50 4 C72 24 72 50 64 70 L36 70 C28 50 28 24 50 4 Z', f), g.circle(50, 36, 16, o), g.path('M36 52 L18 76 L34 71', o), g.path('M64 52 L82 76 L66 71', o),
      g.path('M42 76 C44 86 50 96 50 96 C50 96 56 86 58 76', { ...o, stroke: ink('orange') })],
    chat: (g, o, f, s) => [g.path('M12 14 L88 14 C93 14 95 17 95 22 L95 60 C95 65 93 68 88 68 L42 68 L22 88 L26 68 L12 68 C7 68 5 65 5 60 L5 22 C5 17 7 14 12 14 Z', f), g.circle(32, 41, 7, s), g.circle(50, 41, 7, s), g.circle(68, 41, 7, s)],
    atom: (g, o, f, s) => {
      const e = [0, 60, 120].map((deg) => { const n = g.ellipse(50, 50, 96, 34, o); n.setAttribute('transform', `rotate(${deg} 50 50)`); return n; });
      return [...e, g.circle(50, 50, 14, s)];
    },
    flask: (g, o, f) => [g.path('M38 8 L38 38 L12 84 C9 91 12 95 19 95 L81 95 C88 95 91 91 88 84 L62 38 L62 8', o), g.line(31, 8, 69, 8, o),
      g.path('M24 66 C38 60 52 72 76 66 L86 86 C88 91 86 93 80 93 L20 93 C14 93 12 91 14 86 Z', f)],
    pencil: (g, o, f) => [g.path('M14 88 L22 64 L70 16 L86 32 L38 80 Z', f), g.line(22, 64, 38, 80, o), g.line(62, 24, 78, 40, o)],
    smile: (g, o, f, s) => [g.circle(50, 50, 88, f), g.circle(36, 40, 7, s), g.circle(64, 40, 7, s), g.path('M30 60 C40 78 60 78 70 60', o)],
    sad: (g, o, f, s) => [g.circle(50, 50, 88, f), g.circle(36, 40, 7, s), g.circle(64, 40, 7, s), g.path('M30 74 C40 58 60 58 70 74', o)],
    sun: (g, o, f) => [g.circle(50, 50, 42, f), ...Array.from({ length: 8 }, (_, i) => { const a = i * Math.PI / 4; return g.line(50 + 30 * Math.cos(a), 50 + 30 * Math.sin(a), 50 + 46 * Math.cos(a), 50 + 46 * Math.sin(a), o); })],
    home: (g, o, f) => [g.path('M22 44 L22 92 L78 92 L78 44', f), g.linearPath([[8, 52], [50, 12], [92, 52]], o), g.rectangle(42, 66, 16, 26, o)],
    code: (g, o) => { const w = { ...o, strokeWidth: o.strokeWidth * 1.4 }; return [g.linearPath([[32, 24], [6, 50], [32, 76]], w), g.linearPath([[68, 24], [94, 50], [68, 76]], w), g.line(58, 14, 42, 86, w)]; },
    mail: (g, o, f) => [g.rectangle(6, 20, 88, 60, f), g.linearPath([[6, 20], [50, 56], [94, 20]], o)],
    lock: (g, o, f, s) => [g.path('M32 46 L32 30 C32 6 68 6 68 30 L68 46', o), g.rectangle(18, 46, 64, 48, f), g.circle(50, 68, 10, s)],
    key: (g, o, f) => [g.circle(28, 50, 36, f), g.linearPath([[46, 50], [94, 50], [94, 64]], o), g.line(80, 50, 80, 62, o)],
    calendar: (g, o, f) => [g.rectangle(8, 16, 84, 76, f), g.line(8, 36, 92, 36, o), g.line(30, 6, 30, 24, o), g.line(70, 6, 70, 24, o),
      g.line(28, 54, 40, 66, o), g.line(40, 54, 28, 66, o)],
    chart: (g, o) => [g.linearPath([[10, 4], [10, 92], [96, 92]], o), g.linearPath([[18, 76], [40, 52], [58, 62], [86, 22]], { ...o, stroke: ink('red'), strokeWidth: o.strokeWidth * 1.3 }),
      g.linearPath([[74, 22], [86, 22], [86, 34]], { ...o, stroke: ink('red'), strokeWidth: o.strokeWidth * 1.3 })],
    bars: (g, o, f) => [g.line(6, 94, 96, 94, o), g.rectangle(14, 60, 18, 34, f), g.rectangle(42, 36, 18, 58, f), g.rectangle(70, 14, 18, 80, f)],
    money: (g, o, f) => [g.circle(50, 50, 88, f), g.path('M62 32 C58 26 40 24 38 36 C36 48 64 46 62 60 C60 74 40 72 36 64', o), g.line(50, 18, 50, 82, o)],
    trophy: (g, o, f) => [g.path('M28 10 L72 10 L72 36 C72 58 28 58 28 36 Z', f), g.path('M28 18 C10 18 12 42 30 44', o), g.path('M72 18 C90 18 88 42 70 44', o),
      g.line(50, 56, 50, 76, o), g.rectangle(32, 76, 36, 14, o)],
    leaf: (g, o, f) => [g.path('M14 88 C8 40 40 10 92 8 C92 60 64 92 14 88 Z', f), g.path('M14 88 C40 60 60 40 80 22', o)],
    puzzle: (g, o, f) => [g.path('M10 30 L38 30 C34 14 60 14 56 30 L84 30 L84 56 C98 52 98 78 84 74 L84 92 L10 92 Z', f)],
    arrow: (g, o) => [g.path('M6 80 C24 26 64 96 92 24', o), g.linearPath([[78, 30], [92, 24], [94, 40]], o)],
    loop: (g, o) => [g.path('M80 30 C66 8 28 8 16 32 C4 58 24 88 52 88 C74 88 88 72 88 54', o), g.linearPath([[70, 30], [82, 32], [84, 18]], o)],
  };

  /* ---------- компоненты с автораскладкой: .seq .timeline .tree .cycle .vs ---------- */
  let autoId = 0;
  const uid = (el, prefix) => el.id || (el.id = `${prefix}-${++autoId}`);
  const svgNode = (tag, attrs, text) => {
    const n = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => v !== undefined && v !== null && n.setAttribute(k, v));
    if (text !== undefined) n.textContent = text;
    return n;
  };
  const list = (v) => (v || '').split(',').map((t) => t.trim()).filter(Boolean);

  // диаграмма последовательности: участники сверху, сообщения стрелками сверху вниз
  function buildSeq(el) {
    const actors = list(el.dataset.actors);
    if (actors.length < 1) { warn('.seq: нет data-actors'); return; }
    const colors = list(el.dataset.colors);
    const items = [...el.children].filter((c) => c.tagName === 'I');
    const W = el.clientWidth || 800;
    const boxH = 48;
    const hasSide = (a) => items.some((i) => i.dataset.side === a);
    const boxW = Math.min(220, Math.max(120, W / actors.length - 40));
    const padL = actors.length > 1 && hasSide(actors[0]) ? Math.max(boxW / 2 + 8, 190) : boxW / 2 + 4;
    const padR = actors.length > 1 && hasSide(actors[actors.length - 1]) ? Math.max(boxW / 2 + 8, 190) : boxW / 2 + 4;
    const X = actors.map((_, i) => actors.length === 1 ? W / 2 : padL + i * (W - padL - padR) / (actors.length - 1));
    const idx = (name) => { const i = actors.indexOf(name.trim()); if (i < 0) warn(`.seq: участник "${name.trim()}" не найден в data-actors`); return i; };
    const svg = svgNode('svg', { class: 'sketch', width: W, viewBox: `0 0 ${W} 100` });
    el.textContent = '';
    el.appendChild(svg);
    actors.forEach((a, i) => {
      const c = colors[i] || 'ink';
      svg.appendChild(svgNode('rect', { x: X[i] - boxW / 2, y: 4, width: boxW, height: boxH, stroke: c, 'stroke-width': 1.8 }));
      svg.appendChild(svgNode('text', { x: X[i], y: 4 + boxH / 2 + 9, 'text-anchor': 'middle', 'font-size': 27, 'font-weight': 700, fill: c }, a));
    });
    let y = boxH + 30, lastArrowY = y, sideStack = {};
    const fit = (t, maxW) => { const L = t.getComputedTextLength(); if (L > maxW) t.setAttribute('font-size', Math.max(15, +t.getAttribute('font-size') * maxW / L)); };
    items.forEach((it) => {
      const d = it.dataset, color = d.color;
      if ('divider' in d) {
        const c = color || 'red';
        svg.appendChild(svgNode('line', { x1: 8, y1: y + 14, x2: W - 8, y2: y + 14, stroke: c, 'stroke-width': 1.7, 'stroke-dasharray': '10 8' }));
        const t = svgNode('text', { x: W / 2, y: y + 21, 'text-anchor': 'middle', 'font-size': 22, fill: c, class: 'print', 'data-bg': '' }, it.textContent.trim());
        svg.appendChild(t);
        y += 46;
        return;
      }
      if (d.side) {
        const i = idx(d.side);
        if (i < 0) return;
        const k = (sideStack[i] = (sideStack[i] || 0) + 1);
        const left = actors.length > 1 && i === 0;
        const t = svgNode('text', { x: X[i] + (left ? -14 : 14), y: lastArrowY + 20 + (k - 1) * 22, 'text-anchor': left ? 'end' : 'start', 'font-size': 19, fill: color || 'muted' }, it.textContent.trim());
        svg.appendChild(t);
        fit(t, (left ? X[i] : W - X[i]) - 18);
        return;
      }
      if (!d.msg) return;
      const [fromN, toN] = d.msg.split('>');
      const a = idx(fromN || ''), b = idx(toN || '');
      if (a < 0 || b < 0) return;
      const c = color || colors[a] || 'ink';
      const label = it.textContent.trim();
      sideStack = {};
      if (a === b) {
        // у крайнего правого участника петля и подпись уходят влево, иначе вылезут за край
        const dir = actors.length > 1 && a === actors.length - 1 ? -1 : 1;
        const x0 = X[a] + 4 * dir, top = y + 30;
        svg.appendChild(svgNode('path', { d: `M ${x0} ${top} h ${56 * dir} v 34 h ${-52 * dir}`, stroke: c, 'stroke-width': 2, 'data-arrow': 'end', 'stroke-dasharray': 'dash' in d ? '8 6' : null }));
        const t = svgNode('text', { x: x0 + 68 * dir, y: top + 22, 'text-anchor': dir > 0 ? 'start' : 'end', 'font-size': 23, 'font-weight': 700, fill: c }, label);
        svg.appendChild(t);
        fit(t, dir > 0 ? W - x0 - 72 : x0 - 72);
        lastArrowY = top + 34;
        y += 82;
        return;
      }
      const x1 = X[a] + (b > a ? 4 : -4), x2 = X[b] + (b > a ? -4 : 4);
      const ay = y + 34, by = ay + 12;
      svg.appendChild(svgNode('line', { x1, y1: ay, x2, y2: by, stroke: c, 'stroke-width': 2, 'data-arrow': 'end', 'stroke-dasharray': 'dash' in d ? '8 6' : null }));
      const t = svgNode('text', { x: (x1 + x2) / 2, y: ay - 6, 'text-anchor': 'middle', 'font-size': 25, 'font-weight': 700, fill: c }, label);
      svg.appendChild(t);
      fit(t, Math.abs(x2 - x1) - 16);
      if (d.note) {
        const n = svgNode('text', { x: (x1 + x2) / 2, y: by + 24, 'text-anchor': 'middle', 'font-size': 19, fill: 'muted' }, d.note);
        svg.appendChild(n);
        fit(n, Math.abs(x2 - x1) - 10);
      }
      lastArrowY = (ay + by) / 2;
      y += d.note ? 86 : 64;
    });
    const H = y + 10;
    actors.forEach((_, i) => svg.insertBefore(svgNode('line', { x1: X[i], y1: boxH + 8, x2: X[i], y2: H - 4, stroke: 'muted', 'stroke-width': 1.3, 'stroke-dasharray': '6 7' }), svg.firstChild));
    svg.setAttribute('height', H);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  }

  // шкала времени: <div data-at="1995">...</div>, .v - вертикальная
  function buildTimeline(el) {
    [...el.children].forEach((it) => {
      if (!it.hasAttribute('data-at')) return;
      const body = document.createElement('div');
      body.className = 'tl-body';
      while (it.firstChild) body.appendChild(it.firstChild);
      it.classList.add('tl-item');
      if (it.dataset.color) it.style.setProperty('--accent', `var(--${it.dataset.color})`);
      it.innerHTML = `<div class="tl-at">${esc(it.dataset.at)}</div><span class="tl-dot"></span>`;
      it.appendChild(body);
    });
  }
  function drawTimeline(el) {
    const dots = [...el.querySelectorAll(':scope > .tl-item > .tl-dot')];
    if (dots.length < 1) return;
    const er = el.getBoundingClientRect();
    const svg = svgEl(el.offsetWidth, el.offsetHeight, 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0');
    el.style.position = 'relative';
    el.insertBefore(svg, el.firstChild);
    const g = rough.svg(svg);
    const P = dots.map((d) => { const r = d.getBoundingClientRect(); return [r.left - er.left + r.width / 2, r.top - er.top + r.height / 2]; });
    const col = accentOf(el);
    if (P.length > 1) {
      const vert = el.classList.contains('v');
      const [a, b] = [P[0], P[P.length - 1]];
      const pad = 26;
      const p1 = vert ? [a[0], a[1] - pad] : [a[0] - pad, a[1]], p2 = vert ? [b[0], b[1] + pad] : [b[0] + pad, b[1]];
      svg.appendChild(g.line(p1[0], p1[1], p2[0], p2[1], pen(col, { strokeWidth: 2, roughness: 1 })));
      const ang = Math.atan2(p2[1] - p1[1], p2[0] - p1[0]);
      svg.appendChild(g.linearPath([[p2[0] - 12 * Math.cos(ang - 0.45), p2[1] - 12 * Math.sin(ang - 0.45)], p2, [p2[0] - 12 * Math.cos(ang + 0.45), p2[1] - 12 * Math.sin(ang + 0.45)]], pen(col, { strokeWidth: 2 })));
    }
    dots.forEach((d, i) => {
      const hot = d.parentElement.hasAttribute('data-hl');
      const c = accentOf(d.parentElement);
      svg.appendChild(g.circle(P[i][0], P[i][1], hot ? 22 : 16, pen(c, { strokeWidth: 2, fill: hot ? c : tok('paper'), fillStyle: 'solid' })));
    });
  }

  // дерево и mind map из вложенных <ul>: .tree - слева направо, .tree.mind - ветки в обе стороны
  function buildTree(el) {
    const nodeOf = (li) => {
      if (li.querySelector(':scope > .tr-node')) return;
      const span = document.createElement('span');
      span.className = 'tr-node';
      [...li.childNodes].filter((n) => !(n.nodeType === 1 && n.tagName === 'UL')).forEach((n) => span.appendChild(n));
      li.insertBefore(span, li.firstChild);
    };
    const rootUl = el.querySelector(':scope > ul');
    let root = [...el.children].find((c) => c !== rootUl && c.tagName !== 'I');
    if (root) {
      root.classList.add('tr-node', 'tr-root', el.classList.contains('mind') ? 'pill' : 'frame');
      root.dataset.box = root.dataset.box || 'ink';
    }
    el.querySelectorAll('li').forEach(nodeOf);
    const palette = ['blue', 'green', 'orange', 'purple', 'red'];
    if (rootUl) [...rootUl.children].forEach((li, i) => li.style.setProperty('--branch', `var(--${li.dataset.color || palette[i % palette.length]})`));
    if (el.classList.contains('mind') && rootUl && root) {
      const kids = [...rootUl.children], half = Math.ceil(kids.length / 2);
      const left = document.createElement('ul');
      left.className = 'tr-left';
      kids.slice(half).forEach((li) => left.appendChild(li));
      el.insertBefore(left, root);
    }
  }
  function drawTree(el) {
    const er = el.getBoundingClientRect();
    const svg = svgEl(el.offsetWidth, el.offsetHeight, 'position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0');
    el.style.position = 'relative';
    el.insertBefore(svg, el.firstChild);
    const g = rough.svg(svg);
    const box = (n) => { const r = n.getBoundingClientRect(); return { l: r.left - er.left, r: r.right - er.left, cy: r.top - er.top + r.height / 2, cx: r.left - er.left + r.width / 2 }; };
    const link = (from, to, color, w) => {
      const a = box(from), b = box(to);
      const toLeft = b.cx < a.cx;
      const x1 = toLeft ? a.l - 6 : a.r + 6, x2 = toLeft ? b.r + 6 : b.l - 6, dx = (x2 - x1) * 0.5;
      svg.appendChild(g.path(`M ${x1} ${a.cy} C ${x1 + dx} ${a.cy} ${x2 - dx} ${b.cy} ${x2} ${b.cy}`, pen(color, { strokeWidth: w, roughness: 0.8 })));
    };
    const root = el.querySelector(':scope > .tr-root');
    const branchColor = (li) => getComputedStyle(li).getPropertyValue('--branch').trim() || accentOf(el);
    el.querySelectorAll(':scope > ul > li, :scope > ul.tr-left > li').forEach((li) => {
      const n = li.querySelector(':scope > .tr-node');
      if (root && n) link(root, n, branchColor(li), 2.4);
    });
    el.querySelectorAll('li').forEach((li) => {
      const n = li.querySelector(':scope > .tr-node');
      li.querySelectorAll(':scope > ul > li > .tr-node').forEach((c) => link(n, c, branchColor(li), 1.6));
    });
  }

  // цикл: элементы по кругу, стрелки между соседями
  function buildCycle(el) {
    const items = [...el.children].filter((c) => !c.classList.contains('cy-center'));
    const n = items.length;
    if (n < 2) return;
    const S = +(el.dataset.size || Math.min(el.clientWidth || 460, 520));
    el.style.width = S + 'px';
    el.style.height = S + 'px';
    if (el.dataset.center) {
      const c = document.createElement('div');
      c.className = 'cy-center';
      c.innerHTML = el.dataset.center;
      el.appendChild(c);
    }
    const R = S / 2 - Math.min(80, S * 0.17), id = uid(el, 'cy');
    items.forEach((it, i) => {
      const a = (-90 + (i * 360) / n) * Math.PI / 180;
      it.classList.add('cy-item', 'pill');
      if (it.dataset.color) it.dataset.box = it.dataset.color;
      it.style.left = S / 2 + R * Math.cos(a) + 'px';
      it.style.top = S / 2 + R * Math.sin(a) + 'px';
      it.id = it.id || `${id}-${i}`;
    });
    items.forEach((it, i) => {
      const next = items[(i + 1) % n];
      const ar = document.createElement('i');
      ar.className = 'arrow';
      Object.assign(ar.dataset, { from: '#' + it.id, to: '#' + next.id, bend: el.dataset.bend || '0.22', color: el.dataset.color || 'muted', gap: '14' });
      el.appendChild(ar);
    });
  }

  // сравнение: <i data-label="критерий">слева | справа</i>
  function buildVs(el) {
    const rows = [...el.children].filter((c) => c.tagName === 'I');
    const lc = el.dataset.leftColor || 'red', rc = el.dataset.rightColor || 'green';
    let html = `<div class="vs-h vs-l" style="color:var(--${lc})">${el.dataset.left || ''}</div><div class="vs-h vs-m"><span class="pill" data-box="ink">vs</span></div><div class="vs-h vs-r" style="color:var(--${rc})">${el.dataset.right || ''}</div>`;
    rows.forEach((r) => {
      const [a, b] = r.innerHTML.split(/\s\|\s/);
      html += `<div class="vs-l">${a ?? ''}</div><div class="vs-m">${r.dataset.label ? esc(r.dataset.label) : ''}</div><div class="vs-r">${b ?? ''}</div>`;
    });
    el.innerHTML = html;
  }

  function components(sheet) {
    sheet.querySelectorAll('.block, .area').forEach((b) => {
      if (b.id) return;
      const h = b.querySelector(':scope > h2') || (b.dataset.label && { textContent: b.dataset.label });
      const slug = h && h.textContent.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
      if (slug && !document.getElementById(slug)) b.id = slug;
    });
    sheet.querySelectorAll('.seq').forEach(buildSeq);
    sheet.querySelectorAll('.timeline').forEach(buildTimeline);
    sheet.querySelectorAll('.tree').forEach(buildTree);
    sheet.querySelectorAll('.cycle').forEach(buildCycle);
    sheet.querySelectorAll('.vs').forEach(buildVs);
  }
  // рисуется после раскладки (нужны реальные координаты)
  function drawComponents(sheet) {
    sheet.querySelectorAll('.timeline').forEach(drawTimeline);
    sheet.querySelectorAll('.tree').forEach(drawTree);
  }

  function drawDoodles(sheet) {
    sheet.querySelectorAll('[data-doodle]').forEach((el) => {
      el.classList.add('doodle');
      const name = el.dataset.doodle, fn = DOODLES[name];
      if (!fn) { warn(`doodle "${name}" не найден`); return; }
      const size = +(el.dataset.size || 56);
      const svg = svgEl(size, size);
      svg.setAttribute('viewBox', '-6 -6 112 112');
      svg.style.overflow = 'visible';
      const g = rough.svg(svg);
      const k = 112 / size;
      const o = pen(ink(el.dataset.color, 'ink'), { strokeWidth: +(el.dataset.stroke || 1.9) * k, roughness: 0.8 });
      const f = el.dataset.fill ? { ...o, fill: hl(el.dataset.fill), fillStyle: el.dataset.fillStyle || 'hachure', hachureGap: 4.5 * k, fillWeight: 1.3 * k, hachureAngle: -40 } : o;
      const s = { ...o, fill: o.stroke, fillStyle: 'solid' };
      fn(g, o, f, s).forEach((n) => svg.appendChild(n));
      el.appendChild(svg);
    });
  }

  /* ---------- <i class="to"></i>: короткая стрелка в строке (формулы, "A -> B") ---------- */
  function drawInlineArrows(sheet) {
    sheet.querySelectorAll('i.to').forEach((el) => {
      const w = el.offsetWidth || 36, h = 16, y = h / 2;
      const svg = svgEl(w, h, 'display:block;overflow:visible');
      const g = rough.svg(svg), c = ink(el.dataset.color, 'ink');
      svg.appendChild(g.line(2, y, w - 2, y, pen(c, { strokeWidth: 1.7, roughness: 0.7 })));
      const head = (x, dir) => svg.appendChild(g.linearPath([[x - dir * 9, y - 5], [x, y], [x - dir * 9, y + 5]], pen(c, { strokeWidth: 1.7, roughness: 0.5 })));
      head(w - 2, 1);
      if (el.dataset.heads === 'both') head(2, -1);
      el.appendChild(svg);
    });
  }

  /* ---------- svg.sketch: обычный SVG -> рукописный ---------- */
  function roughify(sheet) {
    sheet.querySelectorAll('svg.sketch').forEach((svg) => {
      const g = rough.svg(svg);
      const R = +(svg.dataset.roughness || 0.9);
      svg.querySelectorAll('text').forEach((t) => {
        const f = t.getAttribute('fill');
        if (f) t.setAttribute('fill', f.startsWith('hl-') ? hl(f.slice(3)) : ink(f));
        if (t.hasAttribute('data-bg')) {
          const b = t.getBBox(), bg = document.createElementNS(NS, 'rect');
          [['x', b.x - 4], ['y', b.y - 1], ['width', b.width + 8], ['height', b.height + 2]].forEach(([k, v]) => bg.setAttribute(k, v));
          bg.setAttribute('fill', tok('paper'));
          bg.setAttribute('data-keep', '');
          if (t.getAttribute('transform')) bg.setAttribute('transform', t.getAttribute('transform'));
          t.before(bg);
        }
      });
      svg.querySelectorAll('circle, ellipse, line, rect, path, polygon, polyline').forEach((s) => {
        if (s.closest('defs, [data-keep]') || s.hasAttribute('data-keep')) return;
        const at = (n, d = 0) => +(s.getAttribute(n) ?? d);
        const strokeA = s.getAttribute('stroke'), fillA = s.getAttribute('fill');
        const hasFill = fillA && fillA !== 'none';
        // как в SVG: без stroke у залитой фигуры контура нет, у незалитой - чернила
        const stroke = strokeA === 'none' ? 'transparent' : strokeA ? ink(strokeA) : hasFill ? 'transparent' : tok('ink');
        const opts = pen(stroke, { strokeWidth: at('stroke-width', 2), roughness: +(s.dataset.roughness || R) });
        if (hasFill) {
          const style = s.dataset.fillStyle || svg.dataset.fillStyle || 'hachure';
          // fill="hl-blue" - маркер, fill="blue" - чернила, fill="yellow"/"pink" - маркер (чернил таких нет)
          const fill = fillA.startsWith('hl-') ? hl(fillA.slice(3)) : INKS.includes(fillA) ? ink(fillA) : hl(fillA);
          Object.assign(opts, { fill, fillStyle: style, hachureGap: +(s.dataset.gap || 5), fillWeight: 1.2, hachureAngle: -40 });
        }
        if (s.hasAttribute('stroke-dasharray')) opts.strokeLineDash = s.getAttribute('stroke-dasharray').split(/[ ,]+/).map(Number);
        const pts = () => (s.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number).reduce((a, v, i) => (i % 2 ? a[a.length - 1].push(v) : a.push([v]), a), []);
        let n;
        switch (s.tagName.toLowerCase()) {
          case 'circle': n = g.circle(at('cx'), at('cy'), at('r') * 2, opts); break;
          case 'ellipse': n = g.ellipse(at('cx'), at('cy'), at('rx') * 2, at('ry') * 2, opts); break;
          case 'line': n = g.line(at('x1'), at('y1'), at('x2'), at('y2'), opts); break;
          case 'rect': n = g.rectangle(at('x'), at('y'), at('width'), at('height'), opts); break;
          case 'path': n = g.path(s.getAttribute('d'), opts); break;
          case 'polygon': n = g.polygon(pts(), opts); break;
          case 'polyline': n = g.linearPath(pts(), opts); break;
        }
        if (!n) return;
        const arrowSpec = s.dataset.arrow;
        if (arrowSpec && s.getTotalLength) {
          const L = s.getTotalLength(), size = +(s.dataset.head || 10);
          const head = (tip, from) => {
            const a = Math.atan2(tip.y - from.y, tip.x - from.x), sp = 0.46;
            n.appendChild(g.linearPath([[tip.x - size * Math.cos(a - sp), tip.y - size * Math.sin(a - sp)], [tip.x, tip.y], [tip.x - size * Math.cos(a + sp), tip.y - size * Math.sin(a + sp)]],
              pen(opts.stroke, { strokeWidth: opts.strokeWidth, roughness: 0.5 })));
          };
          if (arrowSpec !== 'start') head(s.getPointAtLength(L), s.getPointAtLength(Math.max(0, L - 6)));
          if (arrowSpec === 'start' || arrowSpec === 'both') head(s.getPointAtLength(0), s.getPointAtLength(Math.min(L, 6)));
        }
        if (s.getAttribute('transform')) n.setAttribute('transform', s.getAttribute('transform'));
        if (s.getAttribute('opacity')) n.setAttribute('opacity', s.getAttribute('opacity'));
        s.replaceWith(n);
      });
    });
  }

  /* ---------- hr: неровная линия ---------- */
  function drawRules(sheet) {
    sheet.querySelectorAll('hr').forEach((hr) => {
      const w = hr.offsetWidth; if (!w) return;
      const svg = svgEl(w, 16, 'display:block;overflow:visible');
      const pts = []; for (let x = 0; x <= w; x += Math.max(40, w / 12)) pts.push([x, 8 + (rnd() - 0.5) * 3]);
      if (pts[pts.length - 1][0] < w) pts.push([w, 8]);
      const col = hr.dataset.color ? ink(hr.dataset.color) : tok('muted');
      const o = pen(col, { strokeWidth: 1.5 });
      if ('dash' in hr.dataset) o.strokeLineDash = [8, 7];
      svg.appendChild(rough.svg(svg).curve(pts, o));
      hr.replaceWith(svg);
    });
  }

  /* ---------- рамки: .frame, .callout, .tag, .pill, [data-box] ---------- */
  function drawBoxes(sheet) {
    sheet.querySelectorAll('[data-box], .frame, .callout, .tag, .pill, .area').forEach((el) => {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.style.isolation = 'isolate';
      const w = el.offsetWidth, h = el.offsetHeight, pad = 8;
      const svg = svgEl(w + pad * 2, h + pad * 2, `position:absolute;left:${-pad}px;top:${-pad}px;overflow:visible;pointer-events:none;z-index:-1`);
      const g = rough.svg(svg), d = el.dataset;
      const isCallout = el.classList.contains('callout');
      const isArea = el.classList.contains('area');
      const stroke = ink(d.box || (isCallout ? 'red' : isArea ? 'muted' : el.classList.contains('tag') || el.classList.contains('pill') ? null : 'ink'), accentOf(el));
      const o = { stroke, strokeWidth: +(d.stroke || (isArea ? 2 : 1.7)), roughness: +(d.roughness || (isArea ? 0.9 : 1.2)), bowing: 1, seed: nextSeed() };
      if (d.fill) Object.assign(o, { fill: hl(d.fill), fillStyle: d.fillStyle || 'hachure', hachureGap: +(d.gap || 6), fillWeight: 1.3, hachureAngle: -41 });
      if ('dash' in d) Object.assign(o, { strokeLineDash: [9, 7], disableMultiStroke: true });
      const ellipse = el.classList.contains('pill') || d.shape === 'ellipse';
      svg.appendChild(ellipse ? g.ellipse(pad + w / 2, pad + h / 2, w + 16, h + 10, o) : g.rectangle(pad, pad, w, h, o));
      el.appendChild(svg);
    });
  }

  /* ---------- rough-notation: [data-rn] + автоподчёркивание h2 ---------- */
  function annotate(sheet) {
    if (!window.RoughNotation) { warn('rough-notation не загрузился'); return; }
    sheet.querySelectorAll('.block > h2:not([data-rn]):not([data-plain])').forEach((h) => { h.dataset.rn = 'underline'; });
    sheet.querySelectorAll('[data-rn]').forEach((el) => {
      const type = el.dataset.rn, d = el.dataset;
      let padding = d.padding ? d.padding.split(',').map(Number) : { circle: 10, box: 6, bracket: 8, highlight: 2 }[type] ?? 3;
      if (Array.isArray(padding) && padding.length === 1) padding = padding[0];
      const color = type === 'highlight' ? hl(d.color) : d.color ? ink(d.color) : type === 'underline' && el.tagName === 'H2' ? getComputedStyle(el).color : tok('red');
      const a = RoughNotation.annotate(el, {
        type, color, padding, animate: false, multiline: true,
        strokeWidth: +(d.stroke || (type === 'highlight' ? 1 : 1.7)),
        iterations: +(d.iter || (type === 'circle' ? 1 : 2)),
        brackets: d.brackets ? d.brackets.split(',') : ['left', 'right'],
      });
      a.show();
      // замораживаем: rough-notation перерисовывает по resize, а на холсте с зумом координаты уже масштабированы
      const svg = type === 'highlight' ? el.previousElementSibling : el.nextElementSibling;
      if (svg && svg.classList.contains('rough-annotation')) {
        const frozen = svg.cloneNode(true);
        a.remove();
        el.insertAdjacentElement(type === 'highlight' ? 'beforebegin' : 'afterend', frozen);
      }
    });
    sheet.querySelectorAll('.rough-annotation').forEach((s) => { s.style.mixBlendMode = 'multiply'; });
  }

  /* ---------- стрелки: <i class="arrow" data-from="#a@right" data-to="#b"> и .flow ---------- */
  function drawArrows(sheet) {
    const layer = svgEl('100%', '100%', 'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:5');
    sheet.appendChild(layer);
    const g = rough.svg(layer);
    const sr = sheet.getBoundingClientRect();
    const box = (el) => { const r = el.getBoundingClientRect(); const x = r.left - sr.left, y = r.top - sr.top; return { x, y, w: r.width, h: r.height, cx: x + r.width / 2, cy: y + r.height / 2 }; };
    const side = (b, s, gap) => ({ top: { x: b.cx, y: b.y - gap }, bottom: { x: b.cx, y: b.y + b.h + gap }, left: { x: b.x - gap, y: b.cy }, right: { x: b.x + b.w + gap, y: b.cy } }[s]);
    const edge = (b, t, gap) => {
      const dx = t.x - b.cx, dy = t.y - b.cy, hw = b.w / 2 + gap, hh = b.h / 2 + gap;
      const k = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
      return { x: b.cx + dx * k, y: b.cy + dy * k };
    };
    const resolve = (spec) => {
      const [sel, s] = spec.split('@');
      const el = sheet.querySelector(sel.trim());
      if (!el) warn(`arrow: "${sel.trim()}" не найден`);
      return el && { b: box(el), s: s && s.trim() };
    };

    function draw(p1, p2, o) {
      const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.hypot(dx, dy) || 1;
      // bend > 0: дуга выгибается влево по ходу стрелки (слева направо - вверх), bend < 0 - вправо
      const c = { x: (p1.x + p2.x) / 2 + dy * o.bend, y: (p1.y + p2.y) / 2 - dx * o.bend };
      const po = pen(o.color, { strokeWidth: o.width, roughness: 0.8 });
      if (o.dash) po.strokeLineDash = [8, 6];
      layer.appendChild(g.path(`M ${p1.x} ${p1.y} Q ${c.x} ${c.y} ${p2.x} ${p2.y}`, po));
      const head = (tip, from) => {
        const a = Math.atan2(tip.y - from.y, tip.x - from.x), L = 13, sp = 0.46;
        layer.appendChild(g.linearPath([[tip.x - L * Math.cos(a - sp), tip.y - L * Math.sin(a - sp)], [tip.x, tip.y], [tip.x - L * Math.cos(a + sp), tip.y - L * Math.sin(a + sp)]],
          pen(o.color, { strokeWidth: o.width, roughness: 0.6 })));
      };
      if (o.heads !== 'none') head(p2, c);
      if (o.heads === 'both') head(p1, c);
      if (o.label) {
        let nx = dy / len, ny = -dx / len; // сторона выгиба
        if (o.bend < 0 || (o.bend === 0 && ny > 0)) { nx = -nx; ny = -ny; }
        const mid = { x: 0.25 * p1.x + 0.5 * c.x + 0.25 * p2.x, y: 0.25 * p1.y + 0.5 * c.y + 0.25 * p2.y };
        const lb = document.createElement('div');
        lb.className = 'arrow-label';
        lb.innerHTML = o.label;
        lb.style.color = o.color;
        sheet.appendChild(lb);
        const off = 8 + Math.max(lb.offsetWidth * Math.abs(nx), lb.offsetHeight * Math.abs(ny)) / 2;
        lb.style.left = mid.x + nx * off + 'px';
        lb.style.top = mid.y + ny * off + 'px';
      }
    }

    sheet.querySelectorAll('.arrow[data-from][data-to]').forEach((a) => {
      const A = resolve(a.dataset.from), B = resolve(a.dataset.to);
      if (!A || !B) return;
      const gap = +(a.dataset.gap || 8), bend = +(a.dataset.bend ?? 0.18);
      const mid = { x: (A.b.cx + B.b.cx) / 2 + (B.b.cy - A.b.cy) * bend, y: (A.b.cy + B.b.cy) / 2 - (B.b.cx - A.b.cx) * bend };
      const p1 = A.s ? side(A.b, A.s, gap) : edge(A.b, mid, gap);
      const p2 = B.s ? side(B.b, B.s, gap) : edge(B.b, mid, gap);
      draw(p1, p2, { bend, color: ink(a.dataset.color, 'ink'), width: +(a.dataset.stroke || 1.8), dash: 'dash' in a.dataset, heads: a.dataset.heads, label: a.dataset.label });
    });

    sheet.querySelectorAll('.flow').forEach((fl) => {
      const items = [...fl.children].filter((c) => !c.classList.contains('arrow') && c.offsetParent !== null);
      const color = ink(fl.dataset.color, 'ink');
      for (let i = 0; i < items.length - 1; i++) {
        const a = box(items[i]), b = box(items[i + 1]);
        if (Math.abs(a.cy - b.cy) > Math.max(a.h, b.h) / 2 || b.x <= a.x + a.w) continue;
        draw({ x: a.x + a.w + 10, y: a.cy }, { x: b.x - 10, y: b.cy }, { bend: 0, color, width: 1.8, dash: 'dash' in fl.dataset });
      }
    });
  }

  /* ---------- тихие наложения: подпись стрелки на тексте ---------- */
  function checkOverlaps(sheet) {
    const labels = [...sheet.querySelectorAll('.arrow-label')];
    if (!labels.length) return;
    // точные прямоугольники строк текста, а не блоков: у <p> на всю ширину пустое место не считается
    const lines = [];
    const tw = document.createTreeWalker(sheet, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) {
      if (!t.textContent.trim() || t.parentElement.closest('.arrow-label, style, script, defs')) continue;
      const r = document.createRange();
      r.selectNodeContents(t);
      for (const b of r.getClientRects()) lines.push({ b, text: t.textContent.trim().slice(0, 40) });
    }
    labels.forEach((lb) => {
      const a = lb.getBoundingClientRect(), area = a.width * a.height;
      const hit = lines.find(({ b }) => {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 0 && h > 0 && w * h > area * 0.12;
      });
      if (hit) warn(`подпись стрелки "${lb.textContent.trim()}" лежит на тексте "${hit.text}"`);
    });
  }

  /* ---------- словарь и пояснения: <dl class="glossary">, [data-term], [data-tip] ---------- */
  const GLOSS = { byKey: new Map(), lower: new Map(), list: [], ignore: new Set() };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // химические формулы в .formula (NaOH, HCl, CO) аббревиатурами не считаем
  const CHEM = /^(?:(?:He|Li|Be|Ne|Na|Mg|Al|Si|Cl|Ar|Ca|Sc|Ti|Cr|Mn|Fe|Co|Ni|Cu|Zn|Ga|Ge|As|Se|Br|Kr|Rb|Sr|Zr|Nb|Mo|Tc|Ru|Rh|Pd|Ag|Cd|In|Sn|Sb|Te|Xe|Cs|Ba|La|Ce|Pr|Nd|Pm|Sm|Eu|Gd|Tb|Dy|Ho|Er|Tm|Yb|Lu|Hf|Ta|Re|Os|Ir|Pt|Au|Hg|Tl|Pb|Bi|Po|At|Rn|Fr|Ra|Ac|Th|Pa|Np|Pu|H|B|C|N|O|F|P|S|K|V|Y|I|W|U)\d*)+$/;
  const textNodes = (rootEl, skip) => {
    const out = [], tw = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let t = tw.nextNode(); t; t = tw.nextNode()) if (t.textContent.trim() && !t.parentElement.closest(skip)) out.push(t);
    return out;
  };

  // data-src="метка = url ; url2": hw.py уже превратил пути и ключи Jira в ссылки
  const parseSrc = (v) => (v || '').split(/\s;\s|\s*;\s*(?=https?:|[A-Z][A-Z0-9]+-\d)/).map((t) => t.trim()).filter(Boolean).map((t) => {
    const m = t.match(/^(.*?)\s=\s(.+)$/);
    const url = (m ? m[2] : t).trim(), label = (m ? m[1] : '').trim();
    const isUrl = /^(https?|file|vscode):/.test(url);
    let auto = url;
    if (isUrl) { try { const u = new URL(url); auto = u.hostname + u.pathname.replace(/\/$/, '').split('/').slice(-2).join('/').replace(/^/, '/'); } catch (e) { /* как есть */ } }
    return { label: label || auto, url: isUrl ? url : '' };
  });

  // аббревиатура: 2+ заглавных и либо слово короткое, либо заглавных не меньше 40% (DoH, gRPC, SHA-1),
  // а длинные CamelCase-имена классов (FilterAsyncRefresher) - нет
  const isAbbr = (w) => {
    const up = (w.match(/\p{Lu}/gu) || []).length, letters = (w.match(/\p{L}/gu) || []).length;
    return up >= 2 && (letters <= 6 || up / letters >= 0.4);
  };

  /* ---------- Jira: каждый ключ задачи (PROJ-123) на доске и в карточках - ссылка ---------- */
  // базу и списки проектов кладёт hw.py в <main class="sheet" data-jira data-jira-projects data-jira-skip>
  const JIRA = (() => {
    const d = document.querySelector('.sheet')?.dataset || {};
    const list = (v) => (v || '').split(',').map((t) => t.trim()).filter(Boolean);
    const only = list(d.jiraProjects);
    return {
      base: d.jira || '', only: only.length ? new Set(only) : null, skip: new Set(list(d.jiraSkip)),
      re: /(?<![\p{L}\p{N}_\-\/.#])([A-Z][A-Z0-9_]{1,9})-([1-9]\d{0,6})(?![\p{L}\p{N}_]|[-.]\d)/gu,
    };
  })();
  const isJira = (project) => !!JIRA.base && (JIRA.only ? JIRA.only.has(project) : !JIRA.skip.has(project));
  const hasJira = (text) => [...String(text || '').matchAll(JIRA.re)].some((m) => isJira(m[1]));
  function linkJira(rootEl) {
    if (!JIRA.base) return;
    textNodes(rootEl, 'a, script, style, defs, dl.glossary, [data-nojira]').forEach((t) => {
      const text = t.textContent, svgText = t.parentElement.namespaceURI === NS;
      let last = 0, frag = null;
      for (const m of text.matchAll(JIRA.re)) {
        if (!isJira(m[1])) continue;
        frag = frag || document.createDocumentFragment();
        frag.append(text.slice(last, m.index));
        const a = svgText ? document.createElementNS(NS, 'a') : document.createElement('a');
        a.setAttribute('class', 'jira');
        a.setAttribute('href', JIRA.base + m[0]);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
        a.textContent = m[0];
        frag.append(a);
        last = m.index + m[0].length;
      }
      if (frag) { frag.append(text.slice(last)); t.replaceWith(frag); }
    });
  }
  function jira(sheet) {
    if (!JIRA.base) return;
    // подписи областей и коротких стрелок рисует псевдоэлемент, его текст не кликается: ставим настоящий элемент
    sheet.querySelectorAll('.area[data-label], i.to[data-label]').forEach((el) => {
      if (!hasJira(el.dataset.label)) return;
      const s = document.createElement('span');
      s.className = 'hw-plabel';
      s.textContent = el.dataset.label;
      el.classList.add('has-plabel');
      el.prepend(s);
    });
    linkJira(sheet);
  }

  function glossary(sheet) {
    // 1. собрать словарь: несколько <dt> подряд - синонимы одного <dd>
    sheet.querySelectorAll('dl.glossary').forEach((dl) => {
      let names = [];
      [...dl.children].forEach((ch) => {
        if (ch.tagName === 'DT') { names.push(ch.textContent.trim()); return; }
        if (ch.tagName !== 'DD' || !names.length) return;
        const c = ch.cloneNode(true);
        const first = c.firstElementChild;
        const simpleEl = c.querySelector('.simple') || (first && first.tagName === 'P' ? first : null);
        let simple = c.innerHTML.trim(), more = '';
        if (simpleEl) { simple = simpleEl.innerHTML; simpleEl.remove(); more = c.innerHTML.trim(); }
        const fresh = names.filter((n) => !GLOSS.lower.has(n.toLowerCase())); // первое определение побеждает
        if (!fresh.length) { names = []; return; }
        names = fresh;
        const e = { key: names[0], names, full: ch.dataset.full || '', simple, more, src: parseSrc(ch.dataset.src), used: false };
        GLOSS.list.push(e);
        GLOSS.byKey.set(e.key, e);
        names.forEach((n) => {
          // варианты одной статьи, отличающиеся только регистром (CallCenter/callcenter), ищем без учёта регистра
          const k = n.toLowerCase(), prev = GLOSS.lower.get(k);
          GLOSS.lower.set(k, { name: prev && prev.e === e && prev.name !== n ? k : n, e });
        });
        names = [];
      });
      (dl.dataset.ignore || '').split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => GLOSS.ignore.add(t));
    });

    // 2. явные ссылки и пояснения к сложным местам
    sheet.querySelectorAll('[data-term]').forEach((el) => {
      const hit = GLOSS.byKey.get(el.dataset.term) || GLOSS.lower.get(el.dataset.term.toLowerCase())?.e;
      if (!hit) { warn(`data-term "${el.dataset.term}" нет в словаре`); return; }
      el.classList.add('term'); el.dataset.key = hit.key; hit.used = true;
    });
    sheet.querySelectorAll('[data-tip]').forEach((el) => el.classList.add('term'));

    // 3. каждое вхождение термина в тексте - кликабельное (аббревиатуры с учётом регистра)
    const names = [...GLOSS.lower.values()].map((v) => v.name).sort((a, b) => b.length - a.length);
    if (names.length) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${names.map(escRe).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
      textNodes(sheet, '.glossary, script, style, defs, .term, a.jira, [data-noterm], .title').forEach((t) => {
        const text = t.textContent, svgText = t.parentElement.namespaceURI === NS;
        let m, last = 0, frag = null;
        re.lastIndex = 0;
        while ((m = re.exec(text))) {
          const c = GLOSS.lower.get(m[0].toLowerCase());
          if (!c || (/\p{Lu}/u.test(c.name) && m[0] !== c.name)) continue;
          frag = frag || document.createDocumentFragment();
          frag.append(text.slice(last, m.index));
          const w = svgText ? document.createElementNS(NS, 'tspan') : document.createElement('span');
          w.setAttribute('class', 'term');
          w.setAttribute('data-key', c.e.key);
          w.textContent = m[0];
          frag.append(w);
          c.e.used = true;
          last = m.index + m[0].length;
        }
        if (frag) { frag.append(text.slice(last)); t.replaceWith(frag); }
      });
    }

    // 4. контроль: аббревиатуры без пояснения и неиспользованные статьи
    const missing = new Set();
    const tok = /(?<![\p{L}\p{N}])\p{L}[\p{L}\p{N}]*(?:-[\p{L}\p{N}]+)*(?![\p{L}\p{N}])/gu;
    textNodes(sheet, '.glossary, script, style, defs, .term, a.jira, [data-noterm], code, .title').forEach((t) => {
      const inFormula = !!t.parentElement.closest('.formula');
      for (const [w] of t.textContent.matchAll(tok)) {
        if (GLOSS.ignore.has(w) || GLOSS.lower.has(w.toLowerCase())) continue;
        // целиком не в словаре - проверяем и части через дефис: "RSA-обмен" -> RSA
        for (const part of w.includes('-') ? [w, ...w.split('-')] : [w]) {
          if (!isAbbr(part) || GLOSS.ignore.has(part) || GLOSS.lower.has(part.toLowerCase())) continue;
          if (inFormula && CHEM.test(part)) continue;
          missing.add(part);
          break;
        }
      }
    });
    if (missing.size) warn(`аббревиатуры без пояснения (добавь в словарь или в data-ignore): ${[...missing].join(', ')}`);
    const unused = GLOSS.list.filter((e) => !e.used).map((e) => e.key);
    if (unused.length) warn(`в словаре, но в тексте не найдено (проверь написание): ${unused.join(', ')}`);
  }

  /* ---------- компонент или схема шире своего блока ---------- */
  function checkWidths(sheet) {
    sheet.querySelectorAll('.tree, .seq, .timeline, .vs, .cycle, svg.sketch, table, .flow, .row').forEach((el) => {
      const host = el.parentElement.closest('.block, .area, .sticky') || sheet;
      const avail = host.clientWidth - (parseFloat(getComputedStyle(host).paddingLeft) || 0) - (parseFloat(getComputedStyle(host).paddingRight) || 0);
      const w = Math.max(el.scrollWidth, el.getBoundingClientRect().width);
      if (w > avail + 6) {
        const title = (host.querySelector(':scope > h2') || {}).textContent || host.dataset.label || 'лист';
        const kind = el.tagName.toLowerCase() === 'svg' ? 'svg.sketch' : '.' + [...el.classList][0];
        warn(`"${title.trim()}": ${kind} шире блока (${Math.round(w)} > ${Math.round(avail)}px) - сократи подписи, дай блоку span-2 или уменьши --cols`);
      }
    });
  }

  /* ---------- холст как в Miro: пан, зум, мини-карта (кроме режима рендера в PNG) ---------- */
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const ICON = {
    minus: '<path d="M5 12h14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    map: '<path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    play: '<path d="M7 5l12 7-12 7z"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    prev: '<path d="M15 5l-7 7 7 7"/>',
    next: '<path d="M9 5l7 7-7 7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.5v.4"/><circle cx="12" cy="17" r=".6"/>',
  };
  const btn = (name, title) => `<button type="button" data-act="${name}" title="${title}"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg></button>`;

  function mountCanvas(sheet) {
    const vp = document.createElement('div');
    vp.className = 'hw-viewport';
    const world = document.createElement('div');
    world.className = 'hw-world';
    sheet.before(vp);
    vp.appendChild(world);
    world.appendChild(sheet);
    root.classList.add('hw-canvas');
    return { vp, world };
  }

  function canvas(sheet, vp, world) {
    let x = 0, y = 0, z = 1, focus = null, touched = false;
    const W = sheet.offsetWidth, H = sheet.offsetHeight;

    const ui = document.createElement('div');
    ui.className = 'hw-ui';
    ui.innerHTML = `
      <div class="hw-help" hidden>
        <b>Навигация</b>
        <div><kbd>тянуть</kbd> двигать холст</div>
        <div><kbd>колесо</kbd> <kbd>щипок</kbd> <kbd>Ctrl+скролл</kbd> зум к курсору</div>
        <div><kbd>скролл тачпадом</kbd> двигать</div>
        <div><kbd>двойной клик</kbd> приблизить блок, ещё раз - всё</div>
        <div><kbd>+</kbd> <kbd>-</kbd> зум, <kbd>1</kbd> 100%, <kbd>0</kbd> показать всё</div>
        <div><kbd>стрелки</kbd> двигать, <kbd>M</kbd> мини-карта</div>
        <div><kbd>клик</kbd> по подчёркнутому - пояснение, <kbd>G</kbd> словарь</div>
        <div><kbd>/</kbd> или <kbd>Ctrl+F</kbd> поиск, <kbd>P</kbd> презентация (<kbd>пробел</kbd>, стрелки влево и вправо)</div>
        <div>ссылка на блок, термин или шаг - в адресной строке, <kbd>L</kbd> скопировать</div>
      </div>
      <div class="hw-gloss" hidden></div>
      <div class="hw-mini" hidden><div class="hw-mini-sheet"></div><div class="hw-mini-view"></div></div>
      <div class="hw-bar">${btn('map', 'Мини-карта (M)')}<span class="hw-sep"></span>${btn('minus', 'Отдалить (-)')}<button type="button" data-act="100" class="hw-zoom" title="100% (1)">100%</button>${btn('plus', 'Приблизить (+)')}${btn('fit', 'Показать всё (0)')}<span class="hw-sep"></span>${btn('search', 'Поиск (/)')}${btn('play', 'Презентация (P)')}${GLOSS.list.length ? btn('book', 'Словарь (G)') : ''}${btn('link', 'Скопировать ссылку (L)')}${btn('help', 'Управление')}</div>`;
    const top = document.createElement('div');
    top.className = 'hw-top';
    top.innerHTML = `
      <div class="hw-search" hidden>
        <div class="hw-search-row">${ICON.search ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">' + ICON.search + '</svg>' : ''}
          <input type="search" placeholder="Поиск по доске" autocomplete="off" spellcheck="false">
          <span class="hw-count"></span>${btn('prev', 'Предыдущее (Shift+Enter)')}${btn('next', 'Следующее (Enter)')}${btn('close', 'Закрыть (Esc)')}</div>
        <div class="hw-sres"></div>
      </div>
      <div class="hw-toast" hidden></div>`;
    document.body.appendChild(top);
    const present = document.createElement('div');
    present.className = 'hw-present';
    present.hidden = true;
    present.innerHTML = `<div class="hw-say" hidden></div><div class="hw-pbar">${btn('prev', 'Назад (стрелка влево)')}<span class="hw-pcount"></span>${btn('next', 'Дальше (пробел)')}<span class="hw-sep"></span>${btn('close', 'Выйти (Esc)')}</div>`;
    document.body.appendChild(present);
    const spot = document.createElement('div');
    spot.className = 'hw-spot';
    spot.hidden = true;
    document.body.appendChild(spot);
    document.body.appendChild(ui);
    const zoomLabel = ui.querySelector('.hw-zoom');
    const help = ui.querySelector('.hw-help');
    const gloss = ui.querySelector('.hw-gloss');

    // мини-карта: контур листа, блоки цветом акцента, рамка видимой области
    const mini = ui.querySelector('.hw-mini'), miniView = ui.querySelector('.hw-mini-view'), miniSheet = ui.querySelector('.hw-mini-sheet');
    const mw = 220, ms = Math.min(mw / W, 170 / H);
    mini.style.width = W * ms + 'px';
    mini.style.height = H * ms + 'px';
    const wr0 = sheet.getBoundingClientRect();
    sheet.querySelectorAll('.area, .block, .sticky, .callout, .header, svg.sketch').forEach((el) => {
      if (el.closest('.sticky') && !el.classList.contains('sticky')) return;
      const r = el.getBoundingClientRect(), d = document.createElement('i');
      const c = el.classList.contains('sticky') ? getComputedStyle(el).backgroundColor : accentOf(el);
      d.style.cssText = `left:${(r.left - wr0.left) * ms}px;top:${(r.top - wr0.top) * ms}px;width:${Math.max(2, r.width * ms)}px;height:${Math.max(2, r.height * ms)}px;--c:${c}`;
      if (el.classList.contains('area')) d.className = 'area';
      miniSheet.appendChild(d);
    });
    const updateMini = () => {
      if (mini.hidden) return;
      miniView.style.cssText = `left:${(-x / z) * ms}px;top:${(-y / z) * ms}px;width:${(vp.clientWidth / z) * ms}px;height:${(vp.clientHeight / z) * ms}px`;
    };

    // пояснения: наведение - короткая подсказка, клик - карточка с подробностями
    const tip = document.createElement('div');
    tip.className = 'hw-tip';
    tip.hidden = true;
    document.body.appendChild(tip);
    let tipAnchor = null, tipPinned = false, hoverEl = null, hoverTimer;
    const entryFor = (el) => {
      if (el.classList.contains('hw-info')) {
        const b = el.parentElement;
        const title = ((b.querySelector(':scope > h2') || {}).textContent || b.dataset.label || '').trim();
        return { key: title || 'Подробнее', full: '', simple: '', more: b.dataset.more ? esc(b.dataset.more) : '', src: parseSrc(b.dataset.src) };
      }
      if (el.dataset.tip) return { key: el.textContent.trim().slice(0, 60), full: '', simple: esc(el.dataset.tip), more: el.dataset.more ? esc(el.dataset.more) : '', src: parseSrc(el.dataset.src) };
      return GLOSS.byKey.get(el.dataset.key);
    };
    const srcHtml = (src) => src && src.length ? `<div class="hw-tip-src"><span class="hw-tip-lbl">источник</span>${src.map((x) => x.url
      ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`).join('')}</div>` : '';
    // блок с data-more или data-src получает кнопку "i" в углу
    sheet.querySelectorAll('.block[data-more], .block[data-src], .area[data-more], .area[data-src]').forEach((b) => {
      const i = document.createElement('button');
      i.type = 'button';
      i.className = 'term hw-info';
      i.title = 'Подробнее и источники';
      i.textContent = 'i';
      b.appendChild(i);
    });
    const placeTip = () => {
      if (!tipAnchor || tip.hidden) return;
      const r = tipAnchor.getBoundingClientRect();
      const off = r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth;
      tip.style.visibility = off ? 'hidden' : '';
      if (off) return;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let top = r.bottom + 10;
      if (top + h > innerHeight - 64 && r.top - h - 10 > 8) top = r.top - h - 10;
      tip.style.left = clamp(r.left + r.width / 2 - w / 2, 10, innerWidth - w - 10) + 'px';
      tip.style.top = clamp(top, 8, Math.max(8, innerHeight - h - 8)) + 'px';
    };
    const setHash = (v) => { try { history.replaceState(null, '', v ? '#' + v : location.pathname + location.search); } catch (e) { /* file:// в некоторых браузерах */ } };
    const hideTip = () => {
      tip.hidden = true; tipAnchor?.classList.remove('active'); tipAnchor = null; tipPinned = false;
      if (location.hash.startsWith('#term=')) setHash('');
    };
    const showTip = (el, pinned) => {
      const e = entryFor(el);
      if (!e) return;
      tipAnchor?.classList.remove('active');
      tipAnchor = el; tipPinned = pinned;
      el.classList.add('active');
      tip.dataset.mode = pinned ? 'pinned' : 'hover';
      const extra = !!(e.more || (e.src && e.src.length));
      tip.innerHTML = (pinned ? '<button type="button" class="hw-tip-x" aria-label="Закрыть">&times;</button>' : '')
        + `<div class="hw-tip-term">${esc(e.key)}</div>`
        + (e.full ? `<div class="hw-tip-full">${esc(e.full)}</div>` : '')
        + (e.simple ? `<div class="hw-tip-simple"><span class="hw-tip-lbl">на пальцах</span>${e.simple}</div>` : '')
        + (pinned
          ? (e.more ? `<div class="hw-tip-more"><span class="hw-tip-lbl">подробнее</span>${e.more}</div>` : '') + srcHtml(e.src)
          : (extra ? `<div class="hw-tip-hint">клик - ${e.more ? 'подробнее' : 'источник'}</div>` : ''));
      linkJira(tip);
      if (pinned && el.dataset.key && GLOSS.byKey.has(el.dataset.key)) setHash('term=' + encodeURIComponent(el.dataset.key));
      tip.hidden = false;
      tip.scrollTop = 0;
      placeTip();
    };
    tip.addEventListener('click', (e) => { if (e.target.closest('.hw-tip-x')) hideTip(); });
    vp.addEventListener('pointermove', (e) => {
      if (pts.size || e.pointerType === 'touch') return;
      const t = e.target.closest ? e.target.closest('.term') : null;
      if (t === hoverEl) return;
      hoverEl = t;
      clearTimeout(hoverTimer);
      if (tipPinned) return;
      hoverTimer = setTimeout(() => (t ? showTip(t, false) : hideTip()), t ? 160 : 100);
    });

    // словарь: все термины списком, клик - перейти к первому вхождению и открыть карточку
    if (GLOSS.list.length) {
      const items = [...GLOSS.list].sort((a, b) => a.key.localeCompare(b.key, 'en', { sensitivity: 'base' }));
      gloss.innerHTML = '<div class="hw-gloss-title">Словарь</div>' + items.map((e, i) =>
        `<button type="button" data-i="${i}"><b>${esc(e.key)}</b>${e.full ? `<small>${esc(e.full)}</small>` : ''}</button>`).join('');
      gloss.addEventListener('click', (ev) => {
        const b = ev.target.closest('button[data-i]');
        if (!b) return;
        const e = items[+b.dataset.i];
        if (!goTerm(e.key)) { b.dataset.key = e.key; showTip(b, true); }
      });
    }

    // перелёт к первому вхождению термина и открытая карточка
    function goTerm(key) {
      const el = [...sheet.querySelectorAll('.term[data-key]')].find((t) => t.dataset.key === key);
      if (!el) return false;
      const r = rectOf(el), nz = Math.max(z, 1);
      x = vp.clientWidth / 2 - (r.x + r.w / 2) * nz; y = vp.clientHeight * 0.38 - (r.y + r.h / 2) * nz; z = nz;
      apply(true);
      setTimeout(() => showTip(el, true), 330);
      return true;
    }
    const centerOn = (r, minZ, anim = true) => {
      const nz = Math.max(z, minZ);
      x = vp.clientWidth / 2 - (r.x + r.w / 2) * nz; y = vp.clientHeight * 0.42 - (r.y + r.h / 2) * nz; z = nz;
      apply(anim);
    };

    let animTimer;
    const apply = (anim) => {
      clearTimeout(animTimer);
      world.classList.toggle('anim', !!anim);
      if (anim) animTimer = setTimeout(() => world.classList.remove('anim'), 320);
      world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
      let g = 24 * z; while (g < 12) g *= 2; while (g > 48) g /= 2;
      vp.style.backgroundSize = `${g}px ${g}px`;
      vp.style.backgroundPosition = `${x}px ${y}px`;
      zoomLabel.textContent = Math.round(z * 100) + '%';
      updateMini();
      placeSpot(anim);
      if (anim) setTimeout(placeTip, 320); else placeTip();
    };
    const zoomAt = (nz, cx, cy, anim) => {
      nz = clamp(nz, 0.05, 8);
      x = cx - (cx - x) * nz / z; y = cy - (cy - y) * nz / z; z = nz;
      apply(anim);
    };
    const center = () => [vp.clientWidth / 2, vp.clientHeight / 2];
    const fitRect = (r, anim, pad = 56, maxZ = 4) => {
      const vw = vp.clientWidth, vh = vp.clientHeight;
      z = clamp(Math.min((vw - pad * 2) / r.w, (vh - pad * 2 - 56) / r.h, maxZ), 0.05, 8);
      x = (vw - r.w * z) / 2 - r.x * z; y = (vh - 56 - r.h * z) / 2 - r.y * z;
      apply(anim);
    };
    const fitAll = (anim) => { focus = null; fitRect({ x: 0, y: 0, w: W, h: H }, anim, 48, 1); if (location.hash && !presenting && !/^#(q|term)=/.test(location.hash)) setHash(''); };
    // экранный прямоугольник -> координаты листа; масштаб берём фактический, поэтому верно и посреди анимации
    const toWorld = (r) => {
      const sr = sheet.getBoundingClientRect(), k = sr.width / W || 1;
      return { x: (r.left - sr.left) / k, y: (r.top - sr.top) / k, w: r.width / k, h: r.height / k };
    };
    const rectOf = (el) => toWorld(el.getBoundingClientRect());
    // кнопки не держат фокус: иначе пробел в презентации "нажимает" последнюю кликнутую
    document.addEventListener('click', (e) => {
      const b = e.target.closest && e.target.closest('button');
      if (!b) return;
      setTimeout(() => (b.closest('.hw-search') ? sInput.focus() : b.blur()), 0);
    }, true);
    let hashDone = false;
    function applyHash(raw) {
      const h = decodeURIComponent((raw || '').replace(/^#/, ''));
      if (!h) return;
      touched = true;
      if (h.startsWith('q=')) openSearch(h.slice(2));
      else if (h.startsWith('term=')) goTerm(h.slice(5));
      else if (h.startsWith('step=')) setPresenting(true, (+h.slice(5) || 0) - 1);
      else {
        const el = document.getElementById(h);
        if (el && sheet.contains(el)) { focus = el; fitRect(rectOf(el), false, 64, 2.5); setHash(h); }
      }
    }
    const initial = () => {
      const vw = vp.clientWidth, vh = vp.clientHeight;
      if (!vw || !vh) return; // фоновая вкладка: подгоним, когда появится размер
      if (!hashDone && location.hash) { hashDone = true; const h = location.hash; fitAll(); applyHash(h); return; }
      hashDone = true;
      const zw = Math.min(1, (vw - 96) / W);
      if (H / W > 1.3 && H * zw > vh) { z = clamp(zw, 0.05, 8); x = (vw - W * z) / 2; y = 32; apply(); }
      else fitAll();
      if (sheet.dataset.format === 'board' || z < 0.4) { mini.hidden = false; updateMini(); }
    };

    // презентация: шаги - [data-step] по номеру, иначе области и блоки по порядку
    const marked = [...sheet.querySelectorAll('[data-step]')];
    const stepEls = marked.length ? marked.sort((a, b) => +a.dataset.step - +b.dataset.step)
      : [...sheet.querySelectorAll('.area, .block, .grid > .sticky, .masonry > .sticky, .board > .sticky, .sheet > .sticky, .sheet > .callout')];
    let presenting = false, stepIdx = -1, spotRect = null;
    const say = present.querySelector('.hw-say'), pcount = present.querySelector('.hw-pcount');
    function placeSpot(anim) {
      spot.classList.toggle('anim', !!anim);
      if (!presenting || !spotRect) { spot.hidden = true; return; }
      const pad = 14;
      spot.hidden = false;
      spot.style.left = spotRect.x * z + x - pad + 'px';
      spot.style.top = spotRect.y * z + y - pad + 'px';
      spot.style.width = spotRect.w * z + pad * 2 + 'px';
      spot.style.height = spotRect.h * z + pad * 2 + 'px';
    }
    function goStep(i) {
      stepIdx = clamp(i, -1, stepEls.length - 1);
      pcount.textContent = stepIdx < 0 ? `обзор / ${stepEls.length}` : `${stepIdx + 1} / ${stepEls.length}`;
      if (stepIdx < 0) {
        spotRect = null; say.hidden = true; fitAll(true); setHash(presenting ? 'step=0' : '');
        return;
      }
      const el = stepEls[stepIdx];
      spotRect = rectOf(el);
      say.hidden = !el.dataset.say;
      say.innerHTML = el.dataset.say ? esc(el.dataset.say) : '';
      linkJira(say);
      hideTip();
      fitRect(spotRect, true, 80, 2.2);
      setHash('step=' + (stepIdx + 1));
    }
    function setPresenting(on, from = -1) {
      presenting = on;
      present.hidden = !on;
      root.classList.toggle('hw-presenting', on);
      if (on) { help.hidden = true; gloss.hidden = true; goStep(from); }
      else { spotRect = null; placeSpot(); say.hidden = true; setHash(''); }
    }
    present.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'next') goStep(stepIdx + 1);
      else if (act === 'prev') goStep(stepIdx - 1);
      else if (act === 'close') setPresenting(false);
    });

    // поиск: подсветка через CSS Highlight API, перелёт к совпадениям, подсказки из словаря
    const search = top.querySelector('.hw-search'), sInput = search.querySelector('input'), sCount = search.querySelector('.hw-count'), sRes = search.querySelector('.hw-sres');
    const toast = top.querySelector('.hw-toast');
    const norm = (t) => t.toLowerCase().replace(/ё/g, 'е');
    let sNodes = null, hits = [], hitIdx = -1, sTimer;
    const canHL = !!(window.Highlight && window.CSS && CSS.highlights);
    function runSearch(q) {
      q = norm(q.trim());
      hits = []; hitIdx = -1;
      if (!sNodes) sNodes = textNodes(sheet, '.glossary, script, style, defs, .hw-info').map((t) => ({ t, s: norm(t.textContent) }));
      if (q.length >= 2) {
        sNodes.forEach(({ t, s }) => {
          for (let i = s.indexOf(q); i >= 0; i = s.indexOf(q, i + q.length)) {
            const r = document.createRange();
            r.setStart(t, i); r.setEnd(t, i + q.length);
            hits.push(r);
          }
        });
      }
      if (canHL) { CSS.highlights.set('hw-hit', new Highlight(...hits)); CSS.highlights.delete('hw-cur'); }
      const terms = q.length >= 2 ? GLOSS.list.filter((e) => e.names.some((n) => norm(n).includes(q)) || norm(e.full).includes(q)).slice(0, 6) : [];
      sRes.innerHTML = terms.map((e) => `<button type="button" data-key="${esc(e.key)}"><b>${esc(e.key)}</b> ${e.full ? `<small>${esc(e.full)}</small>` : ''}</button>`).join('');
      sRes.hidden = !terms.length;
      sCount.textContent = q.length < 2 ? '' : hits.length ? `${hits.length}` : 'нет';
      if (hits.length) goHit(0);
      setHash(q.length >= 2 ? 'q=' + encodeURIComponent(sInput.value.trim()) : '');
    }
    function goHit(i) {
      if (!hits.length) return;
      hitIdx = (i + hits.length) % hits.length;
      centerOn(toWorld(hits[hitIdx].getBoundingClientRect()), 1.1);
      if (canHL) CSS.highlights.set('hw-cur', new Highlight(hits[hitIdx]));
      sCount.textContent = `${hitIdx + 1} / ${hits.length}`;
    }
    function openSearch(q) {
      search.hidden = false; help.hidden = true; gloss.hidden = true;
      if (q !== undefined) { sInput.value = q; runSearch(q); }
      sInput.focus(); sInput.select();
    }
    function closeSearch() {
      search.hidden = true; hits = []; sRes.innerHTML = '';
      if (canHL) { CSS.highlights.delete('hw-hit'); CSS.highlights.delete('hw-cur'); }
      if (location.hash.startsWith('#q=')) setHash('');
      sInput.blur();
    }
    sInput.addEventListener('input', () => { clearTimeout(sTimer); sTimer = setTimeout(() => runSearch(sInput.value), 140); });
    sInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (sTimer) { clearTimeout(sTimer); sTimer = null; } if (!hits.length) runSearch(sInput.value); else goHit(hitIdx + (e.shiftKey ? -1 : 1)); }
      else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
      e.stopPropagation();
    });
    search.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'next') goHit(hitIdx + 1);
      else if (act === 'prev') goHit(hitIdx - 1);
      else if (act === 'close') closeSearch();
      const t = e.target.closest('.hw-sres button');
      if (t) goTerm(t.dataset.key);
    });
    const copyLink = () => {
      const done = (ok) => { toast.textContent = ok ? 'ссылка скопирована' : location.href; toast.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { toast.hidden = true; }, ok ? 1600 : 5000); };
      try { navigator.clipboard.writeText(location.href).then(() => done(true), () => done(false)); } catch (e) { done(false); }
    };

    ui.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const [cx, cy] = center();
      if (act === 'plus') zoomAt(z * 1.25, cx, cy, true);
      else if (act === 'minus') zoomAt(z / 1.25, cx, cy, true);
      else if (act === '100') zoomAt(1, cx, cy, true);
      else if (act === 'fit') fitAll(true);
      else if (act === 'map') { mini.hidden = !mini.hidden; updateMini(); }
      else if (act === 'help') { help.hidden = !help.hidden; gloss.hidden = true; }
      else if (act === 'book') { gloss.hidden = !gloss.hidden; help.hidden = true; }
      else if (act === 'search') (search.hidden ? openSearch() : closeSearch());
      else if (act === 'play') setPresenting(!presenting);
      else if (act === 'link') copyLink();
    });

    // перетаскивание одним пальцем или мышью, щипок двумя пальцами
    const pts = new Map();
    let pinch = null, tap = null;
    const pinchState = () => {
      const [a, b] = [...pts.values()];
      return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
    };
    vp.addEventListener('pointerdown', (e) => {
      if (e.button > 1) return;
      vp.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) tap = { x: e.clientX, y: e.clientY, ok: true };
      else tap = null;
      if (pts.size === 2) pinch = pinchState();
      vp.classList.add('dragging');
      help.hidden = true;
    });
    vp.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 5) tap.ok = false;
      if (pts.size === 1) { x += dx; y += dy; apply(); }
      else if (pts.size === 2 && pinch) {
        const s = pinchState();
        x += s.cx - pinch.cx; y += s.cy - pinch.cy;
        zoomAt(z * s.d / pinch.d, s.cx, s.cy);
        pinch = s;
      }
    });
    const up = (e) => {
      const wasTap = e.type === 'pointerup' && tap && tap.ok && pts.size === 1;
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (!pts.size) vp.classList.remove('dragging');
      if (!wasTap) return;
      tap = null;
      // клик без сдвига: по термину - карточка, мимо - закрыть
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const link = hit && hit.closest('a[href]');
      if (link) { window.open(link.getAttribute('href'), '_blank', 'noopener'); return; }
      const t = hit && hit.closest('.term');
      if (t) showTip(t, true); else hideTip();
      gloss.hidden = true;
      if (!search.hidden && !sInput.value) closeSearch();
    };
    vp.addEventListener('pointerup', up);
    vp.addEventListener('pointercancel', up);

    // колесо мыши и Ctrl/щипок - зум к курсору, скролл тачпадом - пан
    vp.addEventListener('wheel', (e) => {
      e.preventDefault();
      const mouse = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || e.metaKey || mouse) {
        const dy = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
        zoomAt(z * Math.exp(-dy * (mouse ? 0.0015 : 0.01)), e.clientX, e.clientY);
      } else { x -= e.deltaX; y -= e.deltaY; apply(); }
    }, { passive: false });
    // Safari: щипок на тачпаде приходит gesture-событиями
    let g0 = null;
    vp.addEventListener('gesturestart', (e) => { e.preventDefault(); g0 = z; });
    vp.addEventListener('gesturechange', (e) => { e.preventDefault(); if (g0) zoomAt(g0 * e.scale, e.clientX, e.clientY); });
    vp.addEventListener('gestureend', (e) => { e.preventDefault(); g0 = null; });

    vp.addEventListener('dblclick', (e) => {
      // из-за pointer capture target - сам холст, поэтому ищем элемент по координатам
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      const el = hit && hit.closest('.block, .area, .sticky, .callout, .frame, svg.sketch');
      if (el && el !== focus) {
        focus = el;
        fitRect(rectOf(el), true, 64, 2.5);
        const withId = el.id ? el : el.closest('[id]');
        if (withId && sheet.contains(withId)) setHash(withId.id);
      } else fitAll(true);
    });

    // мини-карта: клик и перетаскивание переносят вид
    const miniGo = (e) => {
      const r = mini.getBoundingClientRect();
      const wx = (e.clientX - r.left) / ms, wy = (e.clientY - r.top) / ms;
      x = vp.clientWidth / 2 - wx * z; y = vp.clientHeight / 2 - wy * z;
      apply();
    };
    let miniDrag = false;
    mini.addEventListener('pointerdown', (e) => { miniDrag = true; mini.setPointerCapture(e.pointerId); miniGo(e); });
    mini.addEventListener('pointermove', (e) => { if (miniDrag) miniGo(e); });
    mini.addEventListener('pointerup', () => { miniDrag = false; });

    addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyF') { e.preventDefault(); openSearch(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === '/') { e.preventDefault(); openSearch(); return; } // по символу, а не по клавише: работает в любой раскладке
      if (presenting) {
        const k = e.code;
        if (k === 'Space' || k === 'ArrowRight' || k === 'PageDown' || k === 'Enter') { e.preventDefault(); goStep(stepIdx + (e.shiftKey && k === 'Space' ? -1 : 1)); return; }
        if (k === 'ArrowLeft' || k === 'PageUp' || k === 'Backspace') { e.preventDefault(); goStep(stepIdx - 1); return; }
        if (k === 'Home') { e.preventDefault(); goStep(-1); return; }
        if (k === 'End') { e.preventDefault(); goStep(stepEls.length - 1); return; }
        if (k === 'Escape' || k === 'KeyP') { e.preventDefault(); setPresenting(false); return; }
      }
      const [cx, cy] = center(), step = e.shiftKey ? 480 : 120;
      switch (e.code) {
        case 'Equal': case 'NumpadAdd': zoomAt(z * 1.25, cx, cy, true); break;
        case 'Minus': case 'NumpadSubtract': zoomAt(z / 1.25, cx, cy, true); break;
        case 'Digit0': case 'Numpad0': fitAll(true); break;
        case 'Digit1': case 'Numpad1': e.shiftKey ? fitAll(true) : zoomAt(1, cx, cy, true); break;
        case 'ArrowLeft': x += step; apply(true); break;
        case 'ArrowRight': x -= step; apply(true); break;
        case 'ArrowUp': y += step; apply(true); break;
        case 'ArrowDown': y -= step; apply(true); break;
        case 'KeyM': mini.hidden = !mini.hidden; updateMini(); break;
        case 'KeyG': if (GLOSS.list.length) { gloss.hidden = !gloss.hidden; help.hidden = true; } break;
        case 'Escape': help.hidden = true; gloss.hidden = true; hideTip(); closeSearch(); break;
        case 'KeyP': setPresenting(true); break;
        case 'KeyL': copyLink(); break;
        default: return;
      }
      e.preventDefault();
    });

    // пока пользователь не двигал холст, при смене размера окна вид подгоняется заново
    ['pointerdown', 'wheel', 'keydown', 'gesturestart'].forEach((t) => vp.addEventListener(t, () => { touched = true; }, { passive: true }));
    ui.addEventListener('click', () => { touched = true; });
    addEventListener('keydown', () => { touched = true; });
    // ссылка на место, открытая в уже открытой вкладке, меняет только hash - страница не перезагружается
    addEventListener('hashchange', () => applyHash(location.hash));
    let rt;
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => (touched ? updateMini() : initial()), 50); });
    initial();
  }

  async function main() {
    const sheet = document.querySelector('.sheet');
    if (!sheet) return;
    // холст монтируется до рисования: все замеры идут в финальном DOM при масштабе 1
    const cv = root.classList.contains('render') ? null : mountCanvas(sheet);
    try {
      await Promise.all(['700 38px Caveat', '400 25px Caveat', '400 25px Neucha', '400 20px "Bad Script"'].map((f) => document.fonts.load(f, 'Аа Zz')));
      await document.fonts.ready;
    } catch (e) { warn('шрифты: ' + e.message); }
    // не rAF: в невидимом окне (рендер в PNG) он не срабатывает
    await new Promise((r) => setTimeout(r, 60));
    const steps = [['tilt', tilt]];
    steps.push(['components', components]);
    if (window.rough) steps.push(['doodles', drawDoodles], ['inline-arrows', drawInlineArrows], ['sketch', roughify], ['rules', drawRules], ['boxes', drawBoxes], ['draw-components', drawComponents]);
    else warn('rough.js не загрузился');
    steps.push(['annotate', annotate]);
    if (window.rough) steps.push(['arrows', drawArrows], ['overlaps', checkOverlaps]);
    steps.push(['widths', checkWidths]);
    steps.push(['jira', jira], ['glossary', glossary]);
    for (const [name, fn] of steps) { try { fn(sheet); } catch (e) { warn(`${name}: ${e.message}`); } }
    if (sheet.scrollWidth > sheet.clientWidth + 2) warn(`контент шире листа: ${sheet.scrollWidth}px > ${sheet.clientWidth}px`);
    document.body.dataset.w = Math.ceil(sheet.offsetWidth);
    document.body.dataset.h = Math.ceil(sheet.offsetHeight);
    if (warns.length) document.body.dataset.warn = warns.join(' | ');
    if (cv) { try { canvas(sheet, cv.vp, cv.world); } catch (e) { warn('canvas: ' + e.message); } }
    document.body.dataset.ready = '1';
  }

  if (document.readyState === 'complete') main();
  else addEventListener('load', main);
})();
