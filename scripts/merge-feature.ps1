param (
    [string]$BranchName = "",
    [switch]$Force
)

# Colors for friendly output
function Write-Step {
    param([string]$Text)
    Write-Host "`n>> $Text" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "[OK] $Text" -ForegroundColor Green
}

function Write-Failure {
    param([string]$Text)
    Write-Host "[ERROR] $Text" -ForegroundColor Red
    exit 1
}

# 1. Determine the target branch to merge
$currentBranch = (git branch --show-current).Trim()

if (-not $BranchName) {
    $BranchName = $currentBranch
}

if (-not $BranchName) {
    Write-Failure "Could not determine branch name. Please specify: .\scripts\merge-feature.ps1 -BranchName <name>"
}

if ($BranchName -eq "development" -or $BranchName -eq "main" -or $BranchName -eq "production") {
    Write-Failure "You are currently on protected branch '$BranchName'. Switch to your feature branch or specify a feature branch name."
}

# 2. Check for uncommitted changes
$status = (git status --porcelain)
if ($status) {
    Write-Failure "Working directory has uncommitted changes. Please commit or stash them before merging:`n$status"
}

# 3. Confirmation prompt
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host " Automated Feature Branch Merge into 'development'" -ForegroundColor Yellow
Write-Host "==================================================" -ForegroundColor Yellow
Write-Host "Feature Branch to merge: " -NoNewline
Write-Host "$BranchName" -ForegroundColor Cyan
Write-Host "Target branch:           " -NoNewline
Write-Host "development" -ForegroundColor Green
Write-Host "--------------------------------------------------" -ForegroundColor Yellow

if (-not $Force) {
    $confirm = Read-Host "Proceed with merging and pushing to remote development? (y/N)"
    if ($confirm -ne 'y' -and $confirm -ne 'Y') {
        Write-Host "Merge aborted by user." -ForegroundColor Yellow
        exit 0
    }
}

# 4. Switch to development
Write-Step "Checking out 'development' branch..."
git checkout development
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Failed to checkout development branch."
}
Write-Success "On 'development' branch."

# 5. Pull latest development
Write-Step "Pulling latest changes from remote 'development'..."
git pull origin development
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Failed to pull from origin development."
}
Write-Success "Development is up to date."

# 6. Merge feature branch
Write-Step "Merging '$BranchName' into 'development'..."
git merge $BranchName
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Merge conflict or error encountered while merging '$BranchName'. Please resolve conflicts manually."
}
Write-Success "Merged '$BranchName' successfully."

# 7. Push to remote development
Write-Step "Pushing updated 'development' to remote origin..."
git push origin development
if ($LASTEXITCODE -ne 0) {
    Write-Failure "Failed to push development branch to origin."
}
Write-Success "Pushed to origin development."

# 8. Delete local feature branch
Write-Step "Deleting local feature branch '$BranchName'..."
git branch -d $BranchName
if ($LASTEXITCODE -eq 0) {
    Write-Success "Deleted local branch '$BranchName'."
} else {
    Write-Host "[WARN] Could not safely delete '$BranchName' (it may require -D if not fully merged upstream)." -ForegroundColor Yellow
}

# 9. Archive commit message (git-workflow requirement)
Write-Step "Archiving active commit message in docs/commit-messages/..."
$commitMsgPath = "docs/commit-messages/commit-message.md"
if (Test-Path $commitMsgPath) {
    $content = Get-Content $commitMsgPath -Raw
    if ($content -and $content.Trim()) {
        $today = Get-Date -Format "yyyy-MM-dd"
        $existing = (Get-ChildItem -Path "docs/commit-messages/commit-message(pushed-$today*).md" -ErrorAction SilentlyContinue | Measure-Object).Count
        $batch = $existing + 1
        $archiveName = "commit-message(pushed-$today-batch$batch).md"
        $archivePath = "docs/commit-messages/$archiveName"
        
        Rename-Item -Path $commitMsgPath -NewName $archiveName -Force
        
        # Initialize fresh template
        $template = @"
<type>(<scope>): <concise summary of changes under 70 characters>

### Added
- [Component/Module] Description of newly added functionality or endpoint

### Changed / Updated
- [Component/Module] Description of modifications, enhancements, or refactored logic

### Fixed
- [Component/Module] Description of bug fix or edge case resolved

### Testing & Verification
- [API / Smoke Test] Verified endpoint/functionality via Thunder Client / Postman (Status: 200 OK)
- [Edge Cases] Verified handling of invalid inputs and failure scenarios
"@
        Set-Content -Path $commitMsgPath -Value $template
        
        # Stage and commit the archive tracking
        git add docs/commit-messages/
        git commit -m "docs(workflow): archive pushed commit notes batch $batch"
        git push origin development
        Write-Success "Archived commit message to '$archiveName' and pushed changelog."
    } else {
        Write-Host "commit-message.md was empty; skipping archive." -ForegroundColor Yellow
    }
} else {
    Write-Host "docs/commit-messages/commit-message.md not found; skipping archive." -ForegroundColor Yellow
}

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host " SUCCESS: Feature '$BranchName' fully merged!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host "You are now on 'development' ready for your next task." -ForegroundColor White
