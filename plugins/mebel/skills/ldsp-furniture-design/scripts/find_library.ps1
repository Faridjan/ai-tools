<#
.SYNOPSIS
  Read-only search in BAZIS-Mebelshchik 11 libraries: furniture (.f3d), fragments (.fr3d/.frw/.b3d),
  textures (.jpg), material XML/DBF catalogs and (optionally) zip archives in Downloads.
  Never writes or modifies anything.

.EXAMPLES
  # hinges of brand Blum with CLIP top and blumotion
  .\find_library.ps1 -Type hinge -Brand blum -Query "clip top","blumotion"
  # ball-bearing slides NL 450 of any brand
  .\find_library.ps1 -Type slide -NL 450
  # confirmat / eccentric fasteners
  .\find_library.ps1 -Type fastener -Query "конфирмат"
  # texture / decor search (jpg + material XML records)
  .\find_library.ps1 -Kind texture -Query "H1180"
  .\find_library.ps1 -Kind material -Query "F186"
  # also look inside zip archives (TOC only, no extraction)
  .\find_library.ps1 -Query "tandembox" -IncludeArchives
  # inventory: counts per brand / type
  .\find_library.ps1 -Inventory
  # machine-readable
  .\find_library.ps1 -Type slide -NL 500 -Json
#>
[CmdletBinding()]
param(
    [string[]]$Query = @(),              # all terms must match (case-insensitive, substring or regex)
    [ValidateSet('', 'hinge', 'slide', 'box', 'lift', 'handle', 'leg', 'shelfsupport', 'hanger', 'coupe', 'fastener', 'push', 'straightener', 'hook', 'rod', 'kitchen', 'profile', 'appliance')]
    [string]$Type = '',
    [string]$Brand = '',
    [int]$NL = 0,                         # nominal length (drawer slide) or any size number, e.g. 450
    [ValidateSet('any', 'furniture', 'fragment', 'texture', 'material', 'archive')]
    [string]$Kind = 'any',
    [string]$Root = 'C:\Users\Jarvis\Documents\Bazis11',
    [string[]]$ExtraRoots = @(),
    [switch]$IncludeDownloads,            # also scan Downloads copies (duplicates of installed libraries + zip archives)
    [switch]$IncludeArchives,             # list TOC of .zip (built-in) and .rar/.exe SFX (WinRAR UnRAR.exe lb), no extraction
    [switch]$Meta,                        # read internal name from f3d/fr3d header (slower)
    [switch]$Inventory,
    [switch]$Json,
    [int]$Top = 60
)

$ErrorActionPreference = 'SilentlyContinue'

$TypeRx = @{
    hinge        = 'петл|hinge|clip|slide-on|click-on|clickline|модул|modul|sensys|veosys|петли'
    slide        = 'направля|slide|tandem|movento|quadro|шарик|ролик|скрыт|3d-control|ecomotion|dynapro|actro|runner'
    box          = 'ящик|box|legrabox|metabox|newline|slimline|axis|linebox|боковин|indigo|merivobox|alphabox|nova-pro|innotech'
    lift         = 'подъ[её]м|aventos|лифт|evolift|kinvaro|механизм|free flap|wingline|газов|kraby'
    handle       = 'ручк|handle|gola|профиль-ручк|рейлинг|скоб|кнопк|раковин|капл'
    leg          = 'опор|ножк|leg|цокол|подпятник'
    shelfsupport = 'полкодерж|менсолодерж|стеклодерж'
    hanger       = 'навес|hold'
    coupe        = 'купе|komandor|raum|double|omge|vello|раздвиж|rm\+|ролик верх|ролик ниж'
    fastener     = 'стяжк|конфирмат|евровинт|эксцентрик|minifix|шкант|шуруп|саморез|уголок|уголки|\bвинт мебельн|стяжка-евровинт|футорк|дюбел|гвозд|межсекц|кроватн'
    push         = 'толкат|tip-on|push|servo'
    straightener = 'выпрямит'
    hook         = 'крюч|вешалк'
    rod          = 'штанг|труб|пантограф|лифт для одежды'
    kitchen      = 'карго|сушилк|мойк|карусел|бутыл|lemax|kessebohmer|кухонн|space tower|orga-line|ambia'
    profile      = 'профил|сечени|плинтус|\.frw$'
    appliance    = 'вытяжк|холодильн|варочн|плит|духов'
}
$Brands = 'Blum|Antarion|Firmax|ТБМ|TBM|GTV|AQ|Grade|Ordi|Hettich|Grass|Boyard|Samet|МДМ|Cinetto|Makmart|AKS|СЛОРОС|Sloros|Kessebohmer|Lemax|Starax|TALISMAN|GELONY|Stilos|MODUS|SAMSUNG-IREX|Модерн Стайл|Egger|Skif|Rehau|AGT|Дятьково|Русский Ламинат|СоюзБалтКомплект|Komandor|Raum|Double|OMGE'

function Get-Kind([string]$ext, [string]$path) {
    switch ($ext) {
        '.f3d'  { return 'furniture' }
        '.fr3d' { return 'fragment' }
        '.frw'  { return 'fragment' }
        '.b3d'  { return 'fragment' }
        '.jpg'  { return 'texture' }
        '.jpeg' { return 'texture' }
        '.bmp'  { return 'texture' }
        '.png'  { return 'texture' }
        '.xml'  { return 'catalog' }
        '.dbf'  { return 'catalog' }
        '.config' { return 'config' }
        { $_ -in '.zip', '.rar', '.7z', '.exe' } { return 'archive' }
        default { return 'other' }
    }
}
function Get-Brand([string]$path) {
    $m = [regex]::Match($path, "(?i)($Brands)")
    if ($m.Success) { return $m.Value } else { return '' }
}
function Get-TypeTag([string]$text) {
    $tags = @()
    foreach ($k in $TypeRx.Keys) { if ($text -match "(?i)$($TypeRx[$k])") { $tags += $k } }
    return ($tags | Sort-Object) -join ','
}
function Get-HeaderName([string]$file) {
    # BZ85 container: first UTF-16LE string with Cyrillic/Latin letters after field table = model Name
    try {
        $fs = [IO.File]::OpenRead($file); $n = [Math]::Min(8192, $fs.Length); $buf = New-Object byte[] $n
        [void]$fs.Read($buf, 0, $n); $fs.Close()
        $u = [Text.Encoding]::Unicode.GetString($buf)
        $m = [regex]::Match($u, '[\u0400-\u04FFA-Za-z0-9][\u0400-\u04FFA-Za-z0-9 ,.\-_()\\/:°=+"№]{5,}')
        if ($m.Success) { return $m.Value.Trim() }
    } catch {}
    return ''
}
function Test-Match([string]$text) {
    foreach ($q in $Query) { if ($text -notmatch "(?i)$([regex]::Escape($q).Replace('\ ', '.*'))") { return $false } }
    if ($Type -and $text -notmatch "(?i)$($TypeRx[$Type])") { return $false }
    if ($Brand -and $text -notmatch "(?i)$([regex]::Escape($Brand))") { return $false }
    if ($NL -gt 0 -and $text -notmatch "(?<!\d)$NL(?!\d)") { return $false }
    return $true
}

$results = New-Object System.Collections.Generic.List[object]
if ($IncludeDownloads) { $ExtraRoots += @('C:\Users\Jarvis\Downloads\ТБМ Firmax', 'C:\Users\Jarvis\Downloads\База_всё в одном') }
$roots = @($Root) + $ExtraRoots | Where-Object { Test-Path -LiteralPath $_ }
$unrar = @('C:\Program Files\WinRAR\UnRAR.exe', 'C:\Program Files (x86)\WinRAR\UnRAR.exe') | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

# --- 1. files on disk
if ($Kind -in 'any', 'furniture', 'fragment', 'texture', 'archive' -or $Inventory) {
    foreach ($r in $roots) {
        Get-ChildItem -LiteralPath $r -Recurse -File -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -notmatch '\\(_claude|Autosave|Scripts|\.claude)\\' } |
            ForEach-Object {
                $k = Get-Kind $_.Extension.ToLower() $_.FullName
                if ($k -in 'other', 'config') { return }
                if ($Kind -ne 'any' -and $k -ne $Kind -and -not $Inventory) { return }
                $rel = $_.FullName.Substring($r.Length).TrimStart('\')
                if ($Inventory) {
                    $results.Add([pscustomobject]@{ Kind = $k; Brand = (Get-Brand $rel); Type = (Get-TypeTag $rel); Top = ($rel -split '\\')[0]; Path = $_.FullName })
                    return
                }
                if (-not (Test-Match $rel)) { return }
                $name = ''
                if ($Meta -and $k -in 'furniture', 'fragment' -and $_.Extension -ne '.frw') { $name = Get-HeaderName $_.FullName }
                $results.Add([pscustomobject]@{
                    Kind = $k; Brand = (Get-Brand $rel); Type = (Get-TypeTag $rel); Name = $(if ($name) { $name } else { $_.BaseName })
                    SizeKB = [math]::Round($_.Length / 1KB); Path = $_.FullName })
            }
    }
}

# --- 2. zip archives: table of contents only (no extraction)
if (($IncludeArchives -or $Kind -eq 'archive') -and -not $Inventory) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $cp866 = [Text.Encoding]::GetEncoding(866)
    foreach ($r in $roots) {
        Get-ChildItem -LiteralPath $r -Recurse -File -Filter *.zip | ForEach-Object {
            $zipPath = $_.FullName
            try {
                $z = [IO.Compression.ZipFile]::Open($zipPath, 'Read', $cp866)
                foreach ($e in $z.Entries) {
                    if (-not $e.Name) { continue }
                    $ext = [IO.Path]::GetExtension($e.Name).ToLower()
                    if ($ext -notin '.f3d', '.fr3d', '.frw', '.b3d', '.jpg', '.xml', '.dbf') { continue }
                    if (-not (Test-Match $e.FullName)) { continue }
                    $results.Add([pscustomobject]@{
                        Kind = 'zip:' + (Get-Kind $ext ''); Brand = (Get-Brand ($zipPath + '/' + $e.FullName)); Type = (Get-TypeTag $e.FullName)
                        Name = [IO.Path]::GetFileNameWithoutExtension($e.Name); SizeKB = [math]::Round($e.Length / 1KB); Path = "$zipPath :: $($e.FullName)" })
                }
                $z.Dispose()
            } catch {}
        }
        if ($unrar) {
            Get-ChildItem -LiteralPath $r -Recurse -File | Where-Object { $_.Extension -in '.rar', '.exe' -and $_.FullName -notmatch '\\(_claude|Scripts)\\' } | ForEach-Object {
                $arc = $_.FullName
                $names = & $unrar lb -p- $arc 2>$null      # bare list of entries, read-only
                foreach ($e in @($names)) {
                    if (-not $e) { continue }
                    $ext = [IO.Path]::GetExtension($e).ToLower()
                    if ($ext -notin '.f3d', '.fr3d', '.frw', '.b3d', '.jpg', '.xml', '.dbf') { continue }
                    if (-not (Test-Match $e)) { continue }
                    $results.Add([pscustomobject]@{
                        Kind = 'rar:' + (Get-Kind $ext ''); Brand = (Get-Brand ($arc + '\' + $e)); Type = (Get-TypeTag $e)
                        Name = [IO.Path]::GetFileNameWithoutExtension($e); SizeKB = 0; Path = "$arc :: $e" })
                }
            }
        }
    }
}

# --- 3. material catalogs (XML import files of manufacturers, TBM.xml)
if ($Kind -in 'any', 'material', 'texture' -and -not $Inventory -and $Query.Count -gt 0) {
    foreach ($r in $roots) {
        Get-ChildItem -LiteralPath $r -Recurse -File -Filter *.xml |
            Where-Object { $_.Length -lt 20MB -and $_.FullName -notmatch '\\_claude\\' } | ForEach-Object {
                $xf = $_.FullName
                try {
                    $x = [xml][IO.File]::ReadAllText($xf)
                    foreach ($mat in $x.Database.Materials.Material) {
                        $line = "$($mat.Article) | $($mat.Name) | $($mat.Group_Name) | $($mat.Texture)"
                        if (-not (Test-Match $line)) { continue }
                        $results.Add([pscustomobject]@{
                            Kind = 'material'; Brand = (Get-Brand ($xf + $mat.Group_Name)); Type = "$($mat.Unit_Measure) L$($mat.Length) W$($mat.Width) T$($mat.Thickness)"
                            Name = "$($mat.Article) $($mat.Name)"; SizeKB = 0; Path = "$xf :: $($mat.Group_Name) :: tex=$($mat.Texture)" })
                    }
                } catch {}
            }
    }
}

# --- output
if ($Inventory) {
    '=== by Kind'; $results | Group-Object Kind | Sort-Object Count -Descending | ForEach-Object { '{0,-10} {1}' -f $_.Name, $_.Count }
    '=== furniture/fragments by Brand'; $results | Where-Object { $_.Kind -in 'furniture', 'fragment' } | Group-Object Brand | Sort-Object Count -Descending | ForEach-Object { '{0,-18} {1}' -f $(if ($_.Name) { $_.Name } else { '(no brand)' }), $_.Count }
    '=== furniture/fragments by Type tag'
    $results | Where-Object { $_.Kind -in 'furniture', 'fragment' } | ForEach-Object { if ($_.Type) { $_.Type -split ',' } else { '(untyped)' } } | Group-Object | Sort-Object Count -Descending | ForEach-Object { '{0,-14} {1}' -f $_.Name, $_.Count }
    '=== textures by top folder'; $results | Where-Object Kind -eq 'texture' | ForEach-Object { if ($_.Path -match '\\Текстуры\\') { ($_.Path -replace '^.*\\Текстуры\\', '' -split '\\')[0] } else { '(inside furniture folders)' } } | Group-Object | Sort-Object Count -Descending | ForEach-Object { '{0,-40} {1}' -f $_.Name, $_.Count }
    return
}

$out = $results | Sort-Object @{ e = { switch -Wildcard ($_.Kind) { 'furniture' { 0 } 'fragment' { 1 } 'material' { 2 } 'texture' { 3 } default { 4 } } } }, Path | Select-Object -First $Top
if ($Json) { $out | ConvertTo-Json -Depth 3 }
else {
    "found=$($results.Count) shown=$(@($out).Count)"
    $out | Format-Table Kind, Brand, Type, SizeKB, Name, Path -AutoSize -Wrap | Out-String -Width 400
}
