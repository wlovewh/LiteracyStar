$ErrorActionPreference = "Stop"
Set-Location "D:\Project\LiteracyStar"
Remove-Item -Recurse -Force deploy\pkg -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path deploy\pkg | Out-Null
Copy-Item -Recurse -Force competition-platform\backend\src deploy\pkg\comp-src
Copy-Item -Recurse -Force competition-platform\backend\scripts deploy\pkg\comp-scripts
Copy-Item -Recurse -Force competition-platform\frontend\dist deploy\pkg\comp-dist
Copy-Item -Recurse -Force integrated-platform\backend\src deploy\pkg\int-src
Copy-Item -Recurse -Force integrated-platform\backend\scripts deploy\pkg\int-scripts
Copy-Item -Recurse -Force integrated-platform\frontend\dist deploy\pkg\int-dist
Set-Location deploy\pkg
tar czf ..\r11b.tgz comp-src comp-scripts comp-dist int-src int-scripts int-dist
Set-Location ..\..
Write-Host ("包大小: " + (Get-Item deploy\r11b.tgz).Length)
