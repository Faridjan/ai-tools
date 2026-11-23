# install.ps1 - deploy the bazis-script runtime from the plugin into the Bazis working folder.
# The plugin is the single source of truth. <Bazis>\_claude is a disposable exchange
# folder (cmd.js, result.json, dumps) and can be recreated by running this script again.
# Careful: BZ.backup() also puts model backups (*_BACKUP_*.b3d) there, so move those out before deleting it.
#
# The scripts in the plugin are written for the author's folder (see $author below).
# On any other machine this installer rewrites that path to the real Bazis folder
# while copying, so nothing has to be edited by hand.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [-Bazis <path>]
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI).

param(
    [string]$Bazis = (Join-Path $env:USERPROFILE 'Documents\Bazis11')
)

$ErrorActionPreference = 'Stop'
$src    = $PSScriptRoot
$author = 'C:\Users\Jarvis\Documents\Bazis11'

if (-not (Test-Path -LiteralPath $Bazis)) {
    throw "Bazis folder not found: $Bazis. Pass the real one: install.ps1 -Bazis <path>"
}
$Bazis = (Get-Item -LiteralPath $Bazis).FullName.TrimEnd('\')
$work  = Join-Path $Bazis '_claude'
$menu  = Join-Path $Bazis 'Scripts'
New-Item -ItemType Directory -Force $work, $menu | Out-Null

$same = ($Bazis -ieq $author)

# Target path as a JS string literal body: backslashes doubled, non-ASCII as \uXXXX,
# because lib.js and the agent must stay ASCII (Bazis reads them as ANSI).
function ConvertTo-JsPath([string]$p) {
    $sb = New-Object System.Text.StringBuilder
    foreach ($ch in $p.ToCharArray()) {
        $code = [int]$ch
        if ($ch -eq '\')      { [void]$sb.Append('\\') }
        elseif ($ch -eq "'")  { [void]$sb.Append("\'") }
        elseif ($code -gt 126 -or $code -lt 32) { [void]$sb.Append(('\u{0:x4}' -f $code)) }
        else                  { [void]$sb.Append($ch) }
    }
    $sb.ToString()
}
function Test-Ascii([string]$s) {
    foreach ($ch in $s.ToCharArray()) { if ([int]$ch -gt 126) { return $false } }
    return $true
}

$authorJs = $author.Replace('\', '\\')
$bazisJs  = ConvertTo-JsPath $Bazis
$bazisPs  = $Bazis.Replace("'", "''")
$ascii    = Test-Ascii $Bazis

# Copy one text file, rewriting the author's path. Byte-identical copy when nothing changes.
function Install-Text([string]$from, [string]$toDir) {
    $to = Join-Path $toDir (Split-Path $from -Leaf)
    if ($same) { Copy-Item -LiteralPath $from -Destination $to -Force; return }

    $bytes  = [System.IO.File]::ReadAllBytes($from)
    $hasBom = ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF)
    $skip   = 0; if ($hasBom) { $skip = 3 }
    $text   = [System.Text.Encoding]::UTF8.GetString($bytes, $skip, $bytes.Length - $skip)
    $ext    = [System.IO.Path]::GetExtension($from).ToLower()

    if ($ext -eq '.js') {
        # both the escaped form in string literals and the plain form in comments stay ASCII
        $new = $text.Replace($authorJs, $bazisJs)
        if ($ascii) { $new = $new.Replace($author, $Bazis) } else { $new = $new.Replace($author, $bazisJs) }
    }
    elseif ($ext -eq '.ps1') {
        $new = $text.Replace($author, $bazisPs)
        # PowerShell 5.1 needs a BOM to read non-ASCII text as UTF-8
        if (-not $ascii) { $hasBom = $true }
    }
    else {
        $new = $text.Replace($author, $Bazis)
    }

    if ($new -ceq $text) { Copy-Item -LiteralPath $from -Destination $to -Force; return }
    $enc = New-Object System.Text.UTF8Encoding($hasBom)
    [System.IO.File]::WriteAllText($to, $new, $enc)
}

function Get-Sha([string]$p) {
    if (-not (Test-Path -LiteralPath $p)) { return '' }
    (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash
}
$agentTo  = Join-Path $menu 'Claude Agent.js'
$libTo    = Join-Path $work 'lib.js'
$agentOld = Get-Sha $agentTo
$libOld   = Get-Sha $libTo

# Runtime files the agent and bz.ps1 expect next to each other in _claude
$flat = @('lib.js', 'bz.ps1', 'make-spec-xlsx.ps1', 'agent-loop-fallback.js', 'probe.js',
          'examples\cmd_selftest.js', 'examples\cmd_probe_library.js')
foreach ($f in $flat) { Install-Text (Join-Path $src $f) $work }
foreach ($f in Get-ChildItem -LiteralPath (Join-Path $src 'drawings') -File) { Install-Text $f.FullName $work }

# Official BazisSoft script examples (MIT), copied as is
$ref = Join-Path $work 'ref'
New-Item -ItemType Directory -Force $ref | Out-Null
Copy-Item -LiteralPath (Join-Path $src 'ref\BazisSoft-Scripts') -Destination $ref -Recurse -Force

# The agent itself: Bazis shows it in the Scripts menu
Install-Text (Join-Path $src 'Claude Agent.js') $menu

# Version stamp, so the skill can tell when the runtime is older than the plugin
$ver = 'unknown'
$manifest = Join-Path $src '..\..\..\.claude-plugin\plugin.json'
if (Test-Path -LiteralPath $manifest) {
    $ver = (Get-Content -LiteralPath $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
}
Set-Content -LiteralPath (Join-Path $work 'plugin_version.txt') -Value $ver -Encoding ascii

"OK: runtime $ver installed to $work"
"OK: agent copied to $menu\Claude Agent.js"
if (-not $same) { "OK: paths rewritten from $author to $Bazis" }
# A running agent keeps the old code in memory: say exactly what has to be reloaded.
$hb = Join-Path $work 'heartbeat.json'
$running = (Test-Path -LiteralPath $hb) -and (((Get-Date) - (Get-Item -LiteralPath $hb).LastWriteTime).TotalSeconds -lt 6)
$agentNew = ($agentOld -ne (Get-Sha $agentTo))
$libNew   = ($libOld -ne (Get-Sha $libTo))
if ($running -and $agentNew) { "RESTART: Claude Agent.js changed and the agent is running. Ask the user to stop it (Esc) and start it again from menu Scripts -> Claude Agent" }
elseif ($running -and $libNew) { "RELOAD: lib.js changed and the agent is running. Run a command with BZ.reload(), then cmd_selftest.js" }
elseif (-not $running) { "NEXT: in Bazis run menu Scripts -> Claude Agent, then $work\bz.ps1 -Status" }
else { "OK: the running agent is up to date" }
"NOTE: model backups (*_BACKUP_*.b3d) live in $work. Move them out before deleting that folder."
