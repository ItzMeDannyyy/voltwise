# VoltWise ML Model: Comprehensive Line-by-Line & Function-by-Function Guide

> **Welcome!** Machine learning source code can feel intimidating because it combines mathematics, data processing, and software engineering all at once.
> 
> This document breaks down the entire `ml-voltwise` model codebase in plain, beginner-friendly language. No jargon is left unexplained.

---

## Table of Contents

1. [The Big Picture: How the 3 Files Work Together](#1-the-big-picture)
2. [File 1: `feature_engineering.py` (The Chef)](#2-file-1-feature_engineeringpy)
   - [Global Constants & Columns](#global-constants--columns)
   - [Function: `clean_raw_data()`](#function-clean_raw_data)
   - [Function: `build_training_windows()`](#function-build_training_windows)
   - [Function: `build_training_windows_from_folder()`](#function-build_training_windows_from_folder)
   - [Function: `build_live_feature_row()`](#function-build_live_feature_row)
3. [File 2: `train.py` (The Teacher)](#3-file-2-trainpy)
   - [Imports & Default Paths](#imports--default-paths)
   - [Function: `choose_best_k()`](#function-choose_best_k)
   - [Function: `auto_label_cluster()`](#function-auto_label_cluster)
   - [Function: `train()`](#function-train)
   - [CLI Execution Block (`if __name__ == '__main__'`)](#cli-execution-block)
4. [File 3: `app/main.py` (The Live Doctor / API)](#4-file-3-appmainpy)
   - [State Management & Lifespan](#state-management--lifespan)
   - [Data Models (Pydantic Schemas)](#data-models-pydantic-schemas)
   - [Inference Helpers](#inference-helpers)
   - [Endpoints (`/health`, `/clusters`, `/telemetry`, `/predict`, `/train`)](#endpoints)
5. [Summary Cheatsheet: What to Remember](#5-summary-cheatsheet)

---

## 1. The Big Picture

Think of our machine learning service like a restaurant:

```text
┌─────────────────────────────────┐
│     data/raw/*.csv              │  Raw sensor ingredients (every 2 seconds: V, A, W, kWh)
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   feature_engineering.py        │  THE CHEF: Washes the data, groups it into 30-second
│   (Data Preparation)            │  windows, and extracts 10 summary statistics.
└────────────────┬────────────────┘
                 │
                 ▼
┌─────────────────────────────────┐
│   train.py                      │  THE TEACHER: Experiments with cluster counts (K=2..6),
│   (Model Training)              │  learns normal vs abnormal patterns, and exports artifacts.
└────────────────┬────────────────┘
                 │ Generates:
                 │ • artifacts/kmeans_pipeline.joblib
                 │ • artifacts/cluster_profiles.csv
                 ▼
┌─────────────────────────────────┐
│   app/main.py                   │  THE DOCTOR / FRONT DESK: A live FastAPI server that
│   (FastAPI Prediction Service)  │  receives incoming sensor telemetry and diagnoses it in real time.
└─────────────────────────────────┘
```

---

## 2. File 1: `feature_engineering.py`

### Why this file exists:
An ESP32 sensor takes a reading every 2 seconds. A single reading can have noise (a sudden flicker in voltage). If we fed raw 2-second readings into K-Means, the model would get confused by tiny fluctuations. 

Instead, we group every **30 seconds** of readings into one **"window"** and calculate summary numbers (average power, maximum power, power stability). This is called **Feature Engineering**.

---

### Global Constants & Columns

```python
1: import glob
2: from pathlib import Path
3: from typing import List, Optional, Union
4: import numpy as np
5: import pandas as pd
```
- **Line 1–5**: We import standard libraries:
  - `pathlib.Path`: Clean, cross-platform way to handle file paths (Windows `\` vs Linux `/`).
  - `typing`: Helps code editors show hints (`List`, `Optional`, `Union`).
  - `numpy as np`: Fast numerical operations in Python.
  - `pandas as pd`: The industry standard library for tabular data (like an Excel sheet in code).

```python
8: FEATURE_COLUMNS: List[str] = [
9:     "voltage_mean",
10:    "current_mean",
11:    "current_max",
12:    "power_mean",
13:    "power_max",
14:    "power_min",
15:    "power_std",
16:    "energy_delta_wh",
17:    "frequency_mean",
18:    "power_factor_mean",
19: ]
```
- **Line 8–19**: These are the **10 features** the K-Means algorithm will look at. 
  - `power_mean`: Average wattage over 30 seconds.
  - `power_max`: The highest wattage spike in those 30 seconds (crucial for catching motor startups!).
  - `power_min`: The lowest wattage.
  - `power_std`: Standard deviation of power (how unstable or jumpy the power is).
  - `energy_delta_wh`: Watt-hours consumed during just those 30 seconds.
  - `power_factor_mean`: How efficiently the electrical appliance uses power.

```python
22: COLUMN_MAPPINGS = {
23:     "voltage_v": "voltage",
24:     "current_a": "current",
25:     "power_watts": "power",
26:     "frequency_hz": "frequency",
27: }
```
- **Line 22–27**: A translation dictionary. Some raw files name columns `voltage_v` while others use `voltage`. This dictionary standardizes all names to simple names.

---

### Function: `clean_raw_data()`

```python
30: def clean_raw_data(df: pd.DataFrame) -> pd.DataFrame:
```
- **Purpose**: Cleans raw sensor data before doing any math.

```python
35:     df = df.copy()
```
- **Line 35**: Makes an independent duplicate of the input table so we do not accidentally modify the original data in memory.

```python
38:     df = df.rename(columns=COLUMN_MAPPINGS)
```
- **Line 38**: Renames any sensor columns (like `voltage_v` $\rightarrow$ `voltage`).

```python
41:     required_cols = ["timestamp", "voltage", "current", "power", "energy_kwh", "frequency", "power_factor"]
42:     missing = [col for col in required_cols if col not in df.columns]
43:     if missing:
44:         raise ValueError(f"Missing required columns in dataset: {missing}")
```
- **Line 41–44**: Sanity check! If a dataset is missing a critical column (like `power`), it stops immediately and throws a helpful error message instead of failing mysteriously later.

```python
47:     df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
48:     df = df.dropna(subset=["timestamp"])
49:     df = df.sort_values("timestamp")
```
- **Line 47**: Converts text strings like `"2026-09-25T23:30:01Z"` into genuine Python date/time objects. `errors="coerce"` turns any corrupted timestamp text into `NaT` (Not-A-Time).
- **Line 48**: Deletes any row where the timestamp was corrupted or missing.
- **Line 49**: Sorts rows in order from oldest to newest so chronological calculations work properly.

```python
52:     df["energy_delta_wh"] = df["energy_kwh"].diff().fillna(0).clip(lower=0) * 1000.0
```
- **Line 52 (Very Important)**: 
  - The PZEM-004T sensor gives `energy_kwh`, which is a **cumulative odometer** (it keeps counting up: `0.100`, `0.101`, `0.102`...).
  - If we train a model on cumulative energy, a reading from day 10 will look completely different from day 1 even if the appliance did the exact same thing!
  - `df["energy_kwh"].diff()` calculates the *difference* between the current row and the previous row (how much was consumed in the last 2 seconds).
  - `.fillna(0)` replaces the first row's `NaN` with 0.
  - `.clip(lower=0)` prevents negative numbers if the sensor was reset.
  - `* 1000.0` converts kilowatt-hours (kWh) into watt-hours (Wh) for easy readability.

```python
54:     return df
```
- **Line 54**: Returns the cleaned, standardized table.

---

### Function: `build_training_windows()`

```python
57: def build_training_windows(
58:     df: pd.DataFrame,
59:     window_seconds: int = 30,
60:     source_label: Optional[str] = None
61: ) -> pd.DataFrame:
```
- **Purpose**: Slices the second-by-second readings into 30-second time blocks and computes statistics for each block.

```python
66:     df = clean_raw_data(df)
67:     if df.empty:
68:         return pd.DataFrame(columns=FEATURE_COLUMNS)
```
- **Line 66–68**: Cleans the data. If there are 0 valid rows left, returns an empty table.

```python
71:     if source_label is None and "appliance" in df.columns and not df["appliance"].empty:
72:         source_label = str(df["appliance"].iloc[0])
```
- **Line 71–72**: Checks if the dataset came with an appliance label (e.g., `"Air Conditioner"` or `"Refrigerator"`).

```python
74:     df = df.set_index("timestamp")
75:     rule = f"{window_seconds}s"
```
- **Line 74–75**: Pandas requires the timestamp to be the **index** of the table to perform time-based grouping (`resample`). `rule = "30s"` tells Pandas to group every 30 seconds.

```python
77:     windows = pd.DataFrame({
78:         "voltage_mean": df["voltage"].resample(rule).mean(),
79:         "current_mean": df["current"].resample(rule).mean(),
80:         "current_max": df["current"].resample(rule).max(),
81:         "power_mean": df["power"].resample(rule).mean(),
82:         "power_max": df["power"].resample(rule).max(),
83:         "power_min": df["power"].resample(rule).min(),
84:         "power_std": df["power"].resample(rule).std().fillna(0),
85:         "energy_delta_wh": df["energy_delta_wh"].resample(rule).sum(),
86:         "frequency_mean": df["frequency"].resample(rule).mean(),
87:         "power_factor_mean": df["power_factor"].resample(rule).mean(),
88:     })
```
- **Line 77–88**: The heart of feature extraction:
  - In each 30-second bucket, about 15 raw sensor readings occurred.
  - We take their average voltage, average current, peak current, average power, peak power, minimum power, power standard deviation, total watt-hours consumed (`.sum()`), average frequency, and average power factor.

```python
91:     windows = windows.dropna()
```
- **Line 91**: Removes any 30-second window that had 0 readings (for example, if the sensor was temporarily unplugged).

```python
93:     if source_label:
94:         windows["source_appliance"] = source_label
96:     return windows.reset_index(drop=True)
```
- **Line 93–96**: Attaches the appliance name tag (for validation/analysis) and resets the table index.

---

### Function: `build_training_windows_from_folder()`

```python
99: def build_training_windows_from_folder(
100:     raw_dir: Union[str, Path] = "data/raw",
101:     window_seconds: int = 30
102: ) -> pd.DataFrame:
```
- **Purpose**: Automatically scans the `data/raw/` directory, processes **every** CSV found inside, and stitches them together into one unified training table.

```python
107:     raw_path = Path(raw_dir)
108:     csv_files = sorted(raw_path.glob("*.csv"))
109: 
110:     if not csv_files:
111:         raise FileNotFoundError(f"No CSV files found in {raw_path.resolve()}")
```
- **Line 107–111**: Finds all files ending in `.csv` inside `data/raw/`.

```python
115:     for file_path in csv_files:
116:         if file_path.stat().st_size == 0:
117:             continue
```
- **Line 115–117**: Skips any empty (0-byte) placeholder files so the code never crashes on blank files.

```python
119:             df = pd.read_csv(file_path)
120:             appliance_name = None
121:             if "appliance" in df.columns and len(df["appliance"].dropna()) > 0:
122:                 appliance_name = str(df["appliance"].dropna().iloc[0])
123:             else:
124:                 name_part = file_path.stem.replace("voltwise_", "").split("_202")[0]
125:                 appliance_name = name_part.replace("_", " ").title()
```
- **Line 119–125**: Reads the CSV file. If it doesn't have an `appliance` column inside, it smartly infers the name from the file name (e.g., `voltwise_air_conditioner_2026...csv` becomes `"Air Conditioner"`).

```python
128:             windows = build_training_windows(
129:                 df,
130:                 window_seconds=window_seconds,
131:                 source_label=appliance_name
132:             )
133:             if not windows.empty:
134:                 all_windows.append(windows)
```
- **Line 128–134**: Calls `build_training_windows()` on that file and appends the resulting windows to our master list.

```python
141:     combined = pd.concat(all_windows, ignore_index=True)
142:     return combined
```
- **Line 141–142**: Combines the windows from all files (AC windows + Refrigerator windows) into one single DataFrame.

---

### Function: `build_live_feature_row()`

```python
145: def build_live_feature_row(df: pd.DataFrame) -> pd.DataFrame:
```
- **Purpose**: When the FastAPI server receives real-time live readings from an ESP32, it holds the last 30 seconds of readings in memory. This function converts those live readings into a **1-row feature vector** so the model can predict its cluster immediately.

```python
155:     row = {
156:         "voltage_mean": float(df["voltage"].mean()),
157:         "current_mean": float(df["current"].mean()),
158:         "current_max": float(df["current"].max()),
159:         "power_mean": float(df["power"].mean()),
160:         "power_max": float(df["power"].max()),
161:         "power_min": float(df["power"].min()),
162:         "power_std": float(df["power"].std()) if len(df) > 1 else 0.0,
163:         "energy_delta_wh": float(df["energy_delta_wh"].sum()),
164:         "frequency_mean": float(df["frequency"].mean()),
165:         "power_factor_mean": float(df["power_factor"].mean()),
166:     }
168:     return pd.DataFrame([row])[FEATURE_COLUMNS]
```
- **Line 155–168**: Computes the exact same 10 features as training so the model receives identically formatted input.

---

## 3. File 2: `train.py`

### Why this file exists:
`train.py` is where the **unsupervised learning** happens. It figures out the best number of clusters ($K$), fits the model, establishes what constitutes an "anomaly", and saves the trained model to disk.

---

### Imports & Default Paths

```python
1: import argparse
2: from datetime import datetime, timezone
3: from pathlib import Path
4: from typing import Dict, Optional, Tuple
6: import joblib
7: import numpy as np
8: import pandas as pd
9: from sklearn.cluster import KMeans
10: from sklearn.metrics import silhouette_score
11: from sklearn.pipeline import Pipeline
12: from sklearn.preprocessing import StandardScaler
```
- Key tools introduced here:
  - `KMeans`: The clustering algorithm from `scikit-learn`.
  - `StandardScaler`: Normalizes all numbers so that large numbers (like `220V` or `3000W`) don't overpower small numbers (like `0.85` power factor).
  - `Pipeline`: Packages the scaler and the model together into a single object so new data is scaled automatically before prediction.
  - `silhouette_score`: Mathematical score from -1 to +1 measuring how distinct and well-separated clusters are.
  - `joblib`: Saves python model objects to disk.

---

### Function: `choose_best_k()`

```python
25: def choose_best_k(
26:     X: pd.DataFrame,
27:     min_k: int = 2,
28:     max_k: int = 6
29: ) -> Tuple[int, float, Dict[int, float]]:
```
- **Purpose**: In K-Means, the human must choose $K$ (how many clusters). Instead of guessing, this function tests $K = 2, 3, 4, 5, 6$ and picks the one with the highest **Silhouette Score**.

```python
34:     scaler = StandardScaler()
35:     X_scaled = scaler.fit_transform(X)
```
- **Line 34–35 (Critical ML Concept)**:
  - Why standard scaling is necessary:
    - Distance between $1000\text{W}$ and $1050\text{W}$ is $50$.
    - Distance between power factor $0.80$ and $0.90$ is $0.10$.
    - Without scaling, K-Means would completely ignore power factor because 50 is 500x bigger than 0.10!
  - `StandardScaler` shifts every feature to have a mean of 0 and a standard deviation of 1. Now all features are compared on equal footing.

```python
51:     for k in range(min_k, max_k + 1):
52:         kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
53:         labels = kmeans.fit_predict(X_scaled)
54:         score = float(silhouette_score(X_scaled, labels))
55:         scores[k] = round(score, 4)
56:         print(f"  • K = {k}: Silhouette Score = {score:.4f}")
58:         if score > best_score:
59:             best_score = score
60:             best_k = k
```
- **Line 51–60**:
  - Tests each $K$.
  - `random_state=42`: Makes the random initialization reproducible so you get the same result every time you run it.
  - `silhouette_score`: Checks whether points inside each cluster are tight together and far from other clusters.
  - In our dataset, $K=6$ achieved the highest score (`0.6377`), so $K=6$ was chosen.

---

### Function: `auto_label_cluster()`

```python
67: def auto_label_cluster(row: pd.Series, dominant_appliance: Optional[str] = None) -> str:
```
- **Purpose**: K-Means only outputs numbers like `Cluster 0`, `Cluster 1`. Humans prefer plain English like `"High Continuous Load (Air Conditioner)"`. This helper translates cluster statistics into intuitive names based on wattage thresholds.

```python
78:     if max_power > 2500 or power > 2000:
79:         return f"High Inrush / Peak Surge{app_tag}"
80:     elif power > 500:
81:         return f"High Continuous Load{app_tag}"
82:     elif power > 150:
83:         return f"Medium Load{app_tag}"
84:     elif power > 20:
85:         return f"Low Load / Cycling{app_tag}"
86:     else:
87:         return f"Standby / Idle{app_tag}"
```
- **Line 78–87**: Easy rules to categorize power levels.

---

### Function: `train()`

```python
90: def train(...) -> Dict:
```
- **Purpose**: Coordinates the entire training workflow from start to finish.

```python
115:     windows = build_training_windows_from_folder(raw_dir, window_seconds=window_seconds)
118:     X = windows[FEATURE_COLUMNS]
```
- **Line 115–118**: Prepares the 30-second windows and isolates the 10 feature columns into `X`.

```python
132:     best_k, best_score, scores = choose_best_k(X, min_k=min_k, max_k=max_k)
```
- **Line 132**: Runs the Silhouette analysis and finds that $K=6$ is best.

```python
136:     pipeline = Pipeline([
137:         ("scaler", StandardScaler()),
138:         ("kmeans", KMeans(
139:             n_clusters=best_k,
140:             random_state=42,
141:             n_init="auto"
142:         ))
143:     ])
144:     pipeline.fit(X)
```
- **Line 136–144**:
  - Builds a 2-step `Pipeline`:
    1. First, scale the data (`StandardScaler`).
    2. Second, apply K-Means clustering.
  - `.fit(X)` trains the model: it discovers the 6 cluster center points in 10-dimensional space!

```python
147:     labels = pipeline.predict(X)
148:     windows["cluster"] = labels
```
- **Line 147–148**: Tells each 30-second window which cluster ($0$ through $5$) it belongs to.

```python
151:     scaled_distances = pipeline.transform(X)
152:     min_distances = scaled_distances.min(axis=1)
153:     windows["anomaly_distance"] = min_distances
```
- **Line 151–153 (How Anomaly Detection Works)**:
  - `pipeline.transform(X)` computes the Euclidean distance between a sample and **all 6 cluster centers**.
  - `.min(axis=1)` picks the distance to the **closest** cluster center.
  - If a sample is close to a cluster center (e.g. distance $0.4$), it fits normal learned behavior.
  - If a sample is far from any cluster center (e.g. distance $15.0$), it is weird or abnormal!

```python
156:     distance_threshold = float(np.percentile(min_distances, 95))
157:     windows["is_anomaly"] = windows["anomaly_distance"] > distance_threshold
```
- **Line 156–157**:
  - We set the threshold at the **95th percentile** of all normal distances (in our training run, this was `1.7950`).
  - Any future reading whose distance from its nearest cluster exceeds `1.7950` will be flagged as an anomaly.

```python
197:     cluster_profiles_dict = profiles.reset_index().to_dict(orient="records")
200:     artifact = {
201:         "pipeline": pipeline,
202:         "features": FEATURE_COLUMNS,
203:         "best_k": best_k,
204:         "silhouette_score": best_score,
205:         "all_silhouette_scores": scores,
206:         "distance_threshold": distance_threshold,
207:         "window_seconds": window_seconds,
208:         "n_samples": len(windows),
209:         "cluster_profiles": cluster_profiles_dict,
210:         "trained_at": datetime.now(timezone.utc).isoformat(),
211:     }
212:     joblib.dump(artifact, model_path)
```
- **Line 197–212**: Bundles everything into a single dictionary (pipeline, features, threshold, profiles, timestamp) and saves it to `artifacts/kmeans_pipeline.joblib`.

---

### CLI Execution Block

```python
230: if __name__ == "__main__":
231:     parser = argparse.ArgumentParser(...)
...
239:     train(...)
```
- **Line 230–246**: Allows you to run training directly from your terminal:
  - `python train.py` (runs default training)
  - `python train.py --k 4` (forces 4 clusters)
  - `python train.py --window-seconds 15` (uses 15-second windows)

---

## 4. File 3: `app/main.py`

### Why this file exists:
A trained model saved in a `.joblib` file doesn't do anything on its own. `app/main.py` is a **FastAPI web server** that exposes HTTP endpoints. Any app, frontend, or backend (Express API) can send JSON sensor readings and get instant AI predictions back.

---

### State Management & Lifespan

```python
24: # Global state
25: model_state: Dict[str, Any] = {
26:     "loaded": False,
27:     "pipeline": None,
28:     "features": FEATURE_COLUMNS,
...
34: }
```
- **Line 25–34**: A dictionary in RAM that keeps the loaded model ready in memory so it can answer requests in 2 milliseconds without re-reading the hard drive every time.

```python
37: telemetry_buffers: Dict[str, List[dict]] = {}
38: MIN_READINGS_FOR_INFERENCE = 3
```
- **Line 37–38**: A **sliding window buffer**. When an ESP32 sends live sensor readings every 2 seconds, we store the latest readings here. Once we have at least 3 readings within the last 30 seconds, we compute the window features and predict the state.

```python
41: def load_model_artifacts() -> bool:
```
- **Line 41–62**: Reads `artifacts/kmeans_pipeline.joblib` using `joblib.load()` and populates `model_state`.

```python
68: @asynccontextmanager
69: async def lifespan(app: FastAPI):
70:     load_model_artifacts()
71:     yield
74:     telemetry_buffers.clear()
```
- **Line 68–74**: FastAPI lifespan event: automatically runs when the server boots up and cleans up memory when the server shuts down.

---

### Data Models (Pydantic Schemas)

FastAPI uses Pydantic to ensure incoming HTTP requests have valid data types.

```python
98: class TelemetryReading(BaseModel):
99:     panel_id: str = Field(default="main-panel", description="ID of monitored panel")
100:    timestamp: Optional[datetime] = Field(...)
101:    voltage: float
102:    current: float
103:    power: float
104:    energy_kwh: float
105:    frequency: float = 60.0
106:    power_factor: float = 0.9
```
- **Line 98–106**: Defines what an incoming sensor reading must look like. If someone sends `"power": "apple"`, FastAPI automatically rejects it with a 422 Unprocessable Entity error!

---

### Inference Helpers

```python
150: def format_prediction_result(feature_df: pd.DataFrame) -> Dict[str, Any]:
```
- **Purpose**: Takes a 1-row table of features and runs the ML math:

```python
158:     cluster = int(pipeline.predict(feature_df)[0])
```
- **Line 158**: `pipeline.predict()` automatically scales the numbers and predicts the nearest cluster ID (e.g. $0$).

```python
160:     distances = pipeline.transform(feature_df)
161:     nearest_distance = float(distances.min(axis=1)[0])
163:     threshold = model_state["distance_threshold"]
164:     is_anomaly = nearest_distance > threshold
```
- **Line 160–164**: Checks Euclidean distance. If the distance from the nearest cluster is greater than `1.7950`, `is_anomaly = True`.

```python
170:     if is_anomaly:
171:         alert_level = "warning"
172:         message = f"Unusual electrical pattern detected..."
173:     else:
174:         alert_level = "normal"
175:         message = f"Normal electrical pattern aligned with {interpretation}."
```
- **Line 170–175**: Assigns clear alert levels (`normal` vs `warning`).

---

### Endpoints

1. **`GET /health`** (Line 204):
   - Returns whether the model is loaded in memory, active buffer count, and threshold.
2. **`GET /clusters`** (Line 217):
   - Returns the profile and plain-English label for all 6 learned clusters.
3. **`POST /predict`** (Line 229):
   - For batch or pre-aggregated data: you provide the 10 features directly, and it returns the prediction immediately.
4. **`POST /telemetry`** (Line 244):
   - **The primary live endpoint**:
     - Step 1: Takes one live reading from the ESP32 / PZEM.
     - Step 2: Adds it to `telemetry_buffers[panel_id]`.
     - Step 3: Deletes any readings older than 30 seconds.
     - Step 4: If there are fewer than 3 readings, returns `"status": "warming_up"`.
     - Step 5: If there are $\ge 3$ readings, calculates `build_live_feature_row()` and returns the predicted cluster and anomaly status in real time.
5. **`POST /train`** (Line 293):
   - Allows retraining the model via an API call without opening a terminal.

---

## 5. Summary Cheatsheet

| Concept | What It Does In VoltWise |
|---|---|
| **PZEM-004T** | Hardware electrical sensor (reads Volts, Amps, Watts, kWh). |
| **Windowing (30s)** | Combines 15 raw readings into stable summary statistics so electrical noise doesn't confuse the model. |
| **`energy_delta_wh`** | Calculates energy consumed *in that 30 seconds* instead of cumulative lifetime energy. |
| **StandardScaler** | Normalizes all 10 features to equal scale (mean 0, std 1). |
| **K-Means Clustering** | Unsupervised algorithm that groups similar electrical patterns together without needing manual labels. |
| **Silhouette Score** | Metric (-1 to +1) that tested $K=2..6$ and verified that **$K=6$** cleanly separated our AC and Fridge states. |
| **Euclidean Distance** | Distance in 10-dimensional space between a new reading and its closest cluster center. |
| **Anomaly Threshold (`1.7950`)** | The 95th percentile distance. If a reading is further than `1.7950` from any learned cluster, it's flagged as an anomaly. |
| **`joblib` Artifact** | Serialized binary file containing the trained pipeline ready for live inference. |
