<#
.SYNOPSIS
  Download a project's finished output (MP4, subtitles, credits, reports) from the render server.

.EXAMPLE
  .\scripts\server\pull-from-server.ps1 -Server root@203.0.113.10 -Project the-world-gave-us-this-01
#>
param(
  [Parameter(Mandatory = $true)][string]$Server,
  [Parameter(Mandatory = $true)][string]$Project,
  [string]$RemoteDir = 'video-project'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tar = Join-Path $env:SystemRoot 'System32\tar.exe'
$ssh = Join-Path $env:SystemRoot 'System32\OpenSSH\ssh.exe'
$scp = Join-Path $env:SystemRoot 'System32\OpenSSH\scp.exe'
$dest = Join-Path $root "projects\$Project\output"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# Pack the output files (not the render parts) on the server, then copy one file.
$remote = 'set -e; cd ~/{0}/projects/{1}/output; tar -cf ~/video-project-output.tar --exclude=*.parts .' -f $RemoteDir, $Project
& $ssh $Server $remote
if ($LASTEXITCODE -ne 0) { throw 'Nothing to pull (no output folder on the server?)' }
$local = Join-Path $env:TEMP 'video-project-output.tar'
& $scp "${Server}:video-project-output.tar" $local
if ($LASTEXITCODE -ne 0) { throw 'scp failed' }
& $tar -xf $local -C $dest
Remove-Item -LiteralPath $local
Get-ChildItem -LiteralPath $dest -File | Sort-Object LastWriteTime -Descending | Select-Object -First 8 Name, @{n = 'MB'; e = { [math]::Round($_.Length / 1MB, 1) } }, LastWriteTime
