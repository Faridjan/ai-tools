# bz.ps1 (v3) - send a command to the Claude Agent running inside BAZIS and wait for the result.
#   bz.ps1 -File cmd_xxx.js          run a JS file (UTF-8 allowed when the agent reports caps.utf8)
#   bz.ps1 -Stdin                    read the JS from stdin  (robust alternative to -Code)
#   bz.ps1 -Code "log(Model.Count)"   inline JS  (fragile when called through a nested powershell: prefer -File)
#   bz.ps1 -Status                    is the agent alive? (+ capabilities)
#   bz.ps1 -Stop                      stop the agent
#   bz.ps1 -Raw                       print raw result.json instead of a summary
#   bz.ps1 -NoInspect                 skip the automatic ModelInspector pass for this command
# Exit codes: 0 ok, 1 nothing to run / bad file, 2 agent not running, 3 no UTF-8 in the agent,
#             4 agent died, 5 timeout, 6 the command itself failed (ERROR), 7 another session holds the agent.
# v3: one command at a time across sessions (named mutex), cmd.js is written atomically, a long command
#     is not reported as "agent died" (the agent marks heartbeat.json busy), a failed command returns 6.
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI).
param(
    [string]$File,
    [string]$Code,
    [switch]$Stdin,
    [switch]$Status,
    [switch]$Stop,
    [switch]$Raw,
    [switch]$NoInspect,
    [int]$TimeoutSec = 120
)
$ErrorActionPreference = 'Stop'
$DIR = 'C:\Users\Jarvis\Documents\Bazis11\_claude'
$ascii = New-Object System.Text.ASCIIEncoding
$utf8 = New-Object System.Text.UTF8Encoding($false)
# Process that hosts the agent. Tests run the agent in node and set BZ_HOST_PROCESS=node.
$hostProc = if ($env:BZ_HOST_PROCESS) { $env:BZ_HOST_PROCESS } else { 'Bazis' }

function Heartbeat {
    $hb = Join-Path $DIR 'heartbeat.json'
    if (-not (Test-Path -LiteralPath $hb)) { return $null }
    $r = @{ age = ((Get-Date) - (Get-Item -LiteralPath $hb).LastWriteTime).TotalSeconds; busy = $null }
    try { $r.busy = ([IO.File]::ReadAllText($hb, $utf8) | ConvertFrom-Json).busy } catch { }
    return $r
}
# Alive: a fresh heartbeat, or the agent is inside a command (it cannot beat while a command runs)
# and its host process still exists.
function Alive([string]$busyId) {
    $h = Heartbeat
    if ($null -eq $h) { return $false }
    if ($h.age -lt 6) { return $true }
    if ($h.busy -and ((-not $busyId) -or ($h.busy -eq $busyId))) {
        return [bool](Get-Process $hostProc -ErrorAction SilentlyContinue | Select-Object -First 1)
    }
    return $false
}
function Caps {
    $st = Join-Path $DIR 'status.json'
    if (-not (Test-Path -LiteralPath $st)) { return $null }
    try { return ([IO.File]::ReadAllText($st, $utf8) | ConvertFrom-Json).caps } catch { return $null }
}

if ($Status) {
    $h = Heartbeat
    if ($h -and $h.age -lt 6) {
        "AGENT: alive  " + (Get-Content -LiteralPath (Join-Path $DIR 'heartbeat.json') -Raw)
        $c = Caps
        if ($c) { "CAPS: " + ($c | ConvertTo-Json -Compress) }
    }
    elseif (Alive) { "AGENT: busy with command $($h.busy) for $([int]$h.age) s (another session is using it)" }
    else { "AGENT: NOT RUNNING (start it in BAZIS: menu Scripts -> Claude Agent)" }
    $bp = Get-Process Bazis -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($bp) { "BAZIS: pid=$($bp.Id) responding=$($bp.Responding) title=$($bp.MainWindowTitle)" } else { "BAZIS: not running" }
    $pv = Join-Path $DIR 'plugin_version.txt'
    if (Test-Path -LiteralPath $pv) { "RUNTIME: " + (Get-Content -LiteralPath $pv -Raw).Trim() }
    try {
        $hangs = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Hang'; StartTime = (Get-Date).AddHours(-2) } -ErrorAction Stop | Where-Object { $_.Message -match 'Bazis\.exe' })
        if ($hangs.Count) { "HANGS (2h): " + $hangs.Count + " - last at " + $hangs[0].TimeCreated }
    } catch { }
    $tr = Join-Path $DIR 'agent_trace.txt'
    if ((Test-Path -LiteralPath $tr) -and (((Get-Date) - (Get-Item -LiteralPath $tr).LastWriteTime).TotalMinutes -lt 30)) { "AGENT_TRACE (" + (Get-Item -LiteralPath $tr).LastWriteTime + "):"; Get-Content -LiteralPath $tr }
    $ae = Join-Path $DIR 'agent_error.json'
    if ((Test-Path -LiteralPath $ae) -and (((Get-Date) - (Get-Item -LiteralPath $ae).LastWriteTime).TotalMinutes -lt 30)) { "AGENT_ERROR: " + (Get-Content -LiteralPath $ae -Raw) }
    exit 0
}
if ($Stop) {
    [IO.File]::WriteAllText((Join-Path $DIR 'stop.flag'), '1', $ascii)
    Start-Sleep -Milliseconds 800
    if (Test-Path -LiteralPath (Join-Path $DIR 'status.json')) { Get-Content -LiteralPath (Join-Path $DIR 'status.json') -Raw }
    exit 0
}

if ($File) {
    # resolve against the PowerShell location: .NET would use the process directory, which may differ
    $path = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($File)
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { Write-Output "ERROR: command file not found: $path"; exit 1 }
    $src = [IO.File]::ReadAllText($path, $utf8)
}
elseif ($Stdin) { $src = [Console]::In.ReadToEnd() }
elseif ($Code) { $src = $Code }
else { Write-Output "nothing to run"; exit 1 }
if ($src -notmatch '\S') { Write-Output "ERROR: the command is empty"; exit 1 }

# One command at a time: cmd.js and result.json are shared by every Claude session on this machine.
$mutex = New-Object System.Threading.Mutex($false, 'ClaudeBazisAgentCommand')
$owned = $false
try { $owned = $mutex.WaitOne([TimeSpan]::FromSeconds($TimeoutSec)) } catch [System.Threading.AbandonedMutexException] { $owned = $true }
if (-not $owned) { Write-Output "ERROR: another session has been running a command in the agent for more than $TimeoutSec s"; exit 7 }

$script:code = 0
# A function, so that "return" leaves only this block and the mutex is always released below.
function Send-Command {
    if (-not (Alive)) { Write-Output "ERROR: agent not running. Start it in BAZIS: menu Scripts -> Claude Agent"; $script:code = 2; return }

    $caps = Caps
    $utf8ok = ($null -ne $caps) -and ($caps.utf8 -eq $true)
    if (-not $utf8ok -and ($src -match '[^\x00-\x7F]')) {
        Write-Output "ERROR: agent has no fs/UTF-8 support (old agent?). Use \uXXXX escapes or restart the agent."; $script:code = 3; return
    }
    if ($NoInspect) { $src = "BZ.autoInspect = false;`r`n" + $src }   # agent restores autoInspect after each command

    $id = [guid]::NewGuid().ToString('N').Substring(0, 8)
    $res = Join-Path $DIR 'result.json'
    $cmd = Join-Path $DIR 'cmd.js'
    $tmp = Join-Path $DIR ('cmd.' + $id + '.tmp')
    if (Test-Path -LiteralPath $res) { Remove-Item -LiteralPath $res -Force }
    [IO.File]::WriteAllText((Join-Path $DIR 'cmd.id'), $id, $ascii)
    $enc = if ($utf8ok) { $utf8 } else { $ascii }
    # write aside and move into place, so the agent never reads half a file
    [IO.File]::WriteAllText($tmp, $src, $enc)
    $moved = $false
    for ($i = 0; $i -lt 20 -and -not $moved; $i++) {
        try { Move-Item -LiteralPath $tmp -Destination $cmd -Force; $moved = $true } catch { Start-Sleep -Milliseconds 50 }
    }
    if (-not $moved) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue; Write-Output "ERROR: cannot write $cmd (locked)"; $script:code = 1; return }

    $sw = [Diagnostics.Stopwatch]::StartNew()
    $parseErr = $null
    while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
        Start-Sleep -Milliseconds 150
        if (Test-Path -LiteralPath $res) {
            $txt = $null; $j = $null
            try { $txt = [IO.File]::ReadAllText($res, $utf8); $j = $txt | ConvertFrom-Json; $parseErr = $null } catch { $parseErr = $_.Exception.Message }
            if ($null -ne $j -and $j.id -eq $id) {
                if (-not $j.ok) { $script:code = 6 }
                if ($Raw) { $txt; return }
                $st = if ($j.ok) { 'OK' } else { 'ERROR' }
                Write-Output ("[$st] id=$id  {0} ms  modelSize={1}  changed={2}" -f $j.ms, ($j.modelSize -join ' x '), $j.changedCount)
                if (-not $j.ok) { Write-Output ("  error: " + $j.error); if ($j.line) { Write-Output ("  line: " + $j.line) } }
                if ((-not $j.ok) -and ($j.changedCount -gt 0)) { Write-Output ("  PARTIAL: the command failed after changing {0} object(s). These changes are already committed: fix them with the next command or ask the user to undo in BAZIS. Do not rerun the whole command." -f $j.changedCount) }
                if ($j.commitError) { Write-Output ("  commitError: " + $j.commitError) }
                if ($j.diffError) { Write-Output ("  diffError: " + $j.diffError + " (the change list and the automatic check are missing for this command)") }
                if ($j.log) { foreach ($l in $j.log) { Write-Output ("  > " + $l) } }
                if ($j.changed) {
                    foreach ($c in $j.changed) {
                        if ($c.op -eq 'mod') {
                            $line = "  ~ {0} [{1}]  {2} -> {3}" -f $c.name, $c.path, (($c.before | ForEach-Object { '[' + ($_ -join ',') + ']' }) -join '..'), (($c.after | ForEach-Object { '[' + ($_ -join ',') + ']' }) -join '..')
                            foreach ($f in 'rename', 'mat', 't', 'butts', 'tex') { if ($null -ne $c.$f) { $line += "  $f=" + ((@($c.$f) | ForEach-Object { ([string]$_).Replace("`r", '|') }) -join ' -> ') } }
                            Write-Output $line
                        }
                        else { Write-Output ("  {0} {1} [{2}]" -f $c.op, $c.name, $c.path) }
                    }
                    if ($j.changedCount -gt @($j.changed).Count) { Write-Output ("  ... and {0} more changed object(s), see result.json" -f ($j.changedCount - @($j.changed).Count)) }
                }
                if ($j.inspect) {
                    if ($j.inspect.available -eq $false) { Write-Output "  inspect: not available" }
                    elseif ($j.inspect.count -gt 0) { Write-Output ("  INSPECT: {0} problem(s), {1} ms" -f $j.inspect.count, $j.inspect.ms); foreach ($e in $j.inspect.errors) { Write-Output ("    ! " + $e.msg + " : " + (($e.objects) -join ', ')) } }
                    else { Write-Output ("  inspect: clean ({0} ms). Covers panel overlap and sheet size only: hardware, holes and edges need review.ps1" -f $j.inspect.ms) }
                }
                if ($null -ne $j.ret) { Write-Output ("  ret: " + ($j.ret | ConvertTo-Json -Compress -Depth 6)) }
                return
            }
        }
        if (-not (Alive $id)) { Write-Output "ERROR: agent died while running the command"; $script:code = 4; return }
    }
    Write-Output "TIMEOUT after $TimeoutSec s (agent alive: $(Alive $id))"
    if ($parseErr) { Write-Output "  result.json exists but cannot be parsed: $parseErr. Read it with -Raw or open $res" }
    $script:code = 5
}
try { Send-Command }
finally {
    try { $mutex.ReleaseMutex() } catch { }
    $mutex.Dispose()
}
exit $script:code
