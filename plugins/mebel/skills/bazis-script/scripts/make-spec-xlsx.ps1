# make-spec-xlsx.ps1 - build an Excel specification (.xlsx) from _claude\dump.json (BZ.dump output)
# Sheets: Спецификация (grouped, area formulas, totals), Детали (every panel), Материалы (sheet usage estimate)
# No Excel/Python needed: writes SpreadsheetML parts into a zip. Saved with BOM (Cyrillic literals).
param(
    [string]$Dump = 'C:\Users\Jarvis\Documents\Bazis11\_claude\dump.json',
    [string]$Out = ''
)
$ErrorActionPreference = 'Stop'
$inv = [Globalization.CultureInfo]::InvariantCulture
$utf8 = New-Object Text.UTF8Encoding($false)

$d = [IO.File]::ReadAllText($Dump, $utf8) | ConvertFrom-Json
$dumpTime = (Get-Item $Dump).LastWriteTime
$model = [IO.Path]::GetFileNameWithoutExtension([string]$d.file)
if (-not $model) { $model = 'Модель' }
if (-not $Out) { $Out = Join-Path 'C:\Users\Jarvis\Documents\Bazis11' ($model + ' - спецификация.xlsx') }

function X([string]$s) { [Security.SecurityElement]::Escape($s) }
function N($v) { ([double]$v).ToString('0.######', $inv) }
function Col([int]$i) { $s = ''; while ($i -gt 0) { $m = ($i - 1) % 26; $s = [string][char](65 + $m) + $s; $i = [math]::Floor(($i - 1) / 26) }; $s }
function CS($r, $c, $text, $st) { '<c r="' + (Col $c) + $r + '" t="inlineStr" s="' + $st + '"><is><t xml:space="preserve">' + (X ([string]$text)) + '</t></is></c>' }
function CN($r, $c, $num, $st) { '<c r="' + (Col $c) + $r + '" s="' + $st + '"><v>' + (N $num) + '</v></c>' }
function CF($r, $c, $f, $num, $st) { '<c r="' + (Col $c) + $r + '" s="' + $st + '"><f>' + (X $f) + '</f><v>' + (N $num) + '</v></c>' }
function RowX($r, $cells, $ht) { $h = ''; if ($ht) { $h = ' ht="' + $ht + '" customHeight="1"' }; '<row r="' + $r + '"' + $h + '>' + ($cells -join '') + '</row>' }

function SplitMat([string]$s) {
    $s = $s.Trim()
    if ($s -match "[`r`n]") { $p = $s -split "[`r`n]+", 2; return @($p[0].Trim(), $p[1].Trim()) }
    for ($i = 4; $i -lt $s.Length - 4; $i++) {
        $k = [math]::Min(6, $i)
        if ($s.Substring($i).StartsWith($s.Substring(0, $k))) { return @($s.Substring(0, $i).Trim(), $s.Substring($i).Trim()) }
    }
    return @($s, '')
}

$roleRu = @{ side_left = 'Боковина левая'; side_right = 'Боковина правая'; partition = 'Стойка, перегородка'; top = 'Крышка'; bottom = 'Дно'; shelf = 'Полка'; back = 'Задняя стенка'; plinth = 'Цоколь'; facade = 'Фасад'; filler = 'Заглушка'; other = 'Прочее' }
$roleOrder = @('side_left', 'side_right', 'partition', 'top', 'bottom', 'shelf', 'back', 'plinth', 'facade', 'filler', 'other')

# ---------- parts ----------
$parts = @()
$idx = 0
foreach ($o in $d.objects) {
    if ($o.list -or $null -eq $o.cw) { continue }
    $idx++
    $m = SplitMat ([string]$o.mat)
    $cw = [double]$o.cw; $ch = [double]$o.ch
    $name = (([string]$o.name) -replace '\s+', ' ').Trim()
    $butts = @($o.butts | Where-Object { $null -ne $_ }).Count
    $role = 'other'; if ($o.role) { $role = [string]$o.role }
    $ro = [array]::IndexOf($roleOrder, $role); if ($ro -lt 0) { $ro = 99 }
    $parts += [pscustomobject]@{
        n = $idx; name = $name; key = $name.ToLower(); role = $role; ro = $ro
        L = [math]::Max($cw, $ch); W = [math]::Min($cw, $ch); T = [double]$o.t
        mat = $m[0]; code = $m[1]; art = [string]$o.art; butts = $butts
        x = [double]$o.min[0]; y = [double]$o.min[1]; z = [double]$o.min[2]
    }
}
$fastenerBlocks = @($d.objects | Where-Object { $_.list -and $_.fastener }).Count

# ---------- grouped specification ----------
$groups = @()
foreach ($g in ($parts | Group-Object { '{0}|{1}|{2}|{3}|{4}|{5}' -f $_.key, $_.mat, $_.T, $_.L, $_.W, $_.butts })) {
    $f = @($g.Group)
    $cand = $f | Where-Object { $_.name -cmatch '-\s*[А-ЯЁA-Z]' } | Select-Object -First 1
    if (-not $cand) { $cand = $f[0] }
    $roles = ($f | ForEach-Object { $_.role } | Sort-Object -Unique | ForEach-Object { $roleRu[$_] }) -join ', '
    $groups += [pscustomobject]@{
        name = $cand.name; mat = $f[0].mat; code = $f[0].code; T = $f[0].T; L = $f[0].L; W = $f[0].W
        qty = $f.Count; butts = $f[0].butts; roles = $roles; ro = ($f | Measure-Object ro -Minimum).Minimum
    }
}
$groups = @($groups | Sort-Object ro, name, @{ e = { $_.L }; Descending = $true }, @{ e = { $_.W }; Descending = $true })

# ---------- sheet 1: Спецификация ----------
$rows = @()
$b = $d.panelsBounds.size
$rows += RowX 1 @((CS 1 1 ('Спецификация деталей: ' + $model) 6)) 22
$rows += RowX 2 @((CS 2 1 ('Габарит по панелям: {0} x {1} x {2} мм. Деталей: {3}. Данные модели на {4}.' -f (N $b[0]), (N $b[1]), (N $b[2]), $parts.Count, $dumpTime.ToString('dd.MM.yyyy HH:mm')) 0))
$hdr = @('№', 'Наименование', 'Материал', 'Толщина, мм', 'Длина, мм', 'Ширина, мм', 'Кол-во, шт', 'Площадь 1 шт, м²', 'Площадь всего, м²', 'Кромка', 'Назначение')
$cells = @(); for ($i = 0; $i -lt $hdr.Count; $i++) { $cells += CS 4 ($i + 1) $hdr[$i] 1 }
$rows += RowX 4 $cells 32
$r = 5; $first = 5; $sumQty = 0; $sumArea = 0.0
foreach ($g in $groups) {
    $a1 = $g.L * $g.W / 1000000; $at = $a1 * $g.qty
    $sumQty += $g.qty; $sumArea += $at
    $edge = 'нет'; if ($g.butts -gt 0) { $edge = [string]$g.butts + ' торц.' }
    $rows += RowX $r @(
        (CN $r 1 ($r - $first + 1) 3), (CS $r 2 $g.name 2), (CS $r 3 $g.mat 2), (CN $r 4 $g.T 3), (CN $r 5 $g.L 3), (CN $r 6 $g.W 3),
        (CN $r 7 $g.qty 3), (CF $r 8 ("E$r*F$r/1000000") $a1 4), (CF $r 9 ("H$r*G$r") $at 4), (CS $r 10 $edge 2), (CS $r 11 $g.roles 2)
    )
    $r++
}
$last = $r - 1
$rows += RowX $r @((CS $r 2 'Итого' 7), (CF $r 7 ("SUM(G${first}:G$last)") $sumQty 8), (CF $r 9 ("SUM(I${first}:I$last)") $sumArea 5))
$sheet1 = @{
    rows = $rows; ySplit = 4; filter = "A4:K$last"
    cols = @(@(1, 5), @(2, 30), @(3, 24), @(4, 11), @(5, 11), @(6, 11), @(7, 11), @(8, 13), @(9, 13), @(10, 10), @(11, 26))
}

# ---------- sheet 2: Детали ----------
$rows = @()
$hdr = @('№', 'Наименование', 'Назначение', 'Длина, мм', 'Ширина, мм', 'Толщина, мм', 'Материал', 'Поз.', 'X мин, мм', 'Y мин, мм', 'Z мин, мм')
$cells = @(); for ($i = 0; $i -lt $hdr.Count; $i++) { $cells += CS 1 ($i + 1) $hdr[$i] 1 }
$rows += RowX 1 $cells 32
$r = 2
foreach ($p in ($parts | Sort-Object ro, y, x)) {
    $rows += RowX $r @(
        (CN $r 1 ($r - 1) 3), (CS $r 2 $p.name 2), (CS $r 3 $roleRu[$p.role] 2), (CN $r 4 $p.L 3), (CN $r 5 $p.W 3), (CN $r 6 $p.T 3),
        (CS $r 7 $p.mat 2), (CS $r 8 $p.art 2), (CN $r 9 $p.x 3), (CN $r 10 $p.y 3), (CN $r 11 $p.z 3)
    )
    $r++
}
$sheet2 = @{
    rows = $rows; ySplit = 1; filter = ('A1:K' + ($r - 1))
    cols = @(@(1, 5), @(2, 30), @(3, 20), @(4, 11), @(5, 11), @(6, 11), @(7, 24), @(8, 7), @(9, 11), @(10, 11), @(11, 11))
}

# ---------- sheet 3: Материалы ----------
$rows = @()
$hdr = @('Материал', 'Плита', 'Толщина, мм', 'Деталей, шт', 'Площадь деталей, м²', 'Площадь плиты, м²', 'Плит без отходов', 'Плит с запасом 15%')
$cells = @(); for ($i = 0; $i -lt $hdr.Count; $i++) { $cells += CS 1 ($i + 1) $hdr[$i] 1 }
$rows += RowX 1 $cells 32
$r = 2
foreach ($mg in ($parts | Group-Object { '{0}|{1}|{2}' -f $_.mat, $_.code, $_.T })) {
    $f = @($mg.Group); $area = 0.0; foreach ($p in $f) { $area += $p.L * $p.W / 1000000 }
    $sheetArea = 0.0
    if ($f[0].code -match '(\d{3,4})\s*[\*xXхХ]\s*(\d{3,4})') { $sheetArea = [double]$Matches[1] * [double]$Matches[2] / 1000000 }
    $cells = @((CS $r 1 $f[0].mat 2), (CS $r 2 $f[0].code 2), (CN $r 3 $f[0].T 3), (CN $r 4 $f.Count 3),
        (CF $r 5 ("SUMIFS('Спецификация'!I:I,'Спецификация'!C:C,A$r,'Спецификация'!D:D,C$r)") $area 4))
    if ($sheetArea -gt 0) {
        $cells += CN $r 6 $sheetArea 4
        $cells += CF $r 7 ("E$r/F$r") ($area / $sheetArea) 9
        $cells += CF $r 8 ("ROUNDUP(E$r*1.15/F$r,0)") ([math]::Ceiling($area * 1.15 / $sheetArea)) 3
    }
    $rows += RowX $r $cells
    $r++
}
$r++
$notes = @()
if (@($parts | Where-Object { $_.butts -gt 0 }).Count -eq 0) { $notes += 'Кромка в модели не назначена ни на одну деталь.' }
if ($fastenerBlocks -eq 0) { $notes += 'Фурнитуры и крепежа в модели нет.' }
$notes += 'Расчёт плит примерный: без карты раскроя, пропила и направления текстуры.'
$notes += 'Одинаковые детали с разным регистром или лишними пробелами в имени объединены в одну строку.'
$notes += ('Источник: ' + [string]$d.file + ', дамп от ' + $dumpTime.ToString('dd.MM.yyyy HH:mm') + '.')
foreach ($t in $notes) { $rows += RowX $r @((CS $r 1 $t 0)); $r++ }
$sheet3 = @{
    rows = $rows; ySplit = 1; filter = $null
    cols = @(@(1, 26), @(2, 26), @(3, 11), @(4, 11), @(5, 15), @(6, 14), @(7, 13), @(8, 14))
}

# ---------- package ----------
function SheetXml($s, [bool]$selected) {
    $sel = ''; if ($selected) { $sel = ' tabSelected="1"' }
    $cols = ($s.cols | ForEach-Object { '<col min="{0}" max="{0}" width="{1}" customWidth="1"/>' -f $_[0], ([double]$_[1]).ToString($inv) }) -join ''
    $pane = '<pane ySplit="' + $s.ySplit + '" topLeftCell="A' + ($s.ySplit + 1) + '" activePane="bottomLeft" state="frozen"/>'
    $flt = ''; if ($s.filter) { $flt = '<autoFilter ref="' + $s.filter + '"/>' }
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetViews><sheetView workbookViewId="0"' + $sel + '>' + $pane + '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/><cols>' + $cols + '</cols>' +
    '<sheetData>' + ($s.rows -join '') + '</sheetData>' + $flt +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape"/>' +
    '</worksheet>'
}

$names = @('Спецификация', 'Детали', 'Материалы')
$ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
    '</Types>'
$rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
    '</Relationships>'
$core = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<dc:title>' + (X ('Спецификация: ' + $model)) + '</dc:title><dc:creator>Claude</dc:creator>' +
    '<dcterms:created xsi:type="dcterms:W3CDTF">' + (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') + '</dcterms:created></cp:coreProperties>'
$wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
    '<sheet name="' + (X $names[0]) + '" sheetId="1" r:id="rId1"/><sheet name="' + (X $names[1]) + '" sheetId="2" r:id="rId2"/><sheet name="' + (X $names[2]) + '" sheetId="3" r:id="rId3"/>' +
    '</sheets>'
if ($sheet1.filter) { $wb += '' }
$wb += '<definedNames>' +
    '<definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">' + (X ("'Спецификация'!`$A`$4:`$K`$$last")) + '</definedName>' +
    '<definedName name="_xlnm._FilterDatabase" localSheetId="1" hidden="1">' + (X ("'Детали'!`$A`$1:`$K`$" + ($parts.Count + 1))) + '</definedName>' +
    '</definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'
$wbRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>' +
    '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
    '</Relationships>'
$styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="0.000"/><numFmt numFmtId="165" formatCode="0.##"/><numFmt numFmtId="166" formatCode="0.00"/></numFmts>' +
    '<fonts count="3"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="14"/><name val="Calibri"/><family val="2"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD9E1F2"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="10">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="165" fontId="1" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'

$parts2 = [ordered]@{
    '[Content_Types].xml' = $ct
    '_rels/.rels' = $rels
    'docProps/core.xml' = $core
    'xl/workbook.xml' = $wb
    'xl/_rels/workbook.xml.rels' = $wbRels
    'xl/styles.xml' = $styles
    'xl/worksheets/sheet1.xml' = (SheetXml $sheet1 $true)
    'xl/worksheets/sheet2.xml' = (SheetXml $sheet2 $false)
    'xl/worksheets/sheet3.xml' = (SheetXml $sheet3 $false)
}

# well-formedness check before writing
foreach ($k in $parts2.Keys) { try { [void]([xml]$parts2[$k]) } catch { throw "XML error in ${k}: $_" } }

Add-Type -AssemblyName System.IO.Compression
$tmp = $Out + '.tmp'
if (Test-Path -LiteralPath $tmp) { [IO.File]::Delete($tmp) }
$fs = [IO.File]::Open($tmp, [IO.FileMode]::CreateNew)
$zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Create)
foreach ($k in $parts2.Keys) {
    $e = $zip.CreateEntry($k, [IO.Compression.CompressionLevel]::Optimal)
    $w = New-Object IO.StreamWriter($e.Open(), $utf8)
    $w.Write($parts2[$k]); $w.Dispose()
}
$zip.Dispose(); $fs.Dispose()
if (Test-Path -LiteralPath $Out) { [IO.File]::Delete($Out) }
[IO.File]::Move($tmp, $Out)

# read back and re-validate
$fs = [IO.File]::OpenRead($Out)
$zip = New-Object IO.Compression.ZipArchive($fs, [IO.Compression.ZipArchiveMode]::Read)
$okParts = 0
foreach ($e in $zip.Entries) { $sr = New-Object IO.StreamReader($e.Open(), $utf8); [void]([xml]$sr.ReadToEnd()); $sr.Dispose(); $okParts++ }
$zip.Dispose(); $fs.Dispose()

"OUT=$Out"
"parts_ok=$okParts groups=$($groups.Count) panels=$($parts.Count) qty_total=$sumQty area_total_m2=" + $sumArea.ToString('0.000', $inv)
foreach ($g in $groups) { '{0,-28} {1,7} x {2,-6} x{3,3}  qty={4}  roles={5}' -f $g.name, (N $g.L), (N $g.W), (N $g.T), $g.qty, $g.roles }
'materials: ' + (($parts | Group-Object mat | ForEach-Object { $_.Name + ' [' + $_.Group[0].code + '] n=' + $_.Count }) -join '; ')
