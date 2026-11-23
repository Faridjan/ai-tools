// A correct wardrobe 800 x 2000 x 500 (plus doors and an overlay back) for the mock Bazis.
// Everything a review expects is in place: edges, fasteners in every joint, hinges, animation, positions.
// Tests break one thing at a time and expect the matching finding.
'use strict';

const LDSP = 'ЛДСП Белый 2800*2070*16 мм\rW1000';   // LDSP Belyi
const HDF = 'ХДФ Белый 2800*2070*3 мм\rH3';            // HDF Belyi
const N = {
  sideL: 'Боковина левая', sideR: 'Боковина правая',
  bottom: 'Дно', top: 'Крышка', shelf: 'Полка', plinth: 'Цоколь',
  back: 'Задняя стенка', door: 'Дверь',
  doorL: 'Дверь левая', doorR: 'Дверь правая',
  kon: 'Стяжка-евровинт KON 7x50\rKON750',
  holder: 'Полкодержатель 5 мм\r282.24.720',
  hinge: 'Петля Clip top 110\r71B3550', cup: 'Чашка', plate: 'Планка'
};

function buildCabinet(h, o) {
  o = o || {};
  const A = h.AnimationType;
  const P = (name, box, orient, extra) => h.add(h.panel(name, box, orient, Object.assign({ mat: LDSP }, extra || {})));
  const m = {};
  // carcass. Edge index 1 of a side is its front (z max); 2 of a horizontal is its front.
  m.sideL = P(N.sideL, [0, 16, 0, 2000, 0, 500], 'X', { butts: [1], art: '1' });
  m.sideR = P(N.sideR, [784, 800, 0, 2000, 0, 500], 'X', { butts: [1], art: '1' });
  m.bottom = P(N.bottom, [16, 784, 70, 86, 0, 500], 'Y', { butts: [2], art: '2' });
  m.top = P(N.top, [16, 784, 1984, 2000, 0, 500], 'Y', { butts: [2], art: '2' });
  m.shelf = P(N.shelf, [16, 784, 1000, 1016, 0, 480], 'Y', { butts: [2], art: '3' });
  m.plinth = P(N.plinth, [16, 784, 0, 70, 470, 486], 'Z', { butts: [], art: '4' });
  m.back = P(N.back, [2, 798, 2, 1998, -3, 0], 'Z', { mat: HDF, butts: [], art: '5' });

  // one confirmat: through hole in the side from outside, end hole into the horizontal
  const kon = (side, horiz, y, z) => {
    const left = side === m.sideL, x0 = left ? 0 : 800, dir = left ? 1 : -1;
    const body = h.part(N.kon, left ? [0, 50, y - 3.5, y + 3.5, z - 3.5, z + 3.5] : [750, 800, y - 3.5, y + 3.5, z - 3.5, z + 3.5], [
      { d: 8, depth: 16, p: [x0, y, z], dir: [dir, 0, 0] },
      { d: 5, depth: 34, p: [x0 + dir * 16, y, z], dir: [dir, 0, 0] }
    ]);
    h.add(body); h.fasten(body, [side, horiz]); return body;
  };
  m.kons = [];
  for (const side of [m.sideL, m.sideR]) {
    for (const [horiz, y] of [[m.bottom, 78], [m.top, 1992]]) for (const z of [50, 250, 450]) m.kons.push(kon(side, horiz, y, z));
    for (const y of [20, 50]) m.kons.push(kon(side, m.plinth, y, 478));
  }
  // shelf supports: 2 per side, blind d5 x 10 in the side face
  m.holders = [];
  for (const [side, x, dir] of [[m.sideL, 16, -1], [m.sideR, 784, 1]]) for (const z of [60, 420]) {
    const body = h.part(N.holder, dir < 0 ? [10, 26, 992, 1000, z - 4, z + 4] : [774, 790, 992, 1000, z - 4, z + 4],
      [{ d: 5, depth: 10, p: [x, 996, z], dir: [dir, 0, 0] }]);
    h.add(body); h.fasten(body, [side, m.shelf]); m.holders.push(body);
  }
  // plinth to bottom: one more fastener so that joint is not empty
  for (const x of [150, 400, 650]) {
    const body = h.part(N.kon, [x - 3.5, x + 3.5, 36, 86, 474.5, 481.5], [
      { d: 8, depth: 16, p: [x, 86, 478], dir: [0, -1, 0] }, { d: 5, depth: 34, p: [x, 70, 478], dir: [0, -1, 0] }]);
    h.add(body); h.fasten(body, [m.bottom, m.plinth]); m.kons.push(body);
  }

  // doors: two overlay doors, 4 mm apart, each in its own animated block with 4 hinges
  const door = (name, x0, x1, anim, hingeX, sidePanel) => {
    const leaf = h.panel(N.door, [x0, x1, 72, 1998, 502, 518], 'Z', { mat: LDSP, butts: [0, 1, 2, 3], art: '6' });
    const kids = [leaf];
    for (const y of [172, 722, 1272, 1898]) {
      const cx = hingeX < 400 ? x0 + 22 : x1 - 22;
      const cup = h.part(N.cup, [cx - 17.5, cx + 17.5, y - 17.5, y + 17.5, 500, 514], [{ d: 35, depth: 12, p: [cx, y, 502], dir: [0, 0, 1] }]);
      const px = hingeX < 400 ? 16 : 784, dir = hingeX < 400 ? -1 : 1;
      const plate = h.part(N.plate, hingeX < 400 ? [16, 20, y - 20, y + 20, 440, 490] : [780, 784, y - 20, y + 20, 440, 490], [
        { d: 5, depth: 13, p: [px, y - 16, 463], dir: [dir, 0, 0] }, { d: 5, depth: 13, p: [px, y + 16, 463], dir: [dir, 0, 0] }]);
      const hb = h.block(N.hinge, [cup, plate], { fastener: true });
      h.fasten(hb, [leaf, sidePanel]);
      kids.push(hb);
    }
    return { block: h.add(h.block(name, kids, { anim: anim, angle: 110 })), leaf: leaf };
  };
  m.doorL = door(N.doorL, 2, 398, A.DoorLeft, 0, m.sideL);
  m.doorR = door(N.doorR, 402, 798, A.DoorRight, 800, m.sideR);
  return m;
}

module.exports = { buildCabinet, LDSP, HDF, N };
