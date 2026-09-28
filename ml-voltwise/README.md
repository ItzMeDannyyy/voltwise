# VoltWise ML Service: KMeans Clustering & Anomaly Detection

This service provides unsupervised machine learning for the **VoltWise** smart energy monitoring platform. It uses **K-Means clustering** and **Euclidean distance thresholding** to automatically profile electrical load patterns, group appliance operational states, and detect anomalies from PZEM-004T sensor telemetry.

---

## 1. Architecture & Concept

In VoltWise, energy readings are collected every 2 seconds by an ESP32 microcontroller with a PZEM-004T sensor. Training directly on single instantaneous readings is noisy, so the pipeline uses **30-second window feature engineering** to capture steady-state and transient characteristics.

```text
Raw Sensor Telemetry (PZEM-004T)
  ├── Air Conditioner (~625W run, >3.6kW inrush)
  └── Refrigerator (~13W-50W cycling, ~300W cooling)
                  ↓
       Feature Engineering (30s Windows)
  [voltage_mean, current_mean, current_max,
   power_mean, power_max, power_min, power_std,
   energy_delta_wh, frequency_mean, power_factor_mean]
                  ↓
          StandardScaler
                  ↓
      KMeans (K=6, Silhouette: 0.6377)
                  ↓
┌───────────────────────────────────────────────┐
│              Trained Artifacts                │
│  • artifacts/kmeans_pipeline.joblib           │
│  • artifacts/cluster_profiles.csv             │
│  • data/processed/windows.csv                 │
└───────────────────────────────────────────────┘
                  ↓
        FastAPI Live Service
  • GET /health         • GET /clusters
  • POST /telemetry     • POST /predict
```

---

## 2. Engineered Features

Each 30-second window extracts 10 electrical features:

| Feature | Description |
|---|---|
| `voltage_mean` | Average AC line voltage (V) |
| `current_mean` | Average load current (A) |
| `current_max` | Peak current in the window (A) |
| `power_mean` | Mean active power (W) |
| `power_max` | Peak active power / inrush spike (W) |
| `power_min` | Minimum active power in window (W) |
| `power_std` | Power volatility / standard deviation |
| `energy_delta_wh` | Energy consumed within the window (Wh) |
| `frequency_mean` | Grid frequency (Hz) |
| `power_factor_mean` | Power factor efficiency (0.0 to 1.0) |

---

## 3. Training Results & Learned Clusters

The model was trained on the datasets in `data/raw/`:
- `voltwise_air_conditioner_2026-09-25T23-45-16.csv` (458 readings)
- `voltwise_refrigerator_2026-09-26T00-04-25.csv` (454 readings)

Evaluating silhouette scores across $K \in [2, 6]$ selected **$K = 6$** (Silhouette Score: **0.6377**).

### Cluster Profiles

| Cluster | Power Mean | Current Mean | Power Factor | Count | Interpretation |
|:---:|:---:|:---:|:---:|:---:|---|
| **0** | 639.5 W | 3.13 A | 0.86 | 29 | **High Continuous Load (Air Conditioner)** |
| **1** | 24.3 W | 0.09 A | 0.99 | 16 | **Low Load / Cycling (Refrigerator)** |
| **2** | 505.2 W | 2.64 A | 0.93 | 1 | **High Inrush / Peak Surge (Air Conditioner - 3665.5W peak)** |
| **3** | 13.0 W | 0.05 A | 1.00 | 6 | **Standby / Idle (Refrigerator)** |
| **4** | 315.3 W | 1.54 A | 0.93 | 5 | **Medium Load (Refrigerator Active Cooling)** |
| **5** | 12.5 W | 0.06 A | 0.75 | 5 | **Standby / Low PF (Refrigerator Idle State)** |

- **Anomaly Threshold (95th percentile distance)**: `1.7950`
  - Any window with Euclidean distance $> 1.7950$ to its assigned cluster centroid triggers a warning alert.

---

## 4. How to Train the Model

To retrain or train on newly added raw CSV files placed in `data/raw/`:

```bash
# Standard training (evaluates K=2..6 with Silhouette Analysis)
python train.py

# Custom window duration or K range
python train.py --window-seconds 30 --min-k 2 --max-k 8

# Force a specific number of clusters
python train.py --k 4
```

---

## 5. Running the FastAPI Service

Start the FastAPI inference API:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive OpenAPI documentation is available at:
`http://localhost:8000/docs`

### Key Endpoints

- **`GET /health`**: Health status, model load state, features, and anomaly threshold.
- **`GET /clusters`**: Full JSON breakdown of all learned cluster profiles and labels.
- **`POST /telemetry`**: Ingests live telemetry readings into a rolling buffer and returns real-time predictions.
- **`POST /predict`**: Directly classifies a pre-computed feature dictionary.
- **`POST /train`**: Triggers model retraining on-demand via HTTP.

### Live Telemetry Streaming Example

```bash
curl -X POST http://127.0.0.1:8000/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "panel_id": "living-room-ac",
    "voltage": 237.5,
    "current": 3.12,
    "power": 638.0,
    "energy_kwh": 0.521,
    "frequency": 60.0,
    "power_factor": 0.86
  }'
```

Response:
```json
{
  "status": "predicted",
  "panel_id": "living-room-ac",
  "readings_in_window": 4,
  "features": {
    "voltage_mean": 237.5,
    "current_mean": 3.12,
    "current_max": 3.12,
    "power_mean": 638.0,
    "power_max": 638.0,
    "power_min": 638.0,
    "power_std": 0.0,
    "energy_delta_wh": 1.0,
    "frequency_mean": 60.0,
    "power_factor_mean": 0.86
  },
  "prediction": {
    "cluster": 0,
    "interpretation": "High Continuous Load (Air Conditioner)",
    "dominant_appliance": "Air Conditioner",
    "nearest_distance": 0.9568,
    "distance_threshold": 1.795,
    "is_anomaly": false,
    "alert_level": "normal",
    "message": "Normal electrical pattern aligned with High Continuous Load (Air Conditioner)."
  }
}
```
