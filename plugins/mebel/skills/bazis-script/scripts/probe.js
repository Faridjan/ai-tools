// probe.js - what JS engine and modules are available inside BAZIS scripts
var info = {};
try { info.node = process.version; info.arch = process.arch; info.pid = process.pid; info.execPath = process.execPath; info.argv = process.argv; info.cwd = process.cwd(); } catch (e) { info.procErr = String(e); }
try { info.requireType = typeof require; } catch (e) { info.reqErr = String(e); }
try { var fs = require('fs'); info.fs = typeof fs.readFileSync; } catch (e) { info.fsErr = String(e); }
try { var vm = require('vm'); info.vm = typeof vm.runInThisContext; } catch (e) { info.vmErr = String(e); }
try { var path = require('path'); info.path = typeof path.join; } catch (e) { info.pathErr = String(e); }
try { var cp = require('child_process'); info.child_process = typeof cp.execSync; } catch (e) { info.cpErr = String(e); }
try { var net = require('net'); info.net = typeof net.createServer; } catch (e) { info.netErr = String(e); }
try { info.es6 = eval('let q = [1,2,3].map(v => v * 2); const t = `tpl${q.length}`; class K { get z() { return 7; } } for (const x of q) {} t + new K().z'); } catch (e) { info.es6Err = String(e); }
try { info.asyncFn = typeof eval('(async function(){ return 1; })'); } catch (e) { info.asyncErr = String(e); }
try { info.mapSet = (new Map([[1,2]])).get(1) + (new Set([1,1,2])).size; } catch (e) { info.mapErr = String(e); }
try { info.includes = [1,2].includes(2); } catch (e) { info.inclErr = String(e); }
try { info.apiVersion = system.apiVersion; } catch (e) {}
try { info.globals = Object.keys(this).sort(); } catch (e) { info.globErr = String(e); }
try { info.hasInspector = typeof NewModelInspector; info.hasLoadModel = typeof LoadModel; info.hasSaveModel = typeof SaveModel; info.hasNewForm = typeof NewForm; info.ModelFilename = typeof ModelFilename !== 'undefined' ? ModelFilename : undefined; info.Article = typeof Article; } catch (e) { info.apiErr = String(e); }
try { info.interactive = Action.Interactive; } catch (e) {}
// encoding check: system.readTextFile of a utf8 file vs fs
try { var f = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\_claude\\probe_utf8.txt'; var fs2 = require('fs'); var a = fs2.readFileSync(f, 'utf8'); info.utf8_len = a.length; info.utf8_ok = (a === '\u041f\u0440\u0438\u0432\u0435\u0442'); var b = system.readTextFile(f); info.sysread_len = b.length; info.sysread_ok = (b === '\u041f\u0440\u0438\u0432\u0435\u0442'); } catch (e) { info.encErr = String(e); }
BZ.writeJson('probe_result.json', info);
log('node=' + info.node + ' fs=' + info.fs + ' vm=' + info.vm + ' es6=' + info.es6 + ' utf8_ok=' + info.utf8_ok + ' sysread_ok=' + info.sysread_ok);
info;
