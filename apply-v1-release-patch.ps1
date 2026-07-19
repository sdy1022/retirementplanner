param(
  [string]$RepoPath = "."
)
$ErrorActionPreference = "Stop"
$patchRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path $RepoPath).Path

Write-Host "Applying v1.0 release patch to $repo" -ForegroundColor Cyan
Get-ChildItem $patchRoot -Force | Where-Object { $_.Name -notin @("apply-v1-release-patch.ps1", "create-v1-tag.ps1") } | ForEach-Object {
  Copy-Item $_.FullName $repo -Recurse -Force
}

$obsolete = @(
  "auto-commit-codex.ps1",
  "gitcodex.bat",
  "auto-optimize-roth-conversion-changes.md",
  "post-rmd-roth-conversion-plan.md",
  "DesignBindSpots.md",
  "Buy_Borrow_Die VS Roth Conversion.txt",
  "manual.txt",
  "test-sim.js",
  "toolinfo.md",
  "roth_tranche_planner.html"
)
foreach ($name in $obsolete) {
  $path = Join-Path $repo $name
  if (Test-Path $path) { Remove-Item $path -Force }
}

Write-Host "Patch applied. Run CI before committing:" -ForegroundColor Green
Write-Host "npm ci"
Write-Host "npm run check:conflicts"
Write-Host "npx tsc -p tsconfig.app.json --noEmit"
Write-Host "npm run test:ci"
Write-Host "npm run test:golden"
Write-Host "npm run build"
