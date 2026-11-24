<#
.SYNOPSIS
  Pulls the COMPLETE project folder from the render VPS to this Windows checkout.
.DESCRIPTION
  Downloads projects/<id>, including documents, manifests, assets, audio, previews,
  outputs and hidden files. Verifies the archive with SHA-256 before extraction.
  Existing local projects are never replaced unless -Force is supplied; then the
  old folder is moved to a timestamped backup.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')][string]$Project,
  [string]$RemoteDir = 'video-project',
  [switch]$Force
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
foreach ($tool in @($ssh, $scp, $tar)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "Required Windows tool not found: $tool" }
}
if ($RemoteDir -notmatch '^[a-zA-Z0-9._/-]+$' -or $RemoteDir.Contains('..')) {
  throw 'RemoteDir may contain only letters, numbers, dots, underscores, hyphens and slashes; ".." is not allowed.'
}
$destination = Join-Path (Join-Path $root 'projects') $Project
$stageRoot = Join-Path $env:TEMP ("video-project-pull-" + [guid]::NewGuid().ToString('N'))
$archiveName = "video-project-$Project-$([guid]::NewGuid().ToString('N')).tar.gz"
$remoteArchive = "/tmp/$archiveName"
$localArchive = Join-Path $stageRoot $archiveName
New-Item -ItemType Directory -Force -Path $stageRoot | Out-Null
try {
  $remoteCommand = "set -euo pipefail; cd ~/$RemoteDir; test -d 'projects/$Project'; tar -czf '$remoteArchive' -C projects '$Project'; sha256sum '$remoteArchive' | cut -d ' ' -f1"
  Write-Host "Creating full archive on $Server ..."
  $remoteHash = (& $ssh $Server $remoteCommand | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or $remoteHash -notmatch '^[a-fA-F0-9]{64}$') {
    throw 'Remote archive or SHA-256 generation failed.'
  }
  Write-Host 'Downloading project archive ...'
  & $scp ($Server + ":$remoteArchive") $localArchive
  if ($LASTEXITCODE -ne 0) { throw 'SCP download failed.' }
  $localHash = (Get-FileHash -LiteralPath $localArchive -Algorithm SHA256).Hash
  if ($localHash -ne $remoteHash.ToUpperInvariant()) {
    throw "SHA-256 mismatch. Remote=$remoteHash Local=$localHash. Nothing was extracted."
  }
  Write-Host 'Archive SHA-256 verified.'
  $extractRoot = Join-Path $stageRoot 'extracted'
  New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
  & $tar -xzf $localArchive -C $extractRoot
  if ($LASTEXITCODE -ne 0) { throw 'Archive extraction failed.' }
  $stagedProject = Join-Path $extractRoot $Project
  if (-not (Test-Path -LiteralPath (Join-Path $stagedProject 'project.json'))) {
    throw "Archive is missing projects/$Project/project.json; refusing to install it."
  }
  if (Test-Path -LiteralPath $destination) {
    if (-not $Force) {
      throw "Local project already exists at $destination. Use -Force to move it to a timestamped backup first."
    }
    $backup = "$destination.local-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
    Move-Item -LiteralPath $destination -Destination $backup
    Write-Host "Existing local project preserved at: $backup"
  }
  Move-Item -LiteralPath $stagedProject -Destination $destination
  $files = @(Get-ChildItem -LiteralPath $destination -File -Recurse -Force)
  $bytes = ($files | Measure-Object -Property Length -Sum).Sum
  Write-Host ''
  Write-Host 'Project pull completed.'
  Write-Host "Destination: $destination"
  Write-Host "Files:       $($files.Count)"
  Write-Host ('Size:        {0:N1} MB' -f ($bytes / 1MB))
  Write-Host "Archive SHA: $localHash"
  & $ssh $Server "rm -f '$remoteArchive'" | Out-Null
}
finally {
  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }
}
