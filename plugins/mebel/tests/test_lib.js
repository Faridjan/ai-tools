// Tests of lib.js, the review collector and the command samples against the mock Bazis.
// Run: node plugins/mebel/tests/test_lib.js
'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install, SCRIPTS } = require('./mock_bazis');
const { buildCabinet, N } = require('./mock_model');

const COLLECT = path.join(__dirname, '..', 'skills', 'model-review', 'scripts', 'cmd_review_collect.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mebel-lib-'));
let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { failed++; console.log('FAIL ' + name + '\n  ' + (e.stack || e).split('\n').slice(0, 6).join('\n  ')); }
}
function fresh(opts) {
  const host = install(Object.assign({ dir: tmp + path.sep }, opts || {}));
  const model = buildCabinet(host);
  const BZ = host.loadLib();
  return { host, model, BZ };
}

test('lib is version 5', () => { assert.strictEqual(fresh().BZ.VERSION, 5); });

test('json survives cycles, depth, dates and throwing getters', () => {
  const { BZ } = fresh();
  const a = { n: 1 }; a.self = a;
  assert.ok(BZ.json(a).indexOf('[circular]') > 0);
  let deep = {}, cur = deep; for (let i = 0; i < 40; i++) { cur.k = {}; cur = cur.k; }
  assert.ok(BZ.json(deep).indexOf('[depth]') > 0);
  assert.strictEqual(BZ.json(new Date(0)), '"1970-01-01T00:00:00.000Z"');
  const bad = {}; Object.defineProperty(bad, 'x', { enumerable: true, get() { throw new Error('host'); } });
  assert.ok(BZ.json({ a: bad }).indexOf('unserializable') > 0);
  const shared = [1]; assert.strictEqual(BZ.json({ a: shared, b: shared }), '{"a":[1],"b":[1]}');   // not a cycle
  assert.deepStrictEqual(JSON.parse(BZ.json({ s: 'кир', n: 1.23456, z: null, e: [], o: {} }, 1)), { s: 'кир', n: 1.235, z: null, e: [], o: {} });
});

test('csv quotes a material with CR', () => {
  const { BZ } = fresh();
  BZ.writeCsv('t.csv', [['a\rb', 'c;d', 'e']]);
  assert.strictEqual(fs.readFileSync(path.join(tmp, 't.csv'), 'utf8'), '﻿"a\rb";"c;d";e');
});

test('roles, sections and materials of the reference wardrobe', () => {
  const { BZ, model } = fresh();
  const ctx = BZ.roleCtx();
  assert.strictEqual(BZ.role(model.sideL, ctx), 'side_left');
  assert.strictEqual(BZ.role(model.sideR, ctx), 'side_right');
  assert.strictEqual(BZ.role(model.shelf, ctx), 'shelf');
  assert.strictEqual(BZ.role(model.back, ctx), 'back');
  assert.strictEqual(BZ.role(model.doorL.leaf, ctx), 'facade');
  assert.strictEqual(BZ.materials().sheets.length, 2);
  assert.ok(BZ.sections().length >= 1);
});

test('spec keeps the grain direction', () => {
  const { BZ, model } = fresh();
  model.plinth.TextureOrientation = 2;          // grain along ContourHeight (70), across the 768 length
  const row = BZ.spec('spec.csv').filter(r => r.name === N.plinth)[0];
  assert.deepStrictEqual([row.L, row.W, row.gl, row.gw, row.tex], [768, 70, 70, 768, 2]);
  const head = fs.readFileSync(path.join(tmp, 'spec.csv'), 'utf8').split('\r\n')[0];
  assert.ok(/GrainL;GrainW;Tex$/.test(head));
});

test('resize of a square panel changes the right side', () => {
  const { BZ, host } = fresh();
  const sq = host.add(host.panel('sq', [100, 116, 0, 500, 0, 500], 'X'));
  assert.ok(BZ.setDepth(sq, 400));
  assert.deepStrictEqual(BZ.size(sq), [16, 500, 400]);
  assert.ok(BZ.setHeight(sq, 300, true));
  assert.deepStrictEqual([sq.GabMin.y, sq.GabMax.y], [200, 500]);
});

test('check finds overlap and oversize', () => {
  const { BZ, model } = fresh();
  assert.strictEqual(BZ.check().length, 0);
  BZ.move(model.shelf, -8, 0, 0);
  assert.ok(BZ.check().some(e => e.type === 'Overlap'));
  BZ.move(model.shelf, 8, 0, 0);
  model.sideL.ContourHeight = 3000;
  assert.ok(BZ.check().some(e => e.type === 'SheetSize'));
});

test('units move a hinge with its door', () => {
  const { BZ, model } = fresh();
  const cup = BZ.find(o => o.Name === N.cup)[0];
  const units = BZ.units([cup, model.doorL.leaf]);
  assert.strictEqual(units.length, 1);
  assert.strictEqual(units[0], model.doorL.block);
});

test('save refuses to overwrite without a backup', () => {
  const { BZ, host } = fresh({ file: path.join(tmp, 'missing.b3d') });
  assert.throws(() => BZ.save());
  assert.strictEqual(host.state.saved.length, 0);
  const real = path.join(tmp, 'real.b3d'); fs.writeFileSync(real, 'x');
  const h2 = fresh({ file: real });
  const r = h2.BZ.save();
  assert.ok(fs.existsSync(r.backup)); assert.deepStrictEqual(h2.host.state.saved, [real]);
  const h3 = fresh({ file: '' });
  assert.throws(() => h3.BZ.save(), /no file/);
});

test('selftest sample runs on the mock', () => {
  const { host } = fresh();
  const out = host.run(path.join(SCRIPTS, 'examples', 'cmd_selftest.js'));
  assert.strictEqual(out.snapshotSelfDiff, 0);
  assert.ok(out.moveTest.ok);
  assert.strictEqual(out.inspect.count, 0);
});

test('collector output matches the committed fixture', () => {
  const { host } = fresh();
  host.run(COLLECT);
  const got = JSON.parse(fs.readFileSync(path.join(tmp, 'review_data.json'), 'utf8'));
  const want = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'review_data.json'), 'utf8'));
  got.collectedAt = want.collectedAt;
  assert.deepStrictEqual(got, want, 'run: node plugins/mebel/tests/make_fixture.js plugins/mebel/tests/fixtures');
  assert.strictEqual(host.state.commits, 0);
});

test('collector reports a failed step instead of hiding it', () => {
  const host = install({ dir: tmp + path.sep, noFastenerApi: true });
  buildCabinet(host);
  host.add(host.panel('bad', [300, 316, 200, 400, 100, 300], 'X', { visibleThrows: true }));
  host.loadLib();
  const ret = host.run(COLLECT);
  const data = JSON.parse(fs.readFileSync(path.join(tmp, 'review_data.json'), 'utf8'));
  const steps = data.collectErrors.map(e => e.step);
  assert.ok(steps.indexOf('IsButtVisible') >= 0 && steps.indexOf('FindConnectedFasteners') >= 0, steps.join());
  assert.strictEqual(data.fastened, null);
  assert.strictEqual(data.collectErrors.filter(e => e.step === 'IsButtVisible')[0].count, 4);
  assert.ok(ret.failedSteps.length >= 2);
});

test('collector does not change the model', () => {
  const { host, BZ } = fresh();
  const before = BZ.json(BZ.snapshot());
  host.run(COLLECT);
  assert.strictEqual(BZ.json(BZ.snapshot()), before);
});

// The engine inside Bazis 11 is Node 8: newer syntax parses here but fails there.
test('commands and runtime use Node 8 syntax only', () => {
  const lint = require('../hooks/lint_cmd.js');
  const files = [COLLECT].concat(fs.readdirSync(path.join(SCRIPTS, 'examples')).map(f => path.join(SCRIPTS, 'examples', f)));
  for (const f of files) {
    const res = lint.lintCommand(fs.readFileSync(f, 'utf8'), path.basename(f));
    assert.deepStrictEqual(res.errors, [], f);
  }
  for (const f of ['lib.js', 'Claude Agent.js', 'agent-loop-fallback.js']) {
    const res = lint.lintRuntime(fs.readFileSync(path.join(SCRIPTS, f)), f);
    assert.deepStrictEqual(res.errors, [], f);
  }
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
