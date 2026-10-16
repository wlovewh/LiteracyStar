$ErrorActionPreference = "Continue"
Set-Location "D:\Project\LiteracyStar\competition-platform\backend"
$tests = @("test-logic.js","audit-spec.js","smoke-test.js","stage-test.js","event-select-test.js","event-switch-test.js","round8-test.js","round9-test.js")
foreach ($t in $tests) {
  $out = node "scripts/$t" 2>&1 | Out-String
  $line = ($out -split "`n" | Where-Object { $_ -match "RESULT|AUDIT RESULT" } | Select-Object -Last 1) -join ""
  Write-Host "  $t => $line"
  if ($line -match "([1-9][0-9]*) failed") { ($out -split "`n" | Where-Object { $_ -match "FAIL" }) | ForEach-Object { Write-Host "      $_" } }
}
Write-Host "=== INTEGRATED ==="
Set-Location "D:\Project\LiteracyStar\integrated-platform\backend"
$t2 = @("smoke-test.js","ws-test.js","admin-test.js","quote-test.js","round8-test.js","round9-test.js")
foreach ($t in $t2) {
  $out = node "scripts/$t" 2>&1 | Out-String
  $line = ($out -split "`n" | Where-Object { $_ -match "RESULT" } | Select-Object -Last 1) -join ""
  Write-Host "  $t => $line"
  if ($line -match "([1-9][0-9]*) failed") { ($out -split "`n" | Where-Object { $_ -match "FAIL" }) | ForEach-Object { Write-Host "      $_" } }
}
