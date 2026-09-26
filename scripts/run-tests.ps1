param(
  [int]$TimeoutSeconds = 600
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction Stop).Source
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
