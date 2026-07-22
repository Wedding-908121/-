# ============================================
#  机械共性情报 — 一键采集 + 启动
#  用法: .\start.ps1
#  参数: .\start.ps1 -DryRun    (仅预览不写入)
#        .\start.ps1 -Server    (仅启动服务器)
# ============================================

param(
  [switch]$DryRun,
  [switch]$Server,
  [switch]$NoCollect
)

$projectDir = "$PSScriptRoot"
Set-Location $projectDir

# ----- 1. 采集数据 -----
if (-not $Server -and -not $NoCollect) {
  Write-Host "`n=== 开始采集情报 ===" -ForegroundColor Green
  
  $nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $nodePath) {
    $nodePath = "C:\Users\Chao Hu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
  }
  
  $args = @("scripts/collect.mjs")
  if ($DryRun) { $args += "--dry-run" }
  
  & $nodePath $args
  if ($LASTEXITCODE -ne 0) {
    Write-Host "采集失败，请检查日志" -ForegroundColor Red
    if (-not $Server) { exit 1 }
  }
}

# ----- 2. 启动服务器 -----
if ($DryRun) { exit 0 }

Write-Host "`n=== 启动服务器 http://localhost:4173 ===" -ForegroundColor Green
$nodePath = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $nodePath) {
  $nodePath = "C:\Users\Chao Hu\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
}

Write-Host "浏览器打开: http://localhost:4173" -ForegroundColor Cyan
Write-Host "按 Ctrl+C 停止`n" -ForegroundColor DarkYellow

& $nodePath server.mjs
