$ErrorActionPreference = "Stop"
Set-Location "D:\Project\LiteracyStar\integrated-platform\frontend"
Remove-Item -Recurse -Force ..\..\deploy\intdist -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force dist ..\..\deploy\intdist
Set-Location "D:\Project\LiteracyStar\deploy"
tar czf intdist.tgz intdist
Write-Host ("包大小: " + (Get-Item intdist.tgz).Length)
