# VoltWise K-Means Model Starter Guide with FastAPI

This guide explains how to get started with a **VoltWise K-means clustering model** using server-side FastAPI. It covers the introductory concept, dataset preparation, feature engineering, training, and the first application flow.

---

## 1. Non-code Introduction

For VoltWise, **K-means clustering** should be used first as a **power-pattern grouping model**, not as a perfect appliance-name classifier.

K-means groups similar electrical behavior into clusters. In scikit-learn, `KMeans` forms a chosen number of clusters and can later predict which cluster a new sample is closest to.

In VoltWise, this means the model can learn patterns such as:

| Cluster | Possible Meaning |
|---|---|
| Cluster 0 | Idle or very low load |
| Cluster 1 | Normal small appliance usage |
| Cluster 2 | Medium load |
| Cluster 3 | High load |
| Cluster 4 | Abnormal or unusual load pattern |

Important: K-means does **not automatically know appliance names**. After training, you inspect the clusters and manually interpret them. For example, if Cluster 2 usually appears when the refrigerator compressor is running, you may label it as `possible refrigerator compressor state`.

For VoltWise, K-means is useful for:

1. Detecting unknown or abnormal power behavior
2. Grouping household load patterns
3. Finding unusual power spikes
4. Creating a baseline model before moving to supervised machine learning
5. Supporting alerts when something outside the normal pattern appears

For choosing the best number of clusters, you can use **silhouette score**, which measures how well-separated clusters are.

---

## 2. Recommended VoltWise ML Folder Structure

Inside your project, create an isolated model service:

```txt
voltwise-ml/
│
├── app/
│   └── main.py                  # FastAPI server
│
├── data/
│   ├── raw/
│   │   └── telemetry.csv         # Raw PZEM sensor readings
│   └── processed/
│       └── windows.csv           # Processed training windows
│
├── artifacts/
│   ├── kmeans_pipeline.joblib    # Saved trained model
│   └── cluster_profiles.csv      # Human-readable cluster summary
│
├── feature_engineering.py
├── train.py
├── requirements.txt
└── README.md
```

---

## 3. Dataset Format

For your first version, collect readings like this:

```csv
timestamp,voltage,current,power,energy_kwh,frequency,power_factor
2026-07-03T10:00:00Z,220.5,0.10,22.1,0.001,60.0,0.91
2026-07-03T10:00:01Z,220.4,0.11,24.0,0.0011,60.0,0.92
2026-07-03T10:00:02Z,220.6,0.50,110.2,0.0013,60.0,0.88
```

Your raw PZEM data should include:

| Column | Meaning |
|---|---|
| `timestamp` | Time of reading |
| `voltage` | Voltage reading |
| `current` | Current reading |
| `power` | Active power in watts |
| `energy_kwh` | Cumulative energy |
| `frequency` | Frequency |
| `power_factor` | Power factor |

Do **not** train directly on raw cumulative `energy_kwh` only. It keeps increasing, so it can confuse the model. Instead, use `energy_delta_wh`, which means the energy consumed inside a short time window.

---

## 4. Data Collection Strategy

For the first usable VoltWise K-means model, collect data in these stages:

### Stage 1: Normal Baseline

Collect data when the house or panel is in normal expected usage.

```txt
30 minutes to 2 hours of normal household activity
```

### Stage 2: Known Appliance Behavior

Turn on known appliances one by one.

```txt
Fan only        → 5 to 10 minutes
Refrigerator    → 30 minutes or more
Rice cooker     → full heating cycle
Electric kettle → full heating cycle
Idle state      → 10 minutes
```

### Stage 3: Mixed Usage

Collect data while multiple appliances are running.

```txt
Fan + refrigerator
Fan + rice cooker
Normal load + sudden high load
```

### Stage 4: Abnormal Examples

Simulate safe abnormal cases only.

```txt
Unexpected high load
Load above normal household threshold
Unregistered appliance plugged in
```

---

## 5. Install Setup

Create your project:

```bash
mkdir voltwise-ml
cd voltwise-ml

python3 -m venv .venv
source .venv/bin/activate
```

Create `requirements.txt`:

```txt
fastapi
uvicorn[standard]
pandas
numpy
scikit-learn
joblib
pydantic
```

Install dependencies:

```bash
pip install -r requirements.txt
```

FastAPI uses Pydantic models to define and validate request bodies, which is useful for receiving telemetry JSON from your server, ESP32 bridge, or backend service.

---

## 6. Feature Engineering

Create `feature_engineering.py`.

```python
import pandas as pd
import numpy as np


FEATURE_COLUMNS = [
    "voltage_mean",
    "current_mean",
    "current_max",
    "power_mean",
    "power_max",
    "power_min",
    "power_std",
    "energy_delta_wh",
    "frequency_mean",
    "power_factor_mean",
]


def clean_raw_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Cleans raw telemetry data before feature extraction.
    """

    df = df.copy()

    # Convert timestamp into proper datetime format
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")

    # Remove rows with invalid timestamps
    df = df.dropna(subset=["timestamp"])

    # Sort readings by time
    df = df.sort_values("timestamp")

    # Compute energy consumed between readings.
    # energy_kwh is cumulative, so we convert the difference to watt-hours.
    df["energy_delta_wh"] = df["energy_kwh"].diff().fillna(0) * 1000

    # Remove negative deltas caused by sensor reset or bad readings
    df["energy_delta_wh"] = df["energy_delta_wh"].clip(lower=0)

    return df


def build_training_windows(df: pd.DataFrame, window_seconds: int = 30) -> pd.DataFrame:
    """
    Converts raw second-by-second readings into window-based features.

    Instead of training on every single reading, we summarize every 30 seconds.
    This makes the model more stable.
    """

    df = clean_raw_data(df)
    df = df.set_index("timestamp")

    rule = f"{window_seconds}s"

    windows = pd.DataFrame({
        "voltage_mean": df["voltage"].resample(rule).mean(),
        "current_mean": df["current"].resample(rule).mean(),
        "current_max": df["current"].resample(rule).max(),

        "power_mean": df["power"].resample(rule).mean(),
        "power_max": df["power"].resample(rule).max(),
        "power_min": df["power"].resample(rule).min(),
        "power_std": df["power"].resample(rule).std().fillna(0),

        "energy_delta_wh": df["energy_delta_wh"].resample(rule).sum(),

        "frequency_mean": df["frequency"].resample(rule).mean(),
        "power_factor_mean": df["power_factor"].resample(rule).mean(),
    })

    # Remove empty windows
    windows = windows.dropna()

    return windows.reset_index(drop=True)


def build_live_feature_row(df: pd.DataFrame) -> pd.DataFrame:
    """
    Builds one feature row from the latest live readings stored in memory.

    This is used by FastAPI during live prediction.
    """

    df = clean_raw_data(df)

    if df.empty:
        raise ValueError("No valid telemetry readings available.")

    row = {
        "voltage_mean": df["voltage"].mean(),
        "current_mean": df["current"].mean(),
        "current_max": df["current"].max(),

        "power_mean": df["power"].mean(),
        "power_max": df["power"].max(),
        "power_min": df["power"].min(),
        "power_std": df["power"].std() if len(df) > 1 else 0,

        "energy_delta_wh": df["energy_delta_wh"].sum(),

        "frequency_mean": df["frequency"].mean(),
        "power_factor_mean": df["power_factor"].mean(),
    }

    return pd.DataFrame([row])[FEATURE_COLUMNS]
```

---

## 7. Training Script

Create `train.py`.

```python
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from feature_engineering import FEATURE_COLUMNS, build_training_windows


RAW_DATA_PATH = Path("data/raw/telemetry.csv")
PROCESSED_DATA_PATH = Path("data/processed/windows.csv")
MODEL_PATH = Path("artifacts/kmeans_pipeline.joblib")
CLUSTER_PROFILE_PATH = Path("artifacts/cluster_profiles.csv")


def choose_best_k(X: pd.DataFrame, min_k: int = 2, max_k: int = 8) -> int:
    """
    Tries different K values and chooses the one with the best silhouette score.
    """

    best_k = min_k
    best_score = -1

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    for k in range(min_k, max_k + 1):
        model = KMeans(
            n_clusters=k,
            random_state=42,
            n_init="auto"
        )

        labels = model.fit_predict(X_scaled)

        # Silhouette score needs at least 2 clusters
        score = silhouette_score(X_scaled, labels)

        print(f"k={k}, silhouette_score={score:.4f}")

        if score > best_score:
            best_score = score
            best_k = k

    print(f"\nBest k: {best_k}")
    return best_k


def train() -> None:
    """
    Full training flow:
    1. Load raw telemetry.
    2. Convert raw readings into 30-second windows.
    3. Choose best number of clusters.
    4. Train K-means pipeline.
    5. Save model artifact.
    6. Save cluster profile summary.
    """

    Path("data/processed").mkdir(parents=True, exist_ok=True)
    Path("artifacts").mkdir(parents=True, exist_ok=True)

    raw_df = pd.read_csv(RAW_DATA_PATH)

    windows = build_training_windows(raw_df, window_seconds=30)
    windows.to_csv(PROCESSED_DATA_PATH, index=False)

    X = windows[FEATURE_COLUMNS]

    best_k = choose_best_k(X, min_k=2, max_k=8)

    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("kmeans", KMeans(
            n_clusters=best_k,
            random_state=42,
            n_init="auto"
        ))
    ])

    pipeline.fit(X)

    labels = pipeline.predict(X)

    # Distance from each sample to its nearest cluster center.
    # Larger distance means the pattern is less normal.
    distances = pipeline.transform(X)
    min_distances = distances.min(axis=1)

    # 95th percentile is a simple starting anomaly threshold.
    # You can tune this later.
    distance_threshold = float(np.percentile(min_distances, 95))

    artifact = {
        "pipeline": pipeline,
        "features": FEATURE_COLUMNS,
        "distance_threshold": distance_threshold,
        "window_seconds": 30,
    }

    joblib.dump(artifact, MODEL_PATH)

    windows["cluster"] = labels
    windows["distance"] = min_distances

    cluster_profiles = windows.groupby("cluster")[FEATURE_COLUMNS + ["distance"]].mean()
    cluster_profiles["count"] = windows.groupby("cluster").size()

    cluster_profiles.to_csv(CLUSTER_PROFILE_PATH)

    print("\nTraining complete.")
    print(f"Saved model to: {MODEL_PATH}")
    print(f"Saved cluster profiles to: {CLUSTER_PROFILE_PATH}")
    print(f"Anomaly distance threshold: {distance_threshold:.4f}")


if __name__ == "__main__":
    train()
```

Run training:

```bash
python train.py
```

After training, check:

```txt
artifacts/cluster_profiles.csv
```

Example result:

```csv
cluster,voltage_mean,current_mean,power_mean,power_max,energy_delta_wh,count
0,220.1,0.05,10.5,15.0,0.10,120
1,220.3,0.45,98.2,130.0,0.85,80
2,219.9,3.20,700.5,850.0,6.10,40
```

You may interpret it like this:

| Cluster | Interpretation |
|---|---|
| 0 | Idle / standby |
| 1 | Low-to-medium normal appliance |
| 2 | High-load appliance or possible abnormal load |

---

## 8. FastAPI Server for Live Prediction

Create `app/main.py`.

```python
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List

import joblib
import pandas as pd

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from feature_engineering import build_live_feature_row


MODEL_PATH = Path("artifacts/kmeans_pipeline.joblib")

WINDOW_SECONDS = 30
MIN_READINGS = 5

app = FastAPI(title="VoltWise K-Means Model API")


class TelemetryReading(BaseModel):
    panel_id: str = Field(..., example="home-main-panel")
    timestamp: datetime = Field(..., example="2026-07-03T10:00:00Z")

    voltage: float = Field(..., example=220.5)
    current: float = Field(..., example=0.45)
    power: float = Field(..., example=98.2)
    energy_kwh: float = Field(..., example=0.123)
    frequency: float = Field(..., example=60.0)
    power_factor: float = Field(..., example=0.91)


# In-memory buffer.
# Later, you can replace this with Redis, PostgreSQL, or your main backend database.
buffers: Dict[str, List[dict]] = {}


def load_model():
    if not MODEL_PATH.exists():
        raise RuntimeError(
            "Model artifact not found. Train the model first using: python train.py"
        )

    return joblib.load(MODEL_PATH)


artifact = load_model()

pipeline = artifact["pipeline"]
FEATURES = artifact["features"]
DISTANCE_THRESHOLD = artifact["distance_threshold"]


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": True,
        "features": FEATURES,
        "distance_threshold": DISTANCE_THRESHOLD,
    }


@app.post("/telemetry")
def receive_telemetry(reading: TelemetryReading):
    """
    Receives one live telemetry reading.

    Flow:
    1. Store latest reading in memory.
    2. Keep only the latest 30 seconds of readings.
    3. Build one feature row.
    4. Predict cluster.
    5. Check if the reading is abnormal.
    """

    item = reading.model_dump()

    panel_id = item.pop("panel_id")
    reading_time = item["timestamp"]

    if panel_id not in buffers:
        buffers[panel_id] = []

    buffers[panel_id].append(item)

    cutoff_time = reading_time - timedelta(seconds=WINDOW_SECONDS)

    # Keep only recent readings inside the time window
    buffers[panel_id] = [
        row for row in buffers[panel_id]
        if row["timestamp"] >= cutoff_time
    ]

    if len(buffers[panel_id]) < MIN_READINGS:
        return {
            "status": "warming_up",
            "message": "Not enough readings yet for stable prediction.",
            "readings_collected": len(buffers[panel_id]),
            "minimum_required": MIN_READINGS,
        }

    try:
        df = pd.DataFrame(buffers[panel_id])
        feature_row = build_live_feature_row(df)

        cluster = int(pipeline.predict(feature_row)[0])

        distances = pipeline.transform(feature_row)
        nearest_distance = float(distances.min(axis=1)[0])

        is_anomaly = nearest_distance > DISTANCE_THRESHOLD

        if is_anomaly:
            alert_level = "warning"
            message = "Unusual electrical load pattern detected."
        else:
            alert_level = "normal"
            message = "Electrical load pattern is within learned behavior."

        return {
            "status": "predicted",
            "panel_id": panel_id,
            "cluster": cluster,
            "nearest_distance": nearest_distance,
            "distance_threshold": DISTANCE_THRESHOLD,
            "is_anomaly": is_anomaly,
            "alert_level": alert_level,
            "message": message,
            "features": feature_row.iloc[0].to_dict(),
        }

    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error))
```

Run the FastAPI server:

```bash
uvicorn app.main:app --reload
```

Test it:

```bash
curl -X POST http://127.0.0.1:8000/telemetry \
  -H "Content-Type: application/json" \
  -d '{
    "panel_id": "home-main-panel",
    "timestamp": "2026-07-03T10:00:00Z",
    "voltage": 220.5,
    "current": 0.45,
    "power": 98.2,
    "energy_kwh": 0.123,
    "frequency": 60.0,
    "power_factor": 0.91
  }'
```

At first, it will return:

```json
{
  "status": "warming_up",
  "message": "Not enough readings yet for stable prediction."
}
```

After several readings, it should return something like:

```json
{
  "status": "predicted",
  "panel_id": "home-main-panel",
  "cluster": 1,
  "nearest_distance": 0.82,
  "distance_threshold": 1.45,
  "is_anomaly": false,
  "alert_level": "normal",
  "message": "Electrical load pattern is within learned behavior."
}
```

---

## 9. Server-side VoltWise Application Flow

For now, your architecture can be:

```txt
ESP32 + PZEM004T
        ↓
Backend receives telemetry
        ↓
Save raw telemetry to database
        ↓
Send telemetry to FastAPI ML service
        ↓
FastAPI builds 30-second feature window
        ↓
K-means predicts cluster
        ↓
Server checks anomaly distance
        ↓
Save prediction result
        ↓
Trigger alert if abnormal
```

Server-side modules:

```txt
1. Telemetry ingestion
   Receives voltage, current, power, frequency, energy, power factor.

2. Raw telemetry storage
   Stores original readings for audit and retraining.

3. Feature extraction
   Converts readings into 30-second summaries.

4. K-means prediction
   Returns cluster number and anomaly distance.

5. Alert logic
   Decides whether to notify user.

6. Prediction logging
   Stores cluster result, timestamp, and anomaly status.
```

---

## 10. Suggested Database Tables

You can later store this in PostgreSQL.

### `telemetry_readings`

```sql
id
panel_id
timestamp
voltage
current
power
energy_kwh
frequency
power_factor
created_at
```

### `ml_predictions`

```sql
id
panel_id
timestamp
cluster
nearest_distance
distance_threshold
is_anomaly
alert_level
message
created_at
```

### `cluster_labels`

```sql
id
cluster
label
description
created_at
updated_at
```

Example labels:

```txt
Cluster 0 → Idle / standby
Cluster 1 → Normal low load
Cluster 2 → Medium load
Cluster 3 → High load
Cluster 4 → Unusual pattern
```

---

## 11. Dataset Options

Your **best dataset** is your own VoltWise PZEM004T dataset because it matches your actual sensor, sampling rate, household wiring, voltage behavior, and appliance patterns.

External NILM datasets can help you understand load signatures, but they will not perfectly match your hardware. Examples include:

- UK-DALE
- REFIT

Use external datasets for:

```txt
Learning
Experiments
Research comparison
Documentation background
```

Use your own dataset for:

```txt
Actual VoltWise model training
Live FastAPI prediction
Abnormal load detection
Capstone demonstration
```

---

## 12. First Completion Milestone

Your first working milestone should be this:

```txt
[✓] Collect raw PZEM telemetry into telemetry.csv
[✓] Train K-means using train.py
[✓] Generate cluster_profiles.csv
[✓] Manually label clusters
[✓] Run FastAPI model server
[✓] Send live telemetry to /telemetry
[✓] Receive cluster + anomaly result
[✓] Save prediction result in backend database
```

For your capstone, describe this as:

> The initial VoltWise model applies unsupervised K-means clustering to group household electrical load patterns based on voltage, current, power, frequency, power factor, and energy-consumption changes. The model does not initially require appliance labels; instead, it establishes normal load behavior and detects readings that deviate from learned cluster patterns. This allows the system to identify unusual or potentially unregistered electrical activity before more advanced supervised appliance identification is introduced.

---

## Final Flow Summary

```txt
Collect telemetry
        ↓
Convert readings into time-window features
        ↓
Train K-means
        ↓
Inspect and label clusters
        ↓
Serve the trained model with FastAPI
        ↓
Send live telemetry to the model API
        ↓
Detect cluster and abnormal load pattern
        ↓
Store prediction and trigger alert when needed
```

This is the right starter model flow for VoltWise: **collect → window features → train K-means → inspect clusters → serve with FastAPI → detect abnormal load patterns**.
