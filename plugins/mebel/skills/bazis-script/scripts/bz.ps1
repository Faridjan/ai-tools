# bz.ps1 (v2) - send a command to the Claude Agent running inside BAZIS and wait for the result.
#   bz.ps1 -File cmd_xxx.js          run a JS file (UTF-8 allowed when the agent reports caps.utf8)
#   bz.ps1 -Stdin                    read the JS from stdin  (robust alternative to -Code)
#   bz.ps1 -Code "log(Model.Count)"   inline JS  (fragile when called through a nested powershell: prefer -File)
#   bz.ps1 -Status                    is the agent alive? (+ capabilities)
#   bz.ps1 -Stop                      stop the agent
#   bz.ps1 -Raw                       print raw result.json instead of a summary
#   bz.ps1 -NoInspect                 skip the automatic ModelInspector pass for this command
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

function Alive {
    $hb = Join-Path $DIR 'heartbeat.json'
    if (-not (Test-Path $hb)) { return $false }
    $age = ((Get-Date) - (Get-Item $hb).LastWriteTime).TotalSeconds
    return ($age -lt 6)
}
function Caps {
    $st = Join-Path $DIR 'status.json'
    if (-not (Test-Path $st)) { return $null }
    try { return ([IO.File]::ReadAllText($st, $utf8) | ConvertFrom-Json).caps } catch { return $null }
}

if ($Status) {
    if (Alive) {
        "AGENT: alive  " + (Get-Content (Join-Path $DIR 'heartbeat.json') -Raw)
        $c = Caps
        if ($c) { "CAPS: " + ($c | ConvertTo-Json -Compress) }
    } else { "AGENT: NOT RUNNING (start it in BAZIS: menu Scripts -> Claude Agent)" }
    $bp = Get-Process Bazis -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($bp) { "BAZIS: pid=$($bp.Id) responding=$($bp.Responding) title=$($bp.MainWindowTitle)" } else { "BAZIS: not running" }
    try {
        $hangs = @(Get-WinEvent -FilterHashtable @{ LogName = 'Application'; ProviderName = 'Application Hang'; StartTime = (Get-Date).AddHours(-2) } -ErrorAction Stop | Where-Object { $_.Message -match 'Bazis\.exe' })
        if ($hangs.Count) { "HANGS (2h): " + $hangs.Count + " - last at " + $hangs[0].TimeCreated }
    } catch { }
    $tr = Join-Path $DIR 'agent_trace.txt'
    if ((Test-Path $tr) -and (((Get-Date) - (Get-Item $tr).LastWriteTime).TotalMinutes -lt 30)) { "AGENT_TRACE (" + (Get-Item $tr).LastWriteTime + "):"; Get-Content $tr }
    $ae = Join-Path $DIR 'agent_error.json'
    if ((Test-Path $ae) -and (((Get-Date) - (Get-Item $ae).LastWriteTime).TotalMinutes -lt 30)) { "AGENT_ERROR: " + (Get-Content $ae -Raw) }
    exit 0
}
if ($Stop) {
    [IO.File]::WriteAllText((Join-Path $DIR 'stop.flag'), '1', $ascii)
    Start-Sleep -Milliseconds 800
    if (Test-Path (Join-Path $DIR 'status.json')) { Get-Content (Join-Path $DIR 'status.json') -Raw }
    exit 0
}

if (-not (Alive)) { Write-Output "ERROR: agent not running. Start it in BAZIS: menu Scripts -> Claude Agent"; exit 2 }

if ($File) { $src = [IO.File]::ReadAllText($File, $utf8) }
elseif ($Stdin) { $src = [Console]::In.ReadToEnd() }
elseif ($Code) { $src = $Code }
else { Write-Output "nothing to run"; exit 1 }

$caps = Caps
$utf8ok = ($null -ne $caps) -and ($caps.utf8 -eq $true)
if (-not $utf8ok -and ($src -match '[^\x00-\x7F]')) {
    Write-Output "ERROR: agent has no fs/UTF-8 support (old agent?). Use \uXXXX escapes or restart the agent."; exit 3
}
if ($NoInspect) { $src = "BZ.autoInspect = false;`r`n" + $src }   # agent restores autoInspect after each command

$id = [guid]::NewGuid().ToString('N').Substring(0, 8)
$res = Join-Path $DIR 'result.json'
if (Test-Path $res) { Remove-Item $res -Force }
[IO.File]::WriteAllText((Join-Path $DIR 'cmd.id'), $id, $ascii)
$enc = if ($utf8ok) { $utf8 } else { $ascii }
[IO.File]::WriteAllText((Join-Path $DIR 'cmd.js'), $src, $enc)

$sw = [Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt $TimeoutSec) {
    Start-Sleep -Milliseconds 150
    if (Test-Path $res) {
        try {
            $txt = [IO.File]::ReadAllText($res, $utf8)
            $j = $txt | ConvertFrom-Json
            if ($j.id -eq $id) {
                if ($Raw) { $txt; exit 0 }
                $st = if ($j.ok) { 'OK' } else { 'ERROR' }
                Write-Output ("[$st] id=$id  {0} ms  modelSize={1}  changed={2}" -f $j.ms, ($j.modelSize -join ' x '), $j.changedCount)
                if (-not $j.ok) { Write-Output ("  error: " + $j.error); if ($j.line) { Write-Output ("  line: " + $j.line) } }
                if ((-not $j.ok) -and ($j.changedCount -gt 0)) { Write-Output ("  PARTIAL: the command failed after changing {0} object(s). These changes are already committed: fix them with the next command or ask the user to undo in BAZIS. Do not rerun the whole command." -f $j.changedCount) }
                if ($j.commitError) { Write-Output ("  commitError: " + $j.commitError) }
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
                }
                if ($j.inspect) {
                    if ($j.inspect.available -eq $false) { Write-Output "  inspect: not available" }
                    elseif ($j.inspect.count -gt 0) { Write-Output ("  INSPECT: {0} problem(s), {1} ms" -f $j.inspect.count, $j.inspect.ms); foreach ($e in $j.inspect.errors) { Write-Output ("    ! " + $e.msg + " : " + (($e.objects) -join ', ')) } }
                    else { Write-Output ("  inspect: clean ({0} ms)" -f $j.inspect.ms) }
                }
                if ($null -ne $j.ret) { Write-Output ("  ret: " + ($j.ret | ConvertTo-Json -Compress -Depth 6)) }
                exit 0
            }
        } catch { }
    }
    if (-not (Alive)) { Write-Output "ERROR: agent died while running the command"; exit 4 }
}
Write-Output "TIMEOUT after $TimeoutSec s (agent alive: $(Alive))"
exit 5
