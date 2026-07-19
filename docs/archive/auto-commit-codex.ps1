# auto-commit.ps1
param(
    [string]$Message = $null
)

Write-Host "=== Step 1: Staging all changes ===" -ForegroundColor Cyan
git add --all

$diff = git diff --cached

if ([string]::IsNullOrWhiteSpace($diff)) {
    Write-Host "No changes to commit" -ForegroundColor Yellow
    exit 0
}

# Helper to run codex with consistent noise filtering and error handling
function Invoke-Codex {
    param([string]$Prompt)
    
    $outputFile = [System.IO.Path]::GetTempFileName()
    $errFile = [System.IO.Path]::GetTempFileName()
    
    try {
        # Store final model response in file and keep stderr separate for clean parsing
        $null = codex exec --full-auto --skip-git-repo-check --output-last-message $outputFile "$Prompt" 2> $errFile | Out-String
        
        $stdout = if (Test-Path $outputFile) { Get-Content -Path $outputFile -Raw } else { "" }
        $stderr = if (Test-Path $errFile) { Get-Content -Path $errFile -Raw } else { "" }
        $combined = $stdout + "`n" + $stderr
        
        # Check for service limits or critical errors
        if ($combined -match "429" -or $combined -match "RESOURCE_EXHAUSTED" -or $combined -match "rate limit") {
            return $null # Signal failure
        }
        
        # Clean output by removing structural noise
        $lines = @($stdout -split "`n" | Where-Object { 
                $_ -notmatch "YOLO mode|Hook registry|Loaded cached credentials|Attempt \d+ failed" -and 
                !([string]::IsNullOrWhiteSpace($_)) 
            })
        
        return $lines
    }
    finally {
        if (Test-Path $outputFile) { Remove-Item $outputFile -Force }
        if (Test-Path $errFile) { Remove-Item $errFile -Force }
    }
}

# Generate commit message using git-commit skill
if ([string]::IsNullOrWhiteSpace($Message)) {
    Write-Host "`n=== Step 2: Generating commit message with git-commit skill ===" -ForegroundColor Cyan
    Write-Host "Analyzing changes (this may take 10-20 seconds)..." -ForegroundColor Gray
    
    $promptText = "Use git-commit skill to create commit message for staged changes. Return ONLY the commit message."
    $codexResult = Invoke-Codex -Prompt $promptText
    
    if ($null -eq $codexResult) {
        Write-Host "Codex service busy or rate limited. Using fallback message." -ForegroundColor Yellow
        $Message = "chore: update files"
    }
    else {
        # Try to find a conventional commit line
        foreach ($line in $codexResult) {
            $line = $line.Trim()
            if ($line -match '^(chore|feat|fix|docs|style|refactor|perf|test|build|ci)(\(.+?\))?:.+') {
                $Message = $line
                break
            }
        }
        
        # Fallback to first line if no conventional format found
        if ([string]::IsNullOrWhiteSpace($Message) -and $codexResult.Count -gt 0) {
            $Message = $codexResult[0].Trim()
        }
    }
    
    # Final cleanup and fallback
    if ([string]::IsNullOrWhiteSpace($Message)) { $Message = "chore: update files" }
    $Message = $Message -replace '^\*+\s*', '' -replace '^["''`]+|["''`]+$', ''
    $Message = $Message.Trim()
    
    Write-Host "Generated commit message: " -NoNewline -ForegroundColor Green
    Write-Host $Message -ForegroundColor White
}

# Commit with the message
Write-Host "`n=== Step 3: Committing changes ===" -ForegroundColor Cyan
git commit -m $Message --no-verify

if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Commit successful" -ForegroundColor Green

# Update changelog
Write-Host "`n=== Step 4: Updating Changelog.md with changelog-automation skill ===" -ForegroundColor Cyan
Write-Host "Updating changelog (this may take 10-20 seconds)..." -ForegroundColor Gray

$changelogPrompt = "Use changelog-automation skill to update Changelog.md for commit: $Message"
$changelogResult = Invoke-Codex -Prompt $changelogPrompt

if ($null -eq $changelogResult) {
    Write-Host "Service busy. Skipping changelog automation." -ForegroundColor Yellow
}
else {
    $cleanOutput = ($changelogResult -join "`n").Trim()
    if (![string]::IsNullOrWhiteSpace($cleanOutput)) {
        Write-Host $cleanOutput -ForegroundColor Gray
    }
}

# Stage and amend commit to include changelog changes
Write-Host "`n=== Step 5: Including Changelog.md in the commit ===" -ForegroundColor Cyan
Start-Sleep -Seconds 2
if (git status --porcelain | Select-String "Changelog.md") {
    git add Changelog.md
    git commit --amend --no-edit --no-verify
    Write-Host "Changelog.md updated and included in commit" -ForegroundColor Green
}
else {
    Write-Host "Note: Changelog.md was not modified" -ForegroundColor Yellow
}

Write-Host "`n"
Write-Host "================================" -ForegroundColor Green
Write-Host "COMPLETE!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host "Commit: $Message" -ForegroundColor White

# Show the final commit
Write-Host "`n=== Final Commit ===" -ForegroundColor Cyan
git log -1 --pretty=format:"%h - %s (%an, %ar)"
Write-Host "`n"

# === Step 6: Syncing with remote ===
Write-Host "=== Step 6: Syncing with remote ===" -ForegroundColor Cyan
Write-Host "Pulling from origin..." -ForegroundColor Gray
git pull origin

if ($LASTEXITCODE -eq 0) {
    Write-Host "Pull successful. Pushing to origin..." -ForegroundColor Gray
    git push origin
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Push successful" -ForegroundColor Green
    }
    else {
        Write-Host "Push failed!" -ForegroundColor Red
    }
}
else {
    Write-Host "Pull failed! Please resolve conflicts manually before pushing." -ForegroundColor Red
}

Write-Host "`n"
