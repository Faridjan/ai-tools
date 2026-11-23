// Plays the role of Bazis for the end-to-end test: loads the mock API with the reference wardrobe
// and starts the real "Claude Agent.js" from an installed folder.  node mock_agent_host.js <BazisDir>
// The agent polls _claude\cmd.js on a timer exactly as in Bazis; the process ends when the agent stops.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { install } = require('./mock_bazis');
const { buildCabinet } = require('./mock_model');

const bazis = path.resolve(process.argv[2]);
const host = install({ dir: path.join(bazis, '_claude') + path.sep });
buildCabinet(host);
const agent = path.join(bazis, 'Scripts', 'Claude Agent.js');
vm.runInThisContext(fs.readFileSync(agent, 'latin1'), { filename: agent });
setTimeout(() => process.exit(0), 10 * 60 * 1000).unref();   // never outlive a broken test run
