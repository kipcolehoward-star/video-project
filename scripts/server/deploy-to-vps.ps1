<#
.SYNOPSIS
  One-command bootstrap + private GitHub checkout for the Checkpoint Geo VPS.
.DESCRIPTION
  Run from the local video-project repository on Windows. First run installs the
  Ubuntu 22.04 toolchain and prints a VPS SSH public key. Add that key to the
  private GitHub repository as a write-enabled deploy key, then run this same
  command again. The second run clones/updates the selected branch and installs
  the locked dependencies. No project renders run on Windows.
.EXAMPLE
  .\scripts\server\deploy-to-vps.ps1 -Server root@38.180.243.115
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string]$Branch = 'infra/vps-migration-and-project-archive'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
foreach ($tool in @($ssh, $scp)) {
  if (-not (Test-Path -LiteralPath $tool)) { throw "Required Windows tool not found: $tool" }
}
if ($Branch -notmatch '^[A-Za-z0-9._/-]+$' -or $Branch.Contains('..')) { throw 'Invalid branch name.' }
Push-Location $root
try {
  if (-not (Test-Path -LiteralPath (Join-Path $root '.git'))) { throw 'Run this from inside the video-project Git checkout.' }
  $status = (& git status --porcelain | Out-String).Trim()
  if ($status) { throw 'Your local Git working tree is not clean. Commit or stash changes before deployment.' }

  Write-Host "Fetching the approved GitHub branch '$Branch'..."
  & git fetch origin --prune
  if ($LASTEXITCODE -ne 0) { throw "Could not fetch origin branches." }
  $localBranch = (& git branch --list $Branch | Out-String).Trim()
  if ($localBranch) {
    & git switch $Branch
  } else {
    & git switch --track -c $Branch ("origin/" + $Branch)
  }
  if ($LASTEXITCODE -ne 0) { throw "Could not switch to '$Branch'." }
  & git pull --ff-only origin $Branch
  if ($LASTEXITCODE -ne 0) { throw "Could not fast-forward '$Branch'. Resolve local/remote history before deploying." }

  $bootstrap = Join-Path $root 'scripts\server\bootstrap-ubuntu-22.04.sh'
  $checkout = Join-Path $root 'scripts\server\deploy-checkout.sh'
  foreach ($file in @($bootstrap, $checkout)) {
    if (-not (Test-Path -LiteralPath $file)) { throw "Missing deployment file: $file. Update this checkout from GitHub first." }
  }

  Write-Host 'Uploading the consolidated Ubuntu bootstrap...'
  & $scp $bootstrap ($Server + ':/tmp/checkpoint-bootstrap.sh')
  if ($LASTEXITCODE -ne 0) { throw 'Could not upload bootstrap script.' }

  Write-Host 'Preparing the VPS (Ubuntu packages, Node, FFmpeg, swap, firewall, app account)...'
  & $ssh $Server 'bash /tmp/checkpoint-bootstrap.sh'
  if ($LASTEXITCODE -ne 0) { throw 'VPS bootstrap failed. Read the error above; SSH access was not intentionally changed.' }

  Write-Host 'Uploading the private-repository checkout helper...'
  & $scp $checkout ($Server + ':/tmp/checkpoint-deploy-checkout.sh')
  if ($LASTEXITCODE -ne 0) { throw 'Could not upload repository checkout helper.' }

  Write-Host "Cloning/updating GitHub branch '$Branch' and installing runtime dependencies..."
  & $ssh $Server ("bash /tmp/checkpoint-deploy-checkout.sh '" + $Branch + "'")
  if ($LASTEXITCODE -ne 0) {
    Write-Warning 'The OS bootstrap completed, but the private GitHub checkout did not.'
    Write-Host 'If this is the first run, add the SSH public key printed by the bootstrap to:'
    Write-Host 'GitHub > Kipcolehoward-star/video-project > Settings > Deploy keys'
    Write-Host 'Enable "Allow write access" so the VPS can push the project checkpoints you requested.'
    Write-Host "Then run this same command again. No project files or secrets were deleted."
    exit 1
  }
  Write-Host ''
  Write-Host 'VPS bootstrap and repository deployment completed.'
  Write-Host 'Dashboard: https://studio.checkpointgeo.nx.kg'
  Write-Host 'Save the one-time owner and agent credentials printed during the first dashboard installation.'
}
finally {
  Pop-Location
}
