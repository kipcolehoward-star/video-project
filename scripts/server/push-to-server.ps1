<#
.SYNOPSIS
  Upload the framework (and chosen projects) to the render server, then finish its setup there.

.DESCRIPTION
  Bundles the working tree (no node_modules, tools, .git, previews, map copies or final MP4s)
  with Windows' built-in tar, copies it over SSH and runs setup-ubuntu.sh --app on the server
  (npm ci only when package-lock.json changed). Files deleted locally are not deleted on the server.
  .env is copied only with -WithEnv (rendering doesn't need it). Two SSH logins per run
  (use an SSH key to skip the password prompts). -DryRun only builds the bundle.

.EXAMPLE
  .\scripts\server\push-to-server.ps1 -Server root@203.0.113.10 -Project the-world-gave-us-this-01
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [string[]]$Project = @(),
  [switch]$WithEnv,
  [switch]$DryRun,
  [string]$RemoteDir = 'video-project'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'   # bsdtar; Git's GNU tar misreads "C:"
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'

# Framework = every top-level entry except local-only or heavy ones; projects are opt-in.
$skip = @('node_modules', 'tools', 'projects', '.git', '.env', '.remotion')
$items = @(Get-ChildItem -LiteralPath $root -Force |
  Where-Object { ($skip -notcontains $_.Name) -and ($_.Extension -ne '.log') } |
  ForEach-Object { $_.Name })
foreach ($p in $Project) {
  if (-not (Test-Path -LiteralPath (Join-Path $root "projects\$p\project.json"))) { throw "No project at projects\$p" }
  $items += "projects/$p"
}

$excludes = @(
  'src/generated', '*.log',
  'projects/*/previews', 'projects/*/geo', 'projects/*/audio/.mixwork',
  'projects/*/output/*.mp4', 'projects/*/output/*.parts'
) | ForEach-Object { "--exclude=$_" }

$bundle = Join-Path $env:TEMP 'video-project-upload.tar'
Write-Host "Bundling $($items.Count) items$(if ($Project) { ' + ' + ($Project -join ', ') })..."
& $tar -cf $bundle -C $root @excludes @items
if ($LASTEXITCODE -ne 0) { throw 'tar failed' }
Write-Host ('Bundle: {0:N0} MB' -f ((Get-Item $bundle).Length / 1MB))
if ($DryRun) { Write-Host "Dry run: bundle kept at $bundle (nothing uploaded)"; return }

$upload = @($bundle)
if ($WithEnv) {
  $envFile = Join-Path $root '.env'
  if (-not (Test-Path -LiteralPath $envFile)) { throw 'No .env to copy' }
  $upload += $envFile
}
Write-Host "Uploading to $Server ..."
& $scp @upload "${Server}:"
if ($LASTEXITCODE -ne 0) { throw 'scp failed' }
Remove-Item -LiteralPath $bundle

# One remote command: unpack, place .env (owner-only), fix line endings, finish setup.
$remote = 'set -e; mkdir -p ~/{0}; tar --warning=no-unknown-keyword -xf ~/video-project-upload.tar -C ~/{0}; rm ~/video-project-upload.tar; ' -f $RemoteDir
if ($WithEnv) { $remote += 'mv ~/.env ~/{0}/.env; chmod 600 ~/{0}/.env; ' -f $RemoteDir }
$remote += 'sed -i ''s/\r$//'' ~/{0}/scripts/server/*.sh; bash ~/{0}/scripts/server/setup-ubuntu.sh --app' -f $RemoteDir
& $ssh $Server $remote
if ($LASTEXITCODE -ne 0) { throw "Remote setup failed (exit $LASTEXITCODE)" }
