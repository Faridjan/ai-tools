// Build the reference wardrobe in the mock Bazis, run the real collector over it and write
// review_data.json into the given folder.  node make_fixture.js <outDir>
'use strict';
const path = require('path');
const fs = require('fs');
const { install } = require('./mock_bazis');
const { buildCabinet } = require('./mock_model');

const out = path.resolve(process.argv[2] || path.join(__dirname, 'fixtures'));
fs.mkdirSync(out, { recursive: true });
const host = install({ dir: out + path.sep });
buildCabinet(host);
host.loadLib();
const ret = host.run(path.join(__dirname, '..', 'skills', 'model-review', 'scripts', 'cmd_review_collect.js'));
// the collector stamps the time: keep the committed fixture stable
const file = path.join(out, 'review_data.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
data.collectedAt = '2026-01-01T00:00:00.000Z';
fs.writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
console.log(JSON.stringify(ret));
