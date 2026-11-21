// ============================================================
//  Claude Agent for BAZIS-Mebelshik 11   (v2.1, BLOCKING LOOP - fallback only)
//  Use only if "Claude Agent.js" (v3, timer) does not produce a heartbeat.
//  WARNING: this variant blocks the Bazis UI thread. Windows marks Bazis as
//  "not responding"; clicking the window may make Windows close Bazis.
//  Do not touch the Bazis window while this agent runs; stop it with bz.ps1 -Stop.
// ============================================================

system.require('C:\\Users\\Jarvis\\Documents\\Bazis11\\_claude\\lib.js');

try { if (typeof global !== 'undefined') { global.BZ = BZ; global.log = log; global.V = V; } } catch (e) {}

(function () {
    var POLL_MS = 250;
    var HEARTBEAT_MS = 2000;
    var IDLE_MIN = 90;

    try { Action.Interactive = false; } catch (e) {}

    function readCmd() {
        if (!BZ.exists('cmd.js')) return '';
        try { return BZ.read('cmd.js'); } catch (e) { return ''; }
    }
    function readId() {
        try { if (BZ.exists('cmd.id')) return BZ.read('cmd.id').replace(/\s+/g, ''); } catch (e) {}
        return '';
    }
    function stopRequested() {
        if (!BZ.exists('stop.flag')) return false;
        try { return /^\s*1/.test(BZ.read('stop.flag')); } catch (e) { return false; }
    }
    function lineFromStack(st) {
        var m = /cmd\.js:(\d+):(\d+)/.exec(st || '');
        return m ? parseInt(m[1], 10) : null;
    }
    function runCommand(code) {
        var wrapped = '{' + code.replace(/^\uFEFF/, '') + '\n}';
        if (BZ.vm) return BZ.vm.runInThisContext(wrapped, { filename: 'cmd.js', displayErrors: true });
        return (0, eval)(wrapped);
    }

    var caps = BZ.caps();
    caps.mode = BZ.vm ? 'vm' : 'eval';
    caps.utf8 = !!BZ.fs;
    caps.agent = '2.1-loop';
    caps.scheduler = 'loop';

    BZ.write('stop.flag', '0');
    BZ.write('cmd.js', '');
    BZ.writeJson('status.json', { state: 'running', started: new Date().toString(), api: caps.api, model: Action.ModelFilename, caps: caps });

    var started = new Date().getTime();
    var lastCmd = started, lastBeat = 0, seq = 0, done = 0;

    while (true) {
        var now = new Date().getTime();

        if (now - lastBeat >= HEARTBEAT_MS) {
            lastBeat = now;
            BZ.writeJson('heartbeat.json', { ts: now, seq: seq++, done: done, uptimeSec: Math.round((now - started) / 1000), scheduler: 'loop' });
        }

        if (stopRequested()) { BZ.writeJson('status.json', { state: 'stopped', reason: 'stop.flag', done: done }); break; }
        if (now - lastCmd > IDLE_MIN * 60000) { BZ.writeJson('status.json', { state: 'stopped', reason: 'idle timeout', done: done }); break; }

        var src = readCmd();
        if (src && /\S/.test(src)) {
            BZ.write('cmd.js', '');
            var res = { id: readId(), ok: true, startedAt: new Date().toString(), mode: caps.mode };
            BZ._log = [];
            var t0 = new Date().getTime();
            var before = null;
            try { before = BZ.snapshot(); } catch (e0) {}
            try {
                var ret = runCommand(src);
                if (ret !== undefined) res.ret = ret;
            } catch (e) {
                res.ok = false;
                res.error = String(e);
                try { res.stack = e.stack ? String(e.stack) : undefined; } catch (e2) {}
                res.line = lineFromStack(res.stack);
                if (res.line === null) { try { res.line = e.lineNumber || null; } catch (e3) {} }
            }
            try { Action.Commit(); } catch (e4) { res.commitError = String(e4); }
            try {
                if (before) {
                    var diff = BZ.diff(before, BZ.snapshot());
                    res.changedCount = diff.length;
                    if (diff.length) res.changed = diff.slice(0, 60);
                    if (diff.length && BZ.autoInspect) {
                        var ti = new Date().getTime();
                        res.inspect = BZ.inspect();
                        res.inspect.ms = new Date().getTime() - ti;
                    }
                }
            } catch (e5) { res.diffError = String(e5); }
            BZ.autoInspect = true;
            res.log = BZ._log;
            res.ms = new Date().getTime() - t0;
            res.modelSize = BZ.v3(Model.GSize);
            BZ.writeJson('result.json', res);
            done++;
            lastCmd = new Date().getTime();
        }

        system.sleep(POLL_MS);
    }
})();
