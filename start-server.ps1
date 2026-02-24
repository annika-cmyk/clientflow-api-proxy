# Start ClientFlow Server
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Starting ClientFlow Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill all nodemon processes
Write-Host "Checking for running nodemon processes..." -ForegroundColor Yellow
$nodemonProcesses = Get-Process -Name "nodemon" -ErrorAction SilentlyContinue
if ($nodemonProcesses) {
    Write-Host "Found $($nodemonProcesses.Count) nodemon process(es). Killing them..." -ForegroundColor Yellow
    $nodemonProcesses | Stop-Process -Force
    Start-Sleep -Seconds 1
}

# Kill all node processes using port 3001
Write-Host "Checking for processes using port 3001..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($portInUse) {
    $pids = $portInUse | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Host "Killing process: $($process.ProcessName) (PID: $pid)" -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "Waiting 2 seconds for ports to be released..." -ForegroundColor Green
    Start-Sleep -Seconds 2
} else {
    Write-Host "Port 3001 is free." -ForegroundColor Green
}

Write-Host ""
Write-Host "Starting server on port 3001..." -ForegroundColor Green
Write-Host ""
Write-Host "Keep this window open while using the application!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Press Ctrl+C to stop the server" -ForegroundColor Yellow
Write-Host ""

Set-Location $PSScriptRoot
npm run dev
