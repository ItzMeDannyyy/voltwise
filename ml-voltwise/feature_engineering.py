import glob
from pathlib import Path
from typing import List, Optional, Union
import numpy as np
import pandas as pd

# The 10 engineered features derived from PZEM-004T raw telemetry
FEATURE_COLUMNS: List[str] = [
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

# Map sensor column names to standard internal names
COLUMN_MAPPINGS = {
    "voltage_v": "voltage",
    "current_a": "current",
    "power_watts": "power",
    "frequency_hz": "frequency",
}


def clean_raw_data(df: pd.DataFrame) -> pd.DataFrame:
    """
    Standardizes column names, cleans timestamps, sorts chronologically,
    and computes energy_delta_wh from cumulative energy_kwh.
    """
    df = df.copy()

    # Normalize column names
    df = df.rename(columns=COLUMN_MAPPINGS)

    # Ensure required columns exist
    required_cols = ["timestamp", "voltage", "current", "power", "energy_kwh", "frequency", "power_factor"]
    missing = [col for col in required_cols if col not in df.columns]
    if missing:
        raise ValueError(f"Missing required columns in dataset: {missing}")

    # Parse timestamps
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, errors="coerce")
    df = df.dropna(subset=["timestamp"])
    df = df.sort_values("timestamp")

    # Cumulative energy (kWh) to window delta (Wh)
    df["energy_delta_wh"] = df["energy_kwh"].diff().fillna(0).clip(lower=0) * 1000.0

    return df


def build_training_windows(
    df: pd.DataFrame,
    window_seconds: int = 30,
    source_label: Optional[str] = None
) -> pd.DataFrame:
    """
    Converts second-by-second readings into window-based features.
    Summarizing over a time window (e.g., 30s) stabilizes high-frequency fluctuations.
    """
    df = clean_raw_data(df)
    if df.empty:
        return pd.DataFrame(columns=FEATURE_COLUMNS)

    # Identify appliance label if present
    if source_label is None and "appliance" in df.columns and not df["appliance"].empty:
        source_label = str(df["appliance"].iloc[0])

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

    # Drop empty windows (where no readings fell in that time bucket)
    windows = windows.dropna()

    if source_label:
        windows["source_appliance"] = source_label

    return windows.reset_index(drop=True)


def build_training_windows_from_folder(
    raw_dir: Union[str, Path] = "data/raw",
    window_seconds: int = 30
) -> pd.DataFrame:
    """
    Loads all CSV files from the raw dataset directory and aggregates them
    into a unified training DataFrame.
    """
    raw_path = Path(raw_dir)
    csv_files = sorted(raw_path.glob("*.csv"))

    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {raw_path.resolve()}")

    all_windows: List[pd.DataFrame] = []

    for file_path in csv_files:
        if file_path.stat().st_size == 0:
            continue
        try:
            df = pd.read_csv(file_path)
            appliance_name = None
            if "appliance" in df.columns and len(df["appliance"].dropna()) > 0:
                appliance_name = str(df["appliance"].dropna().iloc[0])
            else:
                # Infer from filename (e.g. voltwise_air_conditioner_... -> Air Conditioner)
                name_part = file_path.stem.replace("voltwise_", "").split("_202")[0]
                appliance_name = name_part.replace("_", " ").title()

            windows = build_training_windows(
                df,
                window_seconds=window_seconds,
                source_label=appliance_name
            )
            if not windows.empty:
                all_windows.append(windows)
        except Exception as e:
            print(f"Warning: Failed to process {file_path.name}: {e}")

    if not all_windows:
        raise ValueError(f"No valid data could be processed from {raw_path.resolve()}")

    combined = pd.concat(all_windows, ignore_index=True)
    return combined


def build_live_feature_row(df: pd.DataFrame) -> pd.DataFrame:
    """
    Builds a single feature row from live telemetry readings inside a sliding buffer.
    Used by the FastAPI inference service.
    """
    df = clean_raw_data(df)

    if df.empty:
        raise ValueError("No valid telemetry readings available.")

    row = {
        "voltage_mean": float(df["voltage"].mean()),
        "current_mean": float(df["current"].mean()),
        "current_max": float(df["current"].max()),
        "power_mean": float(df["power"].mean()),
        "power_max": float(df["power"].max()),
        "power_min": float(df["power"].min()),
        "power_std": float(df["power"].std()) if len(df) > 1 else 0.0,
        "energy_delta_wh": float(df["energy_delta_wh"].sum()),
        "frequency_mean": float(df["frequency"].mean()),
        "power_factor_mean": float(df["power_factor"].mean()),
    }

    return pd.DataFrame([row])[FEATURE_COLUMNS]
