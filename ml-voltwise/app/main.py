from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys
from typing import Any, Dict, List, Optional

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure root directory of ml-voltwise is in sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from feature_engineering import FEATURE_COLUMNS, build_live_feature_row
from train import train as run_training

MODEL_PATH = BASE_DIR / "artifacts" / "kmeans_pipeline.joblib"
PROFILES_PATH = BASE_DIR / "artifacts" / "cluster_profiles.csv"

# Global state
model_state: Dict[str, Any] = {
    "loaded": False,
    "pipeline": None,
    "features": FEATURE_COLUMNS,
    "best_k": None,
    "distance_threshold": 1.5,
    "window_seconds": 30,
    "cluster_profiles": [],
    "trained_at": None,
}

# Live telemetry sliding buffers: { panel_id: [reading_dict, ...] }
telemetry_buffers: Dict[str, List[dict]] = {}
MIN_READINGS_FOR_INFERENCE = 3


def load_model_artifacts() -> bool:
    """Loads the trained model pipeline and cluster metadata."""
    if not MODEL_PATH.exists():
        print(f"[VoltWise ML] Warning: Model artifact not found at {MODEL_PATH}")
        return False

    try:
        artifact = joblib.load(MODEL_PATH)
        model_state["pipeline"] = artifact["pipeline"]
        model_state["features"] = artifact.get("features", FEATURE_COLUMNS)
        model_state["best_k"] = artifact.get("best_k", 0)
        model_state["distance_threshold"] = float(artifact.get("distance_threshold", 1.5))
        model_state["window_seconds"] = int(artifact.get("window_seconds", 30))
        model_state["cluster_profiles"] = artifact.get("cluster_profiles", [])
        model_state["trained_at"] = artifact.get("trained_at")
        model_state["loaded"] = True
        print(f"[VoltWise ML] Successfully loaded model with K={model_state['best_k']}.")
        return True
    except Exception as e:
        print(f"[VoltWise ML] Error loading model: {e}")
        return False


# Auto-load model on module import if artifact is available
load_model_artifacts()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Load pre-trained model
    load_model_artifacts()
    yield
    # Shutdown: Clean up if needed
    telemetry_buffers.clear()


app = FastAPI(
    title="VoltWise KMeans Clustering ML API",
    description="Machine learning service for smart energy load clustering and anomaly detection using PZEM-004T telemetry.",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for cross-service communication (backend API / app)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# Request / Response Schemas
# ---------------------------------------------------------

class TelemetryReading(BaseModel):
    panel_id: str = Field(default="main-panel", description="ID of the monitored panel or outlet")
    timestamp: Optional[datetime] = Field(default_factory=lambda: datetime.now(timezone.utc))
    voltage: float = Field(..., description="Voltage in Volts (e.g., 230.0)")
    current: float = Field(..., description="Current in Amperes (e.g., 2.5)")
    power: float = Field(..., description="Active power in Watts (e.g., 550.0)")
    energy_kwh: float = Field(..., description="Cumulative energy reading in kWh (e.g., 0.45)")
    frequency: float = Field(default=60.0, description="Grid frequency in Hz (e.g., 60.0)")
    power_factor: float = Field(default=0.9, description="Power factor between 0.0 and 1.0 (e.g., 0.85)")


class FeatureVectorInput(BaseModel):
    voltage_mean: float
    current_mean: float
    current_max: float
    power_mean: float
    power_max: float
    power_min: float
    power_std: float
    energy_delta_wh: float
    frequency_mean: float
    power_factor_mean: float


class PredictionResponse(BaseModel):
    cluster: int
    interpretation: str
    nearest_distance: float
    distance_threshold: float
    is_anomaly: bool
    alert_level: str
    message: str


class TrainRequest(BaseModel):
    window_seconds: int = 30
    min_k: int = 2
    max_k: int = 6
    exact_k: Optional[int] = None


# ---------------------------------------------------------
# Helper Functions
# ---------------------------------------------------------

def get_cluster_meta(cluster_id: int) -> Dict[str, Any]:
    for cp in model_state.get("cluster_profiles", []):
        if cp.get("cluster") == cluster_id:
            return cp
    return {"cluster": cluster_id, "interpretation": f"Cluster {cluster_id}"}


def format_prediction_result(feature_df: pd.DataFrame) -> Dict[str, Any]:
    if not model_state["loaded"] or model_state["pipeline"] is None:
        raise HTTPException(
            status_code=503,
            detail="Model is not loaded. Train the model first via POST /train or python train.py."
        )

    pipeline = model_state["pipeline"]
    cluster = int(pipeline.predict(feature_df)[0])

    distances = pipeline.transform(feature_df)
    nearest_distance = float(distances.min(axis=1)[0])

    threshold = model_state["distance_threshold"]
    is_anomaly = nearest_distance > threshold

    cluster_info = get_cluster_meta(cluster)
    interpretation = cluster_info.get("interpretation", f"Cluster {cluster}")

    if is_anomaly:
        alert_level = "warning"
        message = f"Unusual electrical pattern detected (distance {nearest_distance:.2f} > threshold {threshold:.2f})."
    else:
        alert_level = "normal"
        message = f"Normal electrical pattern aligned with {interpretation}."

    return {
        "cluster": cluster,
        "interpretation": interpretation,
        "dominant_appliance": cluster_info.get("dominant_appliance", "Unknown"),
        "nearest_distance": round(nearest_distance, 4),
        "distance_threshold": round(threshold, 4),
        "is_anomaly": is_anomaly,
        "alert_level": alert_level,
        "message": message,
    }


# ---------------------------------------------------------
# API Routes
# ---------------------------------------------------------

@app.get("/")
def index():
    return {
        "service": "VoltWise ML Clustering Service",
        "model_type": "K-Means Unsupervised Clustering & Anomaly Detection",
        "status": "ready" if model_state["loaded"] else "model_not_trained",
        "clusters_count": model_state["best_k"],
        "trained_at": model_state["trained_at"],
        "docs_url": "/docs",
    }


@app.get("/health")
def health_check():
    return {
        "status": "ok",
        "model_loaded": model_state["loaded"],
        "best_k": model_state["best_k"],
        "distance_threshold": model_state["distance_threshold"],
        "features": model_state["features"],
        "window_seconds": model_state["window_seconds"],
        "active_panel_buffers": list(telemetry_buffers.keys()),
    }


@app.get("/clusters")
def get_clusters():
    if not model_state["loaded"]:
        raise HTTPException(status_code=503, detail="Model is not yet trained or loaded.")

    return {
        "best_k": model_state["best_k"],
        "distance_threshold": model_state["distance_threshold"],
        "clusters": model_state["cluster_profiles"],
    }


@app.post("/predict")
def predict_features(input_data: FeatureVectorInput):
    """
    Directly predicts the cluster and anomaly status for a pre-computed feature window.
    """
    row_dict = input_data.model_dump()
    feature_df = pd.DataFrame([row_dict])[FEATURE_COLUMNS]
    result = format_prediction_result(feature_df)
    return {
        "status": "success",
        "features": row_dict,
        "prediction": result,
    }


@app.post("/telemetry")
def stream_telemetry(reading: TelemetryReading):
    """
    Receives live raw telemetry readings from sensor / MQTT bridge / backend.
    Maintains a rolling time window per panel, extracts window features,
    and returns real-time cluster inference and anomaly alerts.
    """
    panel_id = reading.panel_id
    reading_dict = reading.model_dump()
    current_time = reading_dict["timestamp"]

    if panel_id not in telemetry_buffers:
        telemetry_buffers[panel_id] = []

    # Store incoming reading
    telemetry_buffers[panel_id].append(reading_dict)

    # Prune readings older than the time window
    window_sec = model_state.get("window_seconds", 30)
    cutoff = current_time - timedelta(seconds=window_sec)
    telemetry_buffers[panel_id] = [
        r for r in telemetry_buffers[panel_id]
        if r["timestamp"] >= cutoff
    ]

    buffer_len = len(telemetry_buffers[panel_id])
    if buffer_len < MIN_READINGS_FOR_INFERENCE:
        return {
            "status": "warming_up",
            "panel_id": panel_id,
            "readings_collected": buffer_len,
            "minimum_required": MIN_READINGS_FOR_INFERENCE,
            "message": f"Buffering live readings ({buffer_len}/{MIN_READINGS_FOR_INFERENCE} collected).",
        }

    # Build feature row from active buffer
    df_buffer = pd.DataFrame(telemetry_buffers[panel_id])
    feature_df = build_live_feature_row(df_buffer)

    prediction = format_prediction_result(feature_df)
    return {
        "status": "predicted",
        "panel_id": panel_id,
        "readings_in_window": buffer_len,
        "features": feature_df.iloc[0].round(3).to_dict(),
        "prediction": prediction,
    }


@app.post("/train")
def train_model_endpoint(req: TrainRequest):
    """
    Triggers model training using the datasets in data/raw.
    """
    try:
        artifact = run_training(
            raw_dir=BASE_DIR / "data" / "raw",
            processed_path=BASE_DIR / "data" / "processed" / "windows.csv",
            model_path=MODEL_PATH,
            profiles_path=PROFILES_PATH,
            window_seconds=req.window_seconds,
            min_k=req.min_k,
            max_k=req.max_k,
            exact_k=req.exact_k,
        )
        load_model_artifacts()
        return {
            "status": "success",
            "message": "Model trained and reloaded successfully.",
            "best_k": artifact["best_k"],
            "silhouette_score": artifact["silhouette_score"],
            "distance_threshold": artifact["distance_threshold"],
            "n_samples": artifact["n_samples"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
