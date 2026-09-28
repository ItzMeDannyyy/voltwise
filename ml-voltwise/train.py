import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from feature_engineering import (
    FEATURE_COLUMNS,
    build_training_windows_from_folder,
)

DEFAULT_RAW_DIR = Path("data/raw")
DEFAULT_PROCESSED_FILE = Path("data/processed/windows.csv")
DEFAULT_MODEL_FILE = Path("artifacts/kmeans_pipeline.joblib")
DEFAULT_PROFILES_FILE = Path("artifacts/cluster_profiles.csv")


def choose_best_k(
    X: pd.DataFrame,
    min_k: int = 2,
    max_k: int = 6
) -> Tuple[int, float, Dict[int, float]]:
    """
    Evaluates KMeans clustering across different K values using the silhouette score
    and returns the best K and score.
    """
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Ensure max_k is valid for dataset size
    n_samples = len(X)
    max_k = min(max_k, n_samples - 1)
    if min_k > max_k:
        min_k = 2

    scores: Dict[int, float] = {}
    best_k = min_k
    best_score = -1.0

    print("--------------------------------------------------")
    print("Evaluating K-Means clustering (Silhouette Analysis)")
    print("--------------------------------------------------")

    for k in range(min_k, max_k + 1):
        kmeans = KMeans(n_clusters=k, random_state=42, n_init="auto")
        labels = kmeans.fit_predict(X_scaled)
        score = float(silhouette_score(X_scaled, labels))
        scores[k] = round(score, 4)
        print(f"  • K = {k}: Silhouette Score = {score:.4f}")

        if score > best_score:
            best_score = score
            best_k = k

    print(f"Optimal K selected: {best_k} (Silhouette Score: {best_score:.4f})")
    print("--------------------------------------------------\n")
    return best_k, best_score, scores


def auto_label_cluster(row: pd.Series, dominant_appliance: Optional[str] = None) -> str:
    """
    Generates a concise human-readable description for a cluster
    based on its power, current, and dominant appliance.
    """
    power = row.get("power_mean", 0.0)
    max_power = row.get("power_max", 0.0)
    pf = row.get("power_factor_mean", 1.0)

    app_tag = f" ({dominant_appliance})" if dominant_appliance else ""

    if max_power > 2500 or power > 2000:
        return f"High Inrush / Peak Surge{app_tag}"
    elif power > 500:
        return f"High Continuous Load{app_tag}"
    elif power > 150:
        return f"Medium Load{app_tag}"
    elif power > 20:
        return f"Low Load / Cycling{app_tag}"
    else:
        return f"Standby / Idle{app_tag}"


def train(
    raw_dir: Path = DEFAULT_RAW_DIR,
    processed_path: Path = DEFAULT_PROCESSED_FILE,
    model_path: Path = DEFAULT_MODEL_FILE,
    profiles_path: Path = DEFAULT_PROFILES_FILE,
    window_seconds: int = 30,
    min_k: int = 2,
    max_k: int = 6,
    exact_k: Optional[int] = None,
) -> Dict:
    """
    Executes the full machine learning training flow:
    1. Ingests all raw sensor CSVs in `raw_dir`.
    2. Builds 30-second feature windows.
    3. Saves processed feature table to `processed_path`.
    4. Finds optimal K (or uses specified K).
    5. Trains StandardScaler + KMeans pipeline.
    6. Calculates anomaly distance threshold (95th percentile).
    7. Computes cluster profiles and auto-labels.
    8. Exports model artifact and cluster summary CSV.
    """
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    model_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"\n[1/5] Ingesting raw sensor data from: {raw_dir.resolve()}...")
    windows = build_training_windows_from_folder(raw_dir, window_seconds=window_seconds)
    print(f"      Extracted {len(windows)} windows ({window_seconds}s each) across datasets.")

    X = windows[FEATURE_COLUMNS]

    # Select K
    if exact_k is not None:
        best_k = exact_k
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        km_temp = KMeans(n_clusters=best_k, random_state=42, n_init="auto")
        labels_temp = km_temp.fit_predict(X_scaled)
        best_score = float(silhouette_score(X_scaled, labels_temp))
        scores = {best_k: best_score}
        print(f"\n[2/5] Using requested K={best_k} (Silhouette Score: {best_score:.4f})")
    else:
        print(f"\n[2/5] Finding optimal K between {min_k} and {max_k}...")
        best_k, best_score, scores = choose_best_k(X, min_k=min_k, max_k=max_k)

    # Train Pipeline
    print(f"[3/5] Fitting StandardScaler + KMeans(n_clusters={best_k}) pipeline...")
    pipeline = Pipeline([
        ("scaler", StandardScaler()),
        ("kmeans", KMeans(
            n_clusters=best_k,
            random_state=42,
            n_init="auto"
        ))
    ])
    pipeline.fit(X)

    # Assign clusters
    labels = pipeline.predict(X)
    windows["cluster"] = labels

    # Compute Euclidean distance to assigned cluster centroid in scaled feature space
    scaled_distances = pipeline.transform(X)
    min_distances = scaled_distances.min(axis=1)
    windows["anomaly_distance"] = min_distances

    # 95th percentile anomaly threshold
    distance_threshold = float(np.percentile(min_distances, 95))
    windows["is_anomaly"] = windows["anomaly_distance"] > distance_threshold

    # Save processed dataset
    windows.to_csv(processed_path, index=False)
    print(f"      Saved processed windowed dataset to: {processed_path}")

    # Build cluster profiles
    print("\n[4/5] Profiling clusters and generating interpretations...")
    profile_cols = FEATURE_COLUMNS + ["anomaly_distance"]
    profiles = windows.groupby("cluster")[profile_cols].mean().round(2)
    profiles["count"] = windows.groupby("cluster").size()

    # Determine dominant appliance per cluster if available
    dominant_apps: Dict[int, str] = {}
    if "source_appliance" in windows.columns:
        for c in range(best_k):
            sub = windows[windows["cluster"] == c]
            if not sub.empty:
                counts = sub["source_appliance"].value_counts()
                top_app = counts.index[0]
                dominant_apps[c] = top_app

    # Generate human readable labels
    descriptions = []
    dominant_app_list = []
    for c in profiles.index:
        app = dominant_apps.get(c, "Unknown")
        label = auto_label_cluster(profiles.loc[c], dominant_appliance=app)
        descriptions.append(label)
        dominant_app_list.append(app)

    profiles["dominant_appliance"] = dominant_app_list
    profiles["interpretation"] = descriptions

    # Save cluster profiles CSV
    profiles.to_csv(profiles_path)
    print(f"      Saved cluster profiles to: {profiles_path}")

    # Save model artifact
    print(f"\n[5/5] Saving model pipeline artifact to: {model_path}...")
    cluster_profiles_dict = profiles.reset_index().to_dict(orient="records")

    artifact = {
        "pipeline": pipeline,
        "features": FEATURE_COLUMNS,
        "best_k": best_k,
        "silhouette_score": best_score,
        "all_silhouette_scores": scores,
        "distance_threshold": distance_threshold,
        "window_seconds": window_seconds,
        "n_samples": len(windows),
        "cluster_profiles": cluster_profiles_dict,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    joblib.dump(artifact, model_path)
    print("      Model artifact successfully serialized.")

    # Print summary
    print("\n" + "=" * 65)
    print(f"VoltWise KMeans Model Training Completed Successfully!")
    print("=" * 65)
    print(f"Clusters (K):          {best_k}")
    print(f"Silhouette Score:      {best_score:.4f}")
    print(f"Anomaly Threshold:     {distance_threshold:.4f} (95th percentile distance)")
    print(f"Total Window Samples:  {len(windows)}")
    print("\nCluster Profiles Summary:")
    display_cols = ["power_mean", "current_mean", "power_factor_mean", "count", "interpretation"]
    print(profiles[display_cols].to_string())
    print("=" * 65 + "\n")

    return artifact


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train VoltWise KMeans Clustering Model")
    parser.add_argument("--raw-dir", type=Path, default=DEFAULT_RAW_DIR, help="Directory containing raw sensor CSV files")
    parser.add_argument("--window-seconds", type=int, default=30, help="Window duration in seconds")
    parser.add_argument("--min-k", type=int, default=2, help="Minimum K to evaluate")
    parser.add_argument("--max-k", type=int, default=6, help="Maximum K to evaluate")
    parser.add_argument("--k", type=int, default=None, help="Explicit K override (skips silhouette selection)")
    args = parser.parse_args()

    train(
        raw_dir=args.raw_dir,
        window_seconds=args.window_seconds,
        min_k=args.min_k,
        max_k=args.max_k,
        exact_k=args.k,
    )
