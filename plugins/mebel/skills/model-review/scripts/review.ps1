# review.ps1 - full review of the model open in BAZIS: collect the data through the agent, run the rules.
#
#   review.ps1                      review at any moment
#   review.ps1 -Mode handoff        final check before the model goes to cutting (an unsaved model blocks)
#   review.ps1 -Expect 1210x610x3012    the dimensions the user asked for (three numbers, any order)
#   review.ps1 -Hidden left,right,top   sides of the product nobody sees (wall, ceiling, neighbour cabinet);
#                                       back and bottom are hidden by default, -Hidden replaces the list
#   review.ps1 -Rules my_rules.json     another thresholds file (default: review_rules.json next to this script)
#   review.ps1 -Bazis D:\Bazis11        Bazis folder (default %USERPROFILE%\Documents\Bazis11)
#   review.ps1 -Out <dir>               where to put the report (default <Bazis>\_claude\review)
#
# Exit codes: 0 ready, 1 blockers or checks that could not run, 2 bad input,
#             3 the agent did not answer or the collector failed, 4 Python not found.
# Output files: review_report.md, review_report.json, cutlist.csv, hardware.csv.
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI).
param(
    [ValidateSet('review', 'handoff')][string]$Mode = 'review',
    [string]$Bazis = (Join-Path $env:USERPROFILE 'Documents\Bazis11'),
    [string]$Expect,
    [string]$Hidden,
    [string]$Rules,
    [string]$Out,
    [int]$TimeoutSec = 300
)
$ErrorActionPreference = 'Stop'
# Started from PowerShell 7: the nested Windows PowerShell 5.1 would inherit PSModulePath of 7 and lose
# its own cmdlets (ConvertFrom-Json and others). Give the children the machine-wide path.
if ($PSVersionTable.PSVersion.Major -ge 6) {
    $env:PSModulePath = [Environment]::GetEnvironmentVariable('PSModulePath', 'Machine')
}
$here    = $PSScriptRoot
$work    = Join-Path $Bazis '_claude'
$bz      = Join-Path $work 'bz.ps1'
$install = Join-Path $here '..\..\bazis-script\scripts\install.ps1'
$manifest = Join-Path $here '..\..\..\.claude-plugin\plugin.json'
if (-not $Out) { $Out = Join-Path $work 'review' }

# 1. Runtime in the Bazis folder must match the plugin
$want = ''
if (Test-Path -LiteralPath $manifest) { $want = (Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version }
$have = ''
$pv = Join-Path $work 'plugin_version.txt'
if (Test-Path -LiteralPath $pv) { $have = (Get-Content -LiteralPath $pv -Raw).Trim() }
if (-not (Test-Path -LiteralPath $bz) -or ($want -and $have -ne $want)) {
    "review: runtime '$have' differs from plugin '$want', installing"
    & powershell -NoProfile -ExecutionPolicy Bypass -File $install -Bazis $Bazis
    if ($LASTEXITCODE -ne 0) { "review: install.ps1 failed"; exit 3 }
}

# 2. Collect through the agent (read only, no automatic inspect)
$data = Join-Path $work 'review_data.json'
$started = Get-Date
& powershell -NoProfile -ExecutionPolicy Bypass -File $bz -File (Join-Path $here 'cmd_review_collect.js') -NoInspect -TimeoutSec $TimeoutSec
$code = $LASTEXITCODE
if ($code -ne 0) {
    "review: the collector did not finish (bz.ps1 exit code $code). The model was NOT checked."
    if ($code -eq 2) { "review: ask the user to start the agent in Bazis: menu Scripts -> Claude Agent" }
    exit 3
}
if (-not (Test-Path -LiteralPath $data) -or (Get-Item -LiteralPath $data).LastWriteTime -lt $started.AddSeconds(-2)) {
    "review: $data was not refreshed. The model was NOT checked."; exit 3
}

# 3. Rules
$py = $null
foreach ($c in @(@('py', '-3'), @('python'), @('python3'))) {
    if (Get-Command $c[0] -ErrorAction SilentlyContinue) {
        try { & $c[0] @($c | Select-Object -Skip 1) -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" 2>$null; if ($LASTEXITCODE -eq 0) { $py = $c; break } } catch { }
    }
}
if (-not $py) { "review: Python 3.8+ not found (tried py -3, python, python3). The data is in $data"; exit 4 }

# Python prints UTF-8. Read it as UTF-8 here and re-emit as PowerShell strings, so the text leaves this
# script the same way bz.ps1 output does, whatever the console code page is.
$env:PYTHONIOENCODING = 'utf-8'
$oldEnc = [Console]::OutputEncoding
try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }
$a = @($py | Select-Object -Skip 1) + @((Join-Path $here 'review.py'), $data, '--out', $Out, '--mode', $Mode)
if ($Expect) { $a += @('--expect', $Expect) }
if ($PSBoundParameters.ContainsKey('Hidden')) { $a += @('--hidden', $Hidden) }
if ($Rules)  { $a += @('--rules', $Rules) }
$lines = & $py[0] @a
$rc = $LASTEXITCODE
try { [Console]::OutputEncoding = $oldEnc } catch { }
$lines
exit $rc
