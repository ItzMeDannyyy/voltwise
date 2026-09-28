# VoltWise ML API - One-Liner cURL Testing Templates

Before running these requests, ensure the FastAPI server is running:

```powershell
cd ml-voltwise
python -m uvicorn app.main:app --reload --port 8000
```

> **Note for Windows Users:** 
> In Windows PowerShell, use `curl.exe` to call the native cURL binary. The JSON payload is wrapped in single quotes `'...'` with internal quotes escaped as `\"` to prevent PowerShell from stripping double quotes.

---

## 1. Health & Status Check

Verifies that the server is alive and the KMeans model is loaded in memory.

```powershell
curl.exe -X GET http://127.0.0.1:8000/health
```

### Expected Response:
```json
{
  "status": "ok",
  "model_loaded": true,
  "best_k": 6,
  "distance_threshold": 1.795,
  "features": [
    "voltage_mean", "current_mean", "current_max",
    "power_mean", "power_max", "power_min", "power_std",
    "energy_delta_wh", "frequency_mean", "power_factor_mean"
  ],
  "window_seconds": 30,
  "active_panel_buffers": []
}
```

---

## 2. Get Learned Cluster Profiles

Returns the cluster centroids, power profiles, and human-readable interpretations.

```powershell
curl.exe -X GET http://127.0.0.1:8000/clusters
```

---

## 3. Live Telemetry Streaming (`POST /telemetry`) — No `panel_id`

> **Pure NILM Design:** The IoT sensor does not know what appliance is plugged in. `panel_id` is omitted entirely; the model identifies the appliance from the electrical measurements alone.
>
> *(Note: Run each command **3 times** to fill the 30-second window buffer before receiving the prediction).*

### A. Air Conditioner Steady State (~640 W)
```powershell
curl.exe -X POST http://127.0.0.1:8000/telemetry -H "Content-Type: application/json" -d '{\"voltage\":237.5,\"current\":3.13,\"power\":639.5,\"energy_kwh\":0.55,\"frequency\":60.0,\"power_factor\":0.86}'
```

**Expected Prediction Result:**
```json
{
  "status": "predicted",
  "panel_id": "main-panel",
  "readings_in_window": 3,
  "prediction": {
    "cluster": 0,
    "interpretation": "High Continuous Load (Air Conditioner)",
    "dominant_appliance": "Air Conditioner",
    "is_anomaly": false,
    "alert_level": "normal"
  }
}
```

---

### B. Refrigerator Idle / Standby (~13 W)
```powershell
curl.exe -X POST http://127.0.0.1:8000/telemetry -H "Content-Type: application/json" -d '{\"voltage\":238.5,\"current\":0.05,\"power\":13.0,\"energy_kwh\":0.63,\"frequency\":60.1,\"power_factor\":0.99}'
```

**Expected Prediction Result:**
```json
{
  "status": "predicted",
  "panel_id": "main-panel",
  "readings_in_window": 3,
  "prediction": {
    "cluster": 1,
    "interpretation": "Low Load / Cycling (Refrigerator)",
    "dominant_appliance": "Refrigerator",
    "nearest_distance": 0.4131,
    "distance_threshold": 1.795,
    "is_anomaly": false,
    "alert_level": "normal"
  }
}
```

---

### C. Anomaly Detection (Extreme Overload / Voltage Sag)
Simulates an abnormal power fault (4,800 W spike with severe voltage drop to 190 V):

```powershell
curl.exe -X POST http://127.0.0.1:8000/telemetry -H "Content-Type: application/json" -d '{\"voltage\":190.0,\"current\":25.0,\"power\":4800.0,\"energy_kwh\":1.20,\"frequency\":55.0,\"power_factor\":0.40}'
```

**Expected Prediction Result:**
```json
{
  "status": "predicted",
  "prediction": {
    "cluster": 3,
    "nearest_distance": 77.3293,
    "distance_threshold": 1.795,
    "is_anomaly": true,
    "alert_level": "warning",
    "message": "Unusual electrical pattern detected (distance 77.33 > threshold 1.80)."
  }
}
```

---

### D. File-Based Alternative (No Quoting Needed)

You can also send payloads directly from a `.json` file:

```powershell
curl.exe -X POST http://127.0.0.1:8000/telemetry -H "Content-Type: application/json" -d @sample_telemetry.json
```

---

## 4. Direct Pre-computed Feature Prediction (`POST /predict`)

For testing a complete 30-second window feature vector directly:

```powershell
curl.exe -X POST http://127.0.0.1:8000/predict -H "Content-Type: application/json" -d '{\"voltage_mean\":237.5,\"current_mean\":3.13,\"current_max\":3.16,\"power_mean\":639.5,\"power_max\":642.0,\"power_min\":637.0,\"power_std\":1.5,\"energy_delta_wh\":5.3,\"frequency_mean\":60.0,\"power_factor_mean\":0.86}'
```

---

## 5. On-Demand Retraining (`POST /train`)

Triggers the training pipeline to re-evaluate silhouette scores and re-fit clusters on any new raw CSV data:

```powershell
curl.exe -X POST http://127.0.0.1:8000/train -H "Content-Type: application/json" -d '{\"window_seconds\":30,\"min_k\":2,\"max_k\":6}'
```

---

## 6. Equivalent Native PowerShell Syntax (`Invoke-RestMethod`)

If you prefer using pure PowerShell without `curl.exe`:

```powershell
# Health check
Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -Method Get

# Live Telemetry (No panel_id)
$body = @{
    voltage      = 237.5
    current      = 3.13
    power        = 639.5
    energy_kwh   = 0.55
    frequency    = 60.0
    power_factor = 0.86
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://127.0.0.1:8000/telemetry" -Method Post -Body $body -ContentType "application/json"
```
