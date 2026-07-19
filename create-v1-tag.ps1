param([string]$Tag = "v1.0.0")
$ErrorActionPreference = "Stop"
$status = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw "Not in a Git repository." }
if ($status) { throw "Working tree is not clean. Commit and push the release changes first." }
git checkout main
if ($LASTEXITCODE -ne 0) { throw "Could not checkout main." }
git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { throw "Could not fast-forward main." }
git tag -a $Tag -m "Retirement Strategy Planner $Tag"
if ($LASTEXITCODE -ne 0) { throw "Could not create tag. It may already exist." }
git push origin $Tag
if ($LASTEXITCODE -ne 0) { throw "Could not push tag." }
Write-Host "$Tag created and pushed successfully." -ForegroundColor Green
