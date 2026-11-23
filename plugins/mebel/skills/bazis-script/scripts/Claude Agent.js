// ============================================================
//  Claude Agent for BAZIS-Mebelshik 11   (v3.2, non-blocking + start trace)
//  Start it once from menu "Scripts -> Claude Agent".
//  Polls  _claude\cmd.js  on a timer and executes it, writing  _claude\result.json.
//  Stops when  _claude\stop.flag  contains "1", on Esc, or after IDLE_MIN minutes idle.
//
//  Why v3: v1/v2 ran "while(true){ ... system.sleep() }" on the Bazis UI thread.
//  Windows marked Bazis.exe as hung (AppHangB1) and closed it. v3 schedules ticks
//  with setInterval (fallback: Action.AsyncExec) and returns control to Bazis via
//  Action.Continue(). The blocking variant is kept outside the menu as
//  _claude\agent-loop-fallback.js.
//  v3.1: every start step is written to _claude\agent_trace.txt, any start error
//  to _claude\agent_error.json, so a silent failure can be diagnosed.
//  v3.2: heartbeat.json gets busy=<command id> before a command runs (a command blocks the timer, so
//  bz.ps1 used to report "agent died" on anything longer than 6 s); result.json is always written,
//  even when the returned value cannot be serialized.
// ============================================================

var CLAUDE_DIR = 'C:\\Users\\Jarvis\\Documents\\Bazis11\\_claude\\';
var CLAUDE_TRACE = [];
function claudeTrace(s) {
    var t = '';
    try { t = new Date().toISOString(); } catch (e) { t = String(new Date().getTime()); }
    CLAUDE_TRACE.push(t + ' ' + s);
    try { system.writeTextFile(CLAUDE_DIR + 'agent_trace.txt', CLAUDE_TRACE.join('\r\n')); } catch (e2) {}
}
function claudeFail(stage, e) {
    var msg = stage + ': ' + String(e) + (e && e.stack ? ('\r\n' + String(e.stack)) : '');
    claudeTrace('ERROR ' + msg);
    try { system.writeTextFile(CLAUDE_DIR + 'agent_error.json', '{"at":"' + new Date().getTime() + '","stage":"' + stage + '","error":"' + String(e).replace(/["\\\r\n]/g, ' ') + '"}'); } catch (e2) {}
}

claudeTrace('1 script started, typeof setInterval=' + (typeof setInterval) + ' typeof Action.Continue=' + (typeof Action.Continue) + ' typeof Action.AsyncExec=' + (typeof Action.AsyncExec));

try {
    system.require(CLAUDE_DIR + 'lib.js');
    claudeTrace('2 lib loaded, BZ.VERSION=' + BZ.VERSION);
} catch (e) { claudeFail('require lib', e); throw e; }

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

    var caps;
    try {
        caps = BZ.caps();
        caps.mode = BZ.vm ? 'vm' : 'eval';
        caps.utf8 = !!BZ.fs;
        caps.agent = '3.2';
        caps.scheduler = (typeof setInterval === 'function') ? 'timer' : 'asyncexec';
        claudeTrace('3 caps ok, scheduler=' + caps.scheduler);

        BZ.write('stop.flag', '0');
        BZ.write('cmd.js', '');
        BZ.writeJson('status.json', { state: 'running', started: new Date().toString(), api: caps.api, model: Action.ModelFilename, caps: caps });
        claudeTrace('4 status.json written');
    } catch (e) { claudeFail('init', e); throw e; }

    var started = new Date().getTime();
    var lastCmd = started, lastBeat = 0, seq = 0, done = 0, ticks = 0;
    var busy = false, finished = false, timer = null;

    function stopTimer() { if (timer !== null) { try { clearInterval(timer); } catch (e) {} timer = null; } }

    function finish(reason) {
        if (finished) return;
        finished = true;
        stopTimer();
        BZ.writeJson('status.json', { state: 'stopped', reason: reason, done: done });
        claudeTrace('finish: ' + reason);
        try { Action.Finish(); } catch (e) {}
    }

    function beat(now, busyId) {
        var hb = { ts: now, seq: seq++, done: done, uptimeSec: Math.round((now - started) / 1000), scheduler: caps.scheduler, ticks: ticks };
        if (busyId) hb.busy = busyId;
        BZ.writeJson('heartbeat.json', hb);
    }

    function execute(src) {
        var res = { id: readId(), ok: true, startedAt: new Date().toString(), mode: caps.mode };
        try { beat(new Date().getTime(), res.id || 'cmd'); } catch (eb) {}
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
        try { res.modelSize = BZ.v3(Model.GSize); } catch (e6) {}
        try {
            BZ.writeJson('result.json', res);
        } catch (e7) {
            // never leave bz.ps1 waiting: drop the parts that may not serialize and report why
            BZ.writeJson('result.json', { id: res.id, ok: false, error: 'result could not be written: ' + String(e7), log: res.log, ms: res.ms, changedCount: res.changedCount });
        }
        done++;
        lastCmd = new Date().getTime();
        lastBeat = lastCmd;
        try { beat(lastCmd, null); } catch (e8) {}
    }

    function tick() {
        if (finished || busy) return;
        busy = true;
        ticks++;
        if (ticks === 1 || ticks === 2 || ticks === 10) claudeTrace('tick #' + ticks);
        try {
            var now = new Date().getTime();
            if (now - lastBeat >= HEARTBEAT_MS) {
                lastBeat = now;
                beat(now, null);
            }
            if (stopRequested()) { finish('stop.flag'); return; }
            if (now - lastCmd > IDLE_MIN * 60000) { finish('idle timeout'); return; }
            var src = readCmd();
            if (src && /\S/.test(src)) {
                BZ.write('cmd.js', '');
                execute(src);
            }
        } catch (e) {
            claudeFail('tick', e);
        } finally {
            busy = false;
        }
    }

    try {
        Action.OnFinish = function () {
            if (finished) return;
            finished = true;
            stopTimer();
            claudeTrace('OnFinish (Esc or Bazis ended the script)');
            try { BZ.writeJson('status.json', { state: 'stopped', reason: 'script finished (Esc or Bazis)', done: done }); } catch (e) {}
        };

        if (caps.scheduler === 'timer') {
            timer = setInterval(tick, POLL_MS);
        } else {
            var loop = function () { tick(); if (!finished) Action.AsyncExec(loop); };
            Action.AsyncExec(loop);
        }
        claudeTrace('5 scheduler armed');
        tick();
        claudeTrace('6 first tick done, calling Action.Continue');
        Action.Continue();
        claudeTrace('7 Action.Continue returned, script body finished');
    } catch (e) { claudeFail('start', e); throw e; }
})();
