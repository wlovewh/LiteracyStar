# =============================================================
#  本地开发一键启动  deploy/dev.ps1
#  同时启动后端 (3000) 与前端 (5173)
#  用法:  pwsh -File deploy/dev.ps1
# =============================================================

$root = Split-Path -Parent $PSScriptRoot

Write-Host '启动后端服务 (http://localhost:3000) ...' -ForegroundColor Cyan
$backend = Start-Process -FilePath 'node' -ArgumentList 'src/app.js' -WorkingDirectory "$root\backend" -PassThru -NoNewWindow

Start-Sleep -Seconds 3

Write-Host '启动前端服务 (http://localhost:5173) ...' -ForegroundColor Cyan
$frontend = Start-Process -FilePath 'npm' -ArgumentList 'run','dev' -WorkingDirectory "$root\frontend" -PassThru -NoNewWindow

Write-Host ''
Write-Host '============================================' -ForegroundColor Green
Write-Host ' 前端: http://localhost:5173'
Write-Host ' 后端: http://localhost:3000/api/health'
Write-Host ' 管理员: admin / admin123'
Write-Host ' 按 Ctrl+C 停止全部服务'
Write-Host '============================================' -ForegroundColor Green

try {
  Wait-Process -Id $backend.Id, $frontend.Id
} finally {
  Write-Host '正在停止服务...' -ForegroundColor Yellow
  Stop-Process -Id $backend.Id  -ErrorAction SilentlyContinue
  Stop-Process -Id $frontend.Id -ErrorAction SilentlyContinue
}
