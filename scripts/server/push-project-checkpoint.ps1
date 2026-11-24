<#
.SYNOPSIS
  Creates a selective Git checkpoint for one video project and pushes it.
.DESCRIPTION
  Always stages key creative/configuration documents and small metadata outputs.
  Preview stage includes preview MP4s for review. Final stage includes final MP4s
  after owner approval and successful QC. MP4s are tracked using Git LFS.
  This script never stages the entire repository or arbitrary asset folders.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')][string]$Project,
  [Parameter(Mandatory = $true)][ValidateSet('Source','Preview','Final')][string]$Stage,
  [string]$CommitMessage
)
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Push-Location $repoRoot
try {
  $branch = (& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($branch)) { throw 'Unable to determine current Git branch.' }
  if ((& git status --porcelain | Out-String).Trim()) {
    Write-Warning 'Pre-existing working-tree changes exist. Only selected project paths are staged; review the staged diff before committing.'
  }
  if ($Stage -in @('Preview','Final')) {
    & git lfs version | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Git LFS is required. Install Git LFS and initialize it before pushing MP4s.' }
    & git lfs install
    if ($LASTEXITCODE -ne 0) { throw 'Git LFS initialization failed.' }
  }
  $projectPath = "projects/$Project"
  if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $projectPath))) { throw "Project folder not found: $projectPath" }
  $patterns = @(
    "$projectPath/project.json",
    "$projectPath/brief.md",
    "$projectPath/research.md",
    "$projectPath/script.md",
    "$projectPath/storyboard.json",
    "$projectPath/assets.json",
    "$projectPath/transcript.json",
    "$projectPath/youtube.json",
    "$projectPath/output/*.srt",
    "$projectPath/output/*.vtt",
    "$projectPath/output/*-credits.txt",
    "$projectPath/output/*-upload.md",
    "$projectPath/output/*-youtube.json"
  )
  if ($Stage -eq 'Preview') { $patterns += "$projectPath/previews/*.mp4" }
  if ($Stage -eq 'Final') {
    $patterns += "$projectPath/previews/*.mp4"
    $patterns += "$projectPath/output/*.mp4"
  }
  $staged = 0
  foreach ($pattern in $patterns) {
    $files = @(Get-ChildItem -Path (Join-Path $repoRoot $pattern) -File -ErrorAction SilentlyContinue)
    foreach ($file in $files) {
      $relative = [IO.Path]::GetRelativePath($repoRoot, $file.FullName).Replace('\','/')
      & git add -- $relative
      if ($LASTEXITCODE -ne 0) { throw "git add failed for $relative" }
      $staged++
    }
  }
  if ($staged -eq 0) { throw "No files matched the selected $Stage checkpoint. Check project ID and generated files." }
  Write-Host "Selected $staged file(s) for project '$Project' at stage '$Stage'."
  & git diff --cached --stat
  if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged changes.' }
  $stagedNames = (& git diff --cached --name-only) -join [Environment]::NewLine
  if ($Stage -ne 'Final' -and $stagedNames -match 'projects/.+/output/.+\.mp4$') {
    throw 'A final output MP4 was staged unexpectedly; refusing to commit before Final stage.'
  }
  if ($Stage -eq 'Final' -and $stagedNames -notmatch 'projects/.+/output/.+\.mp4$') {
    throw 'No final output MP4 was staged. Render and QC the final file first.'
  }
  if (-not $CommitMessage) { $CommitMessage = "Checkpoint $Project ($Stage)" }
  & git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Host 'No staged changes to commit.'
    exit 0
  }
  & git commit -m $CommitMessage
  if ($LASTEXITCODE -ne 0) { throw 'Git commit failed.' }
  & git push -u origin $branch
  if ($LASTEXITCODE -ne 0) { throw "Git push failed. Commit remains local on branch '$branch'; resolve the push error and retry." }
  Write-Host "Checkpoint pushed to origin/$branch."
}
finally {
  Pop-Location
}
