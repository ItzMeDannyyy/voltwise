# Test VoltWise ML API Endpoints
$BaseUrl = "http://127.0.0.1:8000"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host " Testing VoltWise ML Service Endpoints  " -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

# 1. Health Check
Write-Host "`n[1] Testing GET /health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$BaseUrl/health" -Method Get
    Write-Host "  Status: $($health.status)" -ForegroundColor Green
    Write-Host "  Model Loaded: $($health.model_loaded)" -ForegroundColor Green
    Write-Host "  Best K: $($health.best_k)" -ForegroundColor Green
    Write-Host "  Distance Threshold: $($health.distance_threshold)" -ForegroundColor Green
} catch {
    Write-Host "  Error: Server is not running! Start with: python -m uvicorn app.main:app --reload --port 8000" -ForegroundColor Red
    exit
}

# 2. Clusters Info
Write-Host "`n[2] Testing GET /clusters..." -ForegroundColor Yellow
$clusters = Invoke-RestMethod -Uri "$BaseUrl/clusters" -Method Get
Write-Host "  Retrieved $($clusters.clusters.Count) cluster profiles." -ForegroundColor Green

# 3. Simulate Air Conditioner Telemetry Stream (3 readings to fill buffer)
Write-Host "`n[3] Testing POST /telemetry (Air Conditioner - 3 readings)..." -ForegroundColor Yellow
for ($i = 1; $i -le 3; $i++) {
    $acBody = @{
        panel_id     = "ac-unit"
        voltage      = 237.5
        current      = 3.13
        power        = 639.5
        energy_kwh   = (0.50 + $i * 0.001)
        frequency    = 60.0
        power_factor = 0.86
    } | ConvertTo-Json

    $res = Invoke-RestMethod -Uri "$BaseUrl/telemetry" -Method Post -Body $acBody -ContentType "application/json"
    Write-Host "  Reading $i: Status = $($res.status)" -ForegroundColor Gray
}
Write-Host "  Prediction: Cluster $($res.prediction.cluster) - $($res.prediction.interpretation)" -ForegroundColor Green
Write-Host "  Alert Level: $($res.prediction.alert_level) (Is Anomaly: $($res.prediction.is_anomaly))" -ForegroundColor Green

# 4. Simulate Anomaly / Electrical Fault
Write-Host "`n[4] Testing POST /telemetry (Simulated Anomaly - 3 readings)..." -ForegroundColor Yellow
for ($i = 1; $i -le 3; $i++) {
    $faultBody = @{
        panel_id     = "fault-outlet"
        voltage      = 185.0
        current      = 25.0
        power        = 4600.0
        energy_kwh   = (1.00 + $i * 0.005)
        frequency    = 55.0
        power_factor = 0.40
    } | ConvertTo-Json

    $faultRes = Invoke-RestMethod -Uri "$BaseUrl/telemetry" -Method Post -Body $faultBody -ContentType "application/json"
}
Write-Host "  Prediction: Cluster $($faultRes.prediction.cluster) - Nearest Distance: $($faultRes.prediction.nearest_distance)" -ForegroundColor Yellow
Write-Host "  Alert Level: $($faultRes.prediction.alert_level) (Is Anomaly: $($faultRes.prediction.is_anomaly))" -ForegroundColor Red
Write-Host "  Message: $($faultRes.prediction.message)" -ForegroundColor Red

Write-Host "`n=========================================" -ForegroundColor Cyan
Write-Host " All endpoint tests executed successfully!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
