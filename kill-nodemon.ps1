# Kill all nodemon and node processes
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Killing all nodemon and node processes" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill nodemon processes
$nodemonProcesses = Get-Process -Name "nodemon" -ErrorAction SilentlyContinue
if ($nodemonProcesses) {
    Write-Host "Found $($nodemonProcesses.Count) nodemon process(es). Killing them..." -ForegroundColor Yellow
    $nodemonProcesses | Stop-Process -Force
    Write-Host "✓ Nodemon processes killed." -ForegroundColor Green
} else {
    Write-Host "No nodemon processes found." -ForegroundColor Green
}

# Kill node processes using port 3001
$portInUse = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($portInUse) {
    $pids = $portInUse | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($pid in $pids) {
        $process = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if ($process -and $process.ProcessName -eq "node") {
            Write-Host "Killing node process on port 3001 (PID: $pid)..." -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        }
    }
    Write-Host "✓ Node processes on port 3001 killed." -ForegroundColor Green
} else {
    Write-Host "No processes using port 3001." -ForegroundColor Green
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
timeout /t 2


