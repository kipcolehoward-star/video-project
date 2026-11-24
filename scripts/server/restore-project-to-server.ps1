<#
.SYNOPSIS
  Restores a locally archived complete project folder onto a replacement VPS.
.DESCRIPTION
  Creates a temporary tar.gz from projects\<id>, uploads it, verifies SHA-256
  remotely, and extracts only if the destination does not already exist. With
  -Force, the existing remote folder is moved to a timestamped backup first.
  The local archive is never deleted or modified.
.EXAMPLE
  .\scripts\server\restore-project-to-server.ps1 -Server root@38.180.243.115 -Project spain-africa-explained
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9._-]*$')][string]$Project,
  [string]$RemoteDir = '/srv/video-project',
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
if ($RemoteDir -notmatch '^/?[a-zA-Z0-9._/-]+$' -or $RemoteDir.Contains('..')) { throw 'Invalid RemoteDir.' }
$projectPath = Join-Path (Join-Path $root 'projects') $Project
if (-not (Test-Path -LiteralPath (Join-Path $projectPath 'project.json'))) { throw "Local archive missing projects\$Project\project.json" }

$archive = Join-Path $env:TEMP ("restore-$Project-" + [guid]::NewGuid().ToString('N') + '.tar.gz')
$remoteArchive = "/tmp/restore-$Project-$([guid]::NewGuid().ToString('N')).tar.gz"
try {
  Write-Host "Creating archive from local projects\$Project ..."
  & $tar -czf $archive -C (Join-Path $root 'projects') $Project
  if ($LASTEXITCODE -ne 0) { throw 'Local archive creation failed.' }
  $hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
  Write-Host "SHA-256: $hash"

  Write-Host "Uploading archive to $Server ..."
  & $scp $archive ($Server + ':' + $remoteArchive)
  if ($LASTEXITCODE -ne 0) { throw 'SCP upload failed.' }

  $forceFlag = if ($Force) { 'yes' } else { 'no' }
  $remoteTemplate = @'
set -euo pipefail
echo '__HASH__  __REMOTE_ARCHIVE__' | sha256sum -c -
REMOTE_DIR='__REMOTE_DIR__'
PROJECT='__PROJECT__'
TARGET="$REMOTE_DIR/projects/$PROJECT"
mkdir -p "$REMOTE_DIR/projects"
if [ -e "$TARGET" ]; then
  if [ '__FORCE__' != 'yes' ]; then
    echo 'Remote project already exists; refusing to overwrite.' >&2
    exit 20
  fi
  BACKUP="$TARGET.backup-$(date -u +%Y%m%dT%H%M%SZ)"
  mv "$TARGET" "$BACKUP"
  echo "Existing project preserved at $BACKUP"
fi
tar -xzf '__REMOTE_ARCHIVE__' -C "$REMOTE_DIR/projects"
test -f "$TARGET/project.json"
if id checkpoint >/dev/null 2>&1; then chown -R checkpoint:checkpoint "$TARGET"; fi
echo "Restored files: $(find "$TARGET" -type f | wc -l)"
rm -f '__REMOTE_ARCHIVE__'
'@
  $remote = $remoteTemplate.Replace('__HASH__', $hash).Replace('__REMOTE_ARCHIVE__', $remoteArchive).Replace('__REMOTE_DIR__', $RemoteDir).Replace('__PROJECT__', $Project).Replace('__FORCE__', $forceFlag)
  Write-Host 'Verifying and restoring on VPS ...'
  & $ssh $Server $remote
  if ($LASTEXITCODE -ne 0) { throw "Remote restore failed (exit $LASTEXITCODE). The local archive is preserved; inspect the VPS before retrying." }
  Write-Host "Restore completed: $RemoteDir/projects/$Project"
  Write-Host 'The local project archive was not changed.'
}
finally {
  if (Test-Path -LiteralPath $archive) { Remove-Item -LiteralPath $archive -Force }
}
