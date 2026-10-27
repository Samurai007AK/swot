# Swot installer for Windows. Paste this into PowerShell (from Command Prompt, type `powershell` first):
#   irm https://raw.githubusercontent.com/Samurai007AK/swot/main/install.ps1 | iex
# Don't wrap it in `powershell -c "..."`: Windows Defender blocks that command-line shape.
# Run it again to update. Your courses in %USERPROFILE%\.swot\sets are never touched.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'Samurai007AK/swot'
$src = if ($env:SWOT_SOURCE) { $env:SWOT_SOURCE } else { "https://codeload.github.com/$repo/zip/refs/heads/main" }
$dir = if ($env:SWOT_HOME) { $env:SWOT_HOME } else { Join-Path $HOME '.swot' }
$app = Join-Path $dir 'app'
$bin = Join-Path $dir 'bin'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Swot needs Node.js 20 or newer. Install it from https://nodejs.org and run this again.'; return
}
$major = [int](node -p "process.versions.node.split('.')[0]")
if ($major -lt 20) {
  Write-Host "Swot needs Node.js 20 or newer (you have $(node -v)). Update it from https://nodejs.org and run this again."; return
}

$tmp = Join-Path ([IO.Path]::GetTempPath()) ('swot-' + [guid]::NewGuid())
New-Item -ItemType Directory $tmp | Out-Null
try {
  Write-Host 'Downloading Swot...'
  $zip = Join-Path $tmp 'swot.zip'
  if ($src -match '^https?://') { Invoke-WebRequest $src -OutFile $zip -UseBasicParsing } else { Copy-Item $src $zip }
  Expand-Archive $zip (Join-Path $tmp 'x')
  $folder = Get-ChildItem (Join-Path $tmp 'x') -Directory | Select-Object -First 1 # the archive holds one top folder

  New-Item -ItemType Directory -Force $dir | Out-Null
  if (Test-Path $app) { Remove-Item $app -Recurse -Force }
  Move-Item $folder.FullName $app
  Write-Host 'Installing...'
  Push-Location $app
  try { npm.cmd install --omit=dev --no-audit --no-fund --loglevel=error } finally { Pop-Location } # npm.cmd works under any execution policy
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed. Check your internet connection and run this again.' }

  New-Item -ItemType Directory -Force $bin | Out-Null
  Set-Content (Join-Path $bin 'swot.cmd') "@echo off`r`nnode `"$app\bin\swot.js`" %*" -Encoding ASCII
  if (-not $env:SWOT_NO_PATH) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    if (-not (($userPath -split ';') -contains $bin)) {
      [Environment]::SetEnvironmentVariable('Path', ((@($userPath, $bin) | Where-Object { $_ }) -join ';'), 'User')
    }
    if (-not (($env:Path -split ';') -contains $bin)) { $env:Path += ";$bin" }
  }
} finally {
  Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host 'Swot is installed. Start it any time with:  swot   (in a new terminal)'
if (-not (Get-Command claude -ErrorAction SilentlyContinue) -and -not (Get-Command codex -ErrorAction SilentlyContinue)) {
  Write-Host 'Note: Swot uses Claude Code or Codex for the AI. Install one and sign in before you start a lesson.'
}
if (-not $env:SWOT_NO_START) { & (Join-Path $bin 'swot.cmd') }
