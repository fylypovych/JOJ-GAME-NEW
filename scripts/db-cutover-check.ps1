param(
  [string]$DatabaseUrl = '',
  [string]$PsqlPath = 'psql',
  [switch]$SkipJsonCompare
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-DotEnvValue {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Key
  )
  if (-not (Test-Path -LiteralPath $Path)) { return $null }
  $line = Get-Content -LiteralPath $Path | Where-Object { $_ -match "^\s*$([regex]::Escape($Key))\s*=" } | Select-Object -First 1
  if (-not $line) { return $null }
  $value = ($line -replace "^\s*$([regex]::Escape($Key))\s*=\s*", '').Trim()
  if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
    return $value.Substring(1, $value.Length - 2)
  }
  if ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Invoke-PsqlScalar {
  param(
    [Parameter(Mandatory = $true)][string]$Sql
  )
  $output = & $PsqlPath --no-psqlrc --set ON_ERROR_STOP=1 --tuples-only --no-align --dbname $DatabaseUrl --command $Sql 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "psql failed for query [$Sql]: $($output -join ' ')"
  }
  $text = ($output | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ -ne '' } | Select-Object -First 1)
  if ($null -eq $text) { return '' }
  return $text
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$dotEnvPath = Join-Path $repoRoot '.env'

if (-not $DatabaseUrl) {
  $DatabaseUrl = $env:DATABASE_URL
}
if (-not $DatabaseUrl) {
  $DatabaseUrl = Read-DotEnvValue -Path $dotEnvPath -Key 'DATABASE_URL'
}
if (-not $DatabaseUrl) {
  throw 'DATABASE_URL is required. Pass -DatabaseUrl or set DATABASE_URL in env/.env.'
}

$storageMode = $env:STORAGE_MODE
if (-not $storageMode) {
  $storageMode = Read-DotEnvValue -Path $dotEnvPath -Key 'STORAGE_MODE'
}
if ($storageMode -and $storageMode.ToLowerInvariant() -notin @('postgres', 'db')) {
  Write-Warning "STORAGE_MODE is '$storageMode' (expected postgres/db for cutover checks)."
}

$psqlCmd = Get-Command $PsqlPath -ErrorAction SilentlyContinue
if (-not $psqlCmd) {
  throw "psql command not found: $PsqlPath"
}

$activeTemplateCount = [int](Invoke-PsqlScalar "SELECT count(*) FROM deck_templates WHERE is_active = true;")
$activeRankSetCount = [int](Invoke-PsqlScalar "SELECT count(*) FROM rank_sets WHERE is_active = true;")

$templateKey = Invoke-PsqlScalar "SELECT template_key FROM deck_templates WHERE is_active = true ORDER BY updated_at DESC LIMIT 1;"
$rankSetKey = Invoke-PsqlScalar "SELECT rank_set_key FROM rank_sets WHERE is_active = true ORDER BY updated_at DESC LIMIT 1;"

$dbDeckCount = [int](Invoke-PsqlScalar @"
SELECT count(*)
FROM deck_template_entries e
JOIN deck_templates t ON t.id = e.deck_template_id
WHERE t.is_active = true AND e.deck_target = 'deck';
"@)
$dbLegendaryCount = [int](Invoke-PsqlScalar @"
SELECT count(*)
FROM deck_template_entries e
JOIN deck_templates t ON t.id = e.deck_template_id
WHERE t.is_active = true AND e.deck_target = 'legendaryDeck';
"@)
$dbRankTrackCount = [int](Invoke-PsqlScalar @"
SELECT count(*)
FROM deck_template_entries e
JOIN deck_templates t ON t.id = e.deck_template_id
WHERE t.is_active = true AND e.deck_target = 'rankTrack';
"@)
$dbRankDefinitionsCount = [int](Invoke-PsqlScalar @"
SELECT count(*)
FROM rank_definitions d
JOIN rank_sets r ON r.id = d.rank_set_id
WHERE r.is_active = true;
"@)

$errors = New-Object System.Collections.Generic.List[string]

if ($activeTemplateCount -ne 1) {
  $errors.Add("Expected exactly 1 active deck template, got $activeTemplateCount.")
}
if ($activeRankSetCount -ne 1) {
  $errors.Add("Expected exactly 1 active rank set, got $activeRankSetCount.")
}

$expectedDeckCount = $null
$expectedLegendaryCount = $null
$expectedRankTrackCount = $null
$expectedRankDefinitionsCount = $null

if (-not $SkipJsonCompare) {
  $deckPath = Join-Path $repoRoot 'database\shared-deck-template.json'
  $ranksPath = Join-Path $repoRoot 'database\shared-ranks.json'
  if (-not (Test-Path -LiteralPath $deckPath)) { $errors.Add("Missing file: $deckPath") }
  if (-not (Test-Path -LiteralPath $ranksPath)) { $errors.Add("Missing file: $ranksPath") }

  if ((Test-Path -LiteralPath $deckPath) -and (Test-Path -LiteralPath $ranksPath)) {
    $deckJson = Get-Content -LiteralPath $deckPath -Raw | ConvertFrom-Json
    $ranksJson = Get-Content -LiteralPath $ranksPath -Raw | ConvertFrom-Json

    $expectedDeckCount = if ($deckJson.deck) { @($deckJson.deck).Count } elseif ($deckJson.deckIds) { @($deckJson.deckIds).Count } else { 0 }
    $expectedLegendaryCount = if ($deckJson.legendaryDeck) { @($deckJson.legendaryDeck).Count } elseif ($deckJson.legendaryDeckIds) { @($deckJson.legendaryDeckIds).Count } else { 0 }
    $expectedRankTrackCount = if ($deckJson.rankTrack) { @($deckJson.rankTrack).Count } elseif ($deckJson.rankTrackIds) { @($deckJson.rankTrackIds).Count } else { 0 }
    $expectedRankDefinitionsCount = @($ranksJson).Count

    if ($dbDeckCount -ne $expectedDeckCount) {
      $errors.Add("deck count mismatch: db=$dbDeckCount json=$expectedDeckCount")
    }
    if ($dbLegendaryCount -ne $expectedLegendaryCount) {
      $errors.Add("legendaryDeck count mismatch: db=$dbLegendaryCount json=$expectedLegendaryCount")
    }
    if ($dbRankTrackCount -ne $expectedRankTrackCount) {
      $errors.Add("rankTrack count mismatch: db=$dbRankTrackCount json=$expectedRankTrackCount")
    }
    if ($dbRankDefinitionsCount -ne $expectedRankDefinitionsCount) {
      $errors.Add("rank definitions mismatch: db=$dbRankDefinitionsCount json=$expectedRankDefinitionsCount")
    }
  }
}

Write-Output "DB cutover check:"
Write-Output "  active template key: $templateKey"
Write-Output "  active rank set key: $rankSetKey"
Write-Output "  db entries: deck=$dbDeckCount legendaryDeck=$dbLegendaryCount rankTrack=$dbRankTrackCount rankDefinitions=$dbRankDefinitionsCount"
if (-not $SkipJsonCompare) {
  Write-Output "  json expected: deck=$expectedDeckCount legendaryDeck=$expectedLegendaryCount rankTrack=$expectedRankTrackCount rankDefinitions=$expectedRankDefinitionsCount"
}

if ($errors.Count -gt 0) {
  Write-Error ("DB cutover check failed:`n- " + ($errors -join "`n- "))
  exit 1
}

Write-Output 'DB cutover check passed.'
exit 0
