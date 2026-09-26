param(
  [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Node is not on PATH on every operator machine. scripts/Start-WholesaleOS-Helper.cmd
# already falls back to Cursor's bundled runtime for the same reason; mirror that here so
# the suite can be run from the repository root without a global Node install.
function Resolve-NodeExecutable {
  if ($env:WOS_NODE -and (Test-Path $env:WOS_NODE)) { return $env:WOS_NODE }
  $onPath = Get-Command node -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA 'Programs\cursor\resources\app\resources\helpers\node.exe'),
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe')
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) { return $candidate }
  }
  throw ("node_executable_not_found: install Node, or set WOS_NODE to a node.exe path. " +
    "Attempted: PATH; " + ($candidates -join '; '))
}

$node = Resolve-NodeExecutable
Write-Output ("Node runtime: {0}" -f $node)
$files = Get-ChildItem (Join-Path $root 'tests') -Filter '*.test.js' -File | Sort-Object Name
$passed = 0
$failed = 0
$skipped = 0

function Get-TestOutcome([int]$ExitCode, [string[]]$OutputLines) {
  if ($ExitCode -ne 0) { return 'FAILED' }
  if ($OutputLines | Where-Object { $_ -match '^SKIPPED:' }) { return 'SKIPPED' }
  return 'PASSED'
}

# Guard the summary semantics themselves: a zero exit with a SKIPPED marker is not a pass.
if ((Get-TestOutcome 0 @('SKIPPED: fixture')) -ne 'SKIPPED' -or
    (Get-TestOutcome 0 @('all assertions passed')) -ne 'PASSED' -or
    (Get-TestOutcome 1 @('SKIPPED: fixture')) -ne 'FAILED') {
  throw 'test_outcome_classification_self_check_failed'
}

foreach ($file in $files) {
  $timer = [Diagnostics.Stopwatch]::StartNew()
  $outputLines = @()
  $exitCode = 0
  $stdoutPath = [IO.Path]::GetTempFileName()
  $stderrPath = [IO.Path]::GetTempFileName()
  $process = Start-Process -FilePath $node -ArgumentList @('"' + $file.FullName + '"') -WorkingDirectory $root `
    -NoNewWindow -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    $process.Kill()
    $exitCode = 124
  } else {
    $exitCode = $process.ExitCode
  }
  $timer.Stop()
  if ($stdoutPath -and (Test-Path $stdoutPath)) { $outputLines += Get-Content $stdoutPath }
  if ($stderrPath -and (Test-Path $stderrPath)) { $outputLines += Get-Content $stderrPath }
  Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue

  $outcome = Get-TestOutcome $exitCode $outputLines
  switch ($outcome) {
    'PASSED' { $passed++ }
    'SKIPPED' { $skipped++ }
    default { $failed++ }
  }
  Write-Output ("{0} {1} ({2:N2}s)" -f $outcome, $file.Name, $timer.Elapsed.TotalSeconds)
  $outputLines | ForEach-Object { Write-Output $_ }
}

Write-Output ("SUMMARY passed={0} failed={1} skipped={2} total={3}" -f $passed, $failed, $skipped, $files.Count)
if ($failed -gt 0) { exit 1 }
