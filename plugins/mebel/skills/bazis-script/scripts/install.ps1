# install.ps1 - deploy the bazis-script runtime from the plugin into the Bazis working folder.
# The plugin is the single source of truth. Documents\Bazis11\_claude is a disposable
# exchange folder (cmd.js, result.json, dumps, backups) and can be deleted at any time:
# run this script again to recreate it.
#
# Usage: powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 [-Bazis <path>]
# Keep this file ASCII only (Windows PowerShell 5.1 reads BOM-less files as ANSI).

param(
    [string]$Bazis = (Join-Path $env:USERPROFILE 'Documents\Bazis11')
)

$ErrorActionPreference = 'Stop'
$src  = $PSScriptRoot
$work = Join-Path $Bazis '_claude'
$menu = Join-Path $Bazis 'Scripts'

if (-not (Test-Path $Bazis)) { throw "Bazis folder not found: $Bazis" }
New-Item -ItemType Directory -Force $work, $menu | Out-Null

# Runtime files the agent and bz.ps1 expect next to each other in _claude
$flat = @('lib.js', 'bz.ps1', 'make-spec-xlsx.ps1', 'agent-loop-fallback.js', 'probe.js')
foreach ($f in $flat) { Copy-Item (Join-Path $src $f) $work -Force }
Copy-Item (Join-Path $src 'drawings\*') $work -Force
Copy-Item (Join-Path $src 'examples\cmd_selftest.js') $work -Force
Copy-Item (Join-Path $src 'examples\cmd_probe_library.js') $work -Force

# Official BazisSoft script examples (MIT)
$ref = Join-Path $work 'ref'
New-Item -ItemType Directory -Force $ref | Out-Null
Copy-Item (Join-Path $src 'ref\BazisSoft-Scripts') $ref -Recurse -Force

# The agent itself: Bazis shows it in the Scripts menu
Copy-Item (Join-Path $src 'Claude Agent.js') $menu -Force

# Version stamp, so the skill can tell when the runtime is older than the plugin
$ver = 'unknown'
$manifest = Join-Path $src '..\..\..\.claude-plugin\plugin.json'
if (Test-Path $manifest) {
    $ver = (Get-Content $manifest -Raw -Encoding UTF8 | ConvertFrom-Json).version
}
Set-Content (Join-Path $work 'plugin_version.txt') $ver -Encoding ascii

"OK: runtime $ver installed to $work"
"OK: agent copied to $menu\Claude Agent.js"
"NEXT: in Bazis run menu Scripts -> Claude Agent, then bz.ps1 -Status"
