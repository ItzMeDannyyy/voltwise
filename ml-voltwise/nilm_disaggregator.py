import json
import math
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans

DEFAULT_RAW_DIR = Path("data/raw")
DEFAULT_CENTROIDS_FILE = Path("artifacts/nilm_centroids.json")


def compute_reactive_power(voltage: float, current: float, active_power: float) -> float:
    """
    Computes linearly additive Reactive Power (Q in VAR) from
    Apparent Power (S = V * I) and Active Power (P in W) via the Power Triangle:
        Q = sqrt(max(0, S^2 - P^2))
    """
    s = float(voltage) * float(current)
    diff = s * s - float(active_power) * float(active_power)
    return float(math.sqrt(max(0.0, diff)))


def normalize_appliance_name(raw_name: str) -> str:
    """Maps dataset filename / appliance column to standard user-friendly appliance label."""
    n = raw_name.lower().replace("_", " ")
    if "cell" in n or "phone" in n or "charg" in n or "samsung" in n:
        return "Phone Charger"
    elif "light" in n or "bulb" in n or "lamp" in n:
        return "Light Bulb"
    elif "air" in n or "conditioner" in n or "ac" in n:
        return "Air Conditioner"
    elif "refrigerator" in n or "fridge" in n:
        return "Refrigerator"
    elif "kettle" in n:
        return "Electric Kettle"
    return raw_name.title()


def extract_nilm_centroids(
    raw_dir: Path = DEFAULT_RAW_DIR,
    output_path: Path = DEFAULT_CENTROIDS_FILE
) -> List[Dict[str, Any]]:
    """
    Extracts isolated appliance state centroids (mu_P, mu_Q, mu_I) and
    tolerance radii (r_max) from per-appliance CSV files in raw_dir.
    Filters out the OFF state (< 3.0 W) and uses K-Means for multi-mode appliances.
    """
    raw_path = Path(raw_dir)
    csv_files = sorted(raw_path.glob("*.csv"))
    if not csv_files:
        raise FileNotFoundError(f"No CSV files found in {raw_path.resolve()}")

    appliance_data: Dict[str, List[pd.DataFrame]] = {}

    for file_path in csv_files:
        if file_path.stat().st_size == 0:
            continue
        try:
            df = pd.read_csv(file_path)
            # Infer appliance name
            if "appliance" in df.columns and len(df["appliance"].dropna()) > 0:
                raw_app = str(df["appliance"].dropna().iloc[0])
            else:
                stem = file_path.stem.replace("voltwise_", "").split("_202")[0]
                raw_app = stem.replace("_", " ").title()

            app_name = normalize_appliance_name(raw_app)

            # Ensure standard column names
            v_col = "voltage_v" if "voltage_v" in df.columns else ("voltage" if "voltage" in df.columns else None)
            i_col = "current_a" if "current_a" in df.columns else ("current" if "current" in df.columns else None)
            p_col = "power_watts" if "power_watts" in df.columns else ("power" if "power" in df.columns else None)
            pf_col = "power_factor" if "power_factor" in df.columns else None

            if not (v_col and i_col and p_col):
                continue

            clean_df = pd.DataFrame({
                "voltage": df[v_col].astype(float),
                "current": df[i_col].astype(float),
                "power": df[p_col].astype(float),
                "power_factor": df[pf_col].astype(float) if pf_col else 0.9,
            })

            # Calculate Q for every sample
            clean_df["q_var"] = [
                compute_reactive_power(v, i, p)
                for v, i, p in zip(clean_df["voltage"], clean_df["current"], clean_df["power"])
            ]

            if app_name not in appliance_data:
                appliance_data[app_name] = []
            appliance_data[app_name].append(clean_df)

        except Exception as e:
            print(f"[NILM] Warning: could not parse {file_path.name}: {e}")

    centroids: List[Dict[str, Any]] = []

    for app_name, dfs in appliance_data.items():
        combined = pd.concat(dfs, ignore_index=True)
        # Filter out the OFF state (< 5.0 W)
        active = combined[combined["power"] >= 5.0].copy()
        if active.empty:
            continue

        # Simple ON/OFF loads use K=1; cycling compressors or multi-speed loads use K=2
        n_states = 2 if app_name == "Refrigerator" else 1

        if n_states > 1 and len(active) >= 30:
            km = KMeans(n_clusters=n_states, random_state=42, n_init="auto")
            labels = km.fit_predict(active[["power", "q_var"]])
            for k in range(n_states):
                sub = active[labels == k]
                mu_p = float(sub["power"].mean())
                mu_q = float(sub["q_var"].mean())
                mu_i = float(sub["current"].mean())
                mu_v = float(sub["voltage"].mean())
                mu_pf = float(sub["power_factor"].mean())
                std_p = float(sub["power"].std()) if len(sub) > 1 else 1.0
                std_q = float(sub["q_var"].std()) if len(sub) > 1 else 1.0

                # Tolerance radius r_max: minimum buffer of 10.0 or 2.5 standard deviations
                r_max = float(max(10.0, 2.5 * math.sqrt(std_p**2 + std_q**2)))

                centroids.append({
                    "id": f"{app_name.lower().replace(' ', '_')}_mode_{k+1}",
                    "appliance": f"{app_name} (Mode {k+1})" if n_states > 1 else app_name,
                    "category": app_name,
                    "mu_p": round(mu_p, 2),
                    "mu_q": round(mu_q, 2),
                    "mu_i": round(mu_i, 3),
                    "mu_v": round(mu_v, 1),
                    "mu_pf": round(mu_pf, 2),
                    "std_p": round(std_p, 2),
                    "std_q": round(std_q, 2),
                    "tolerance_radius": round(r_max, 2),
                    "sample_count": len(sub),
                })
        else:
            mu_p = float(active["power"].mean())
            mu_q = float(active["q_var"].mean())
            mu_i = float(active["current"].mean())
            mu_v = float(active["voltage"].mean())
            mu_pf = float(active["power_factor"].mean())
            std_p = float(active["power"].std()) if len(active) > 1 else 0.5
            std_q = float(active["q_var"].std()) if len(active) > 1 else 0.5

            # Tight tolerance for phone / bulb to keep them distinct, minimum 1.5W
            if "phone" in app_name.lower():
                r_max = float(max(2.5, 2.5 * math.sqrt(std_p**2 + std_q**2)))
            elif "bulb" in app_name.lower() or "light" in app_name.lower():
                r_max = float(max(1.8, 2.5 * math.sqrt(std_p**2 + std_q**2)))
            else:
                r_max = float(max(15.0, 2.5 * math.sqrt(std_p**2 + std_q**2)))

            centroids.append({
                "id": app_name.lower().replace(" ", "_"),
                "appliance": app_name,
                "category": app_name,
                "mu_p": round(mu_p, 2),
                "mu_q": round(mu_q, 2),
                "mu_i": round(mu_i, 3),
                "mu_v": round(mu_v, 1),
                "mu_pf": round(mu_pf, 2),
                "std_p": round(std_p, 2),
                "std_q": round(std_q, 2),
                "tolerance_radius": round(r_max, 2),
                "sample_count": len(active),
            })

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(centroids, f, indent=2)

    print(f"[NILM] Extracted {len(centroids)} appliance centroids to {output_path}")
    return centroids


class NILMEventDisaggregator:
    """
    Real-time event-based NILM disaggregation engine implementing the
    Power-Plane (delta P vs delta Q) finite differencing and Euclidean
    distance classification from Hart (1992).
    """

    def __init__(
        self,
        centroids: Optional[List[Dict[str, Any]]] = None,
        centroids_file: Path = DEFAULT_CENTROIDS_FILE,
        noise_deadband_watts: float = 5.0,
    ):
        self.noise_deadband = noise_deadband_watts
        self.centroids_file = Path(centroids_file)

        if centroids is not None:
            self.centroids = centroids
        elif self.centroids_file.exists():
            with open(self.centroids_file, "r", encoding="utf-8") as f:
                self.centroids = json.load(f)
        else:
            self.centroids = []

        # Per-panel state tracking
        # panel_id -> { "baseline_p": float, "baseline_q": float, "active_appliances": set[str] }
        self.panel_states: Dict[str, Dict[str, Any]] = {}

    def load_centroids(self) -> bool:
        if self.centroids_file.exists():
            with open(self.centroids_file, "r", encoding="utf-8") as f:
                self.centroids = json.load(f)
            return True
        return False

    def get_or_create_panel_state(self, panel_id: str, initial_p: float, initial_q: float) -> Dict[str, Any]:
        if panel_id not in self.panel_states:
            self.panel_states[panel_id] = {
                "baseline_p": float(initial_p),
                "baseline_q": float(initial_q),
                "active_appliances": set(),
                "last_event": None,
            }
        return self.panel_states[panel_id]

    def process_reading(
        self,
        voltage: float,
        current: float,
        power: float,
        panel_id: str = "main-panel",
        q_var: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Feeds one telemetry sample through event step detection (delta P, delta Q)
        and classifies it against the learned appliance centroids using Euclidean distance.
        """
        if q_var is None:
            q_var = compute_reactive_power(voltage, current, power)

        state = self.get_or_create_panel_state(panel_id, power, q_var)
        baseline_p = state["baseline_p"]
        baseline_q = state["baseline_q"]

        # Finite difference: delta P = P_t - P_{t-1}, delta Q = Q_t - Q_{t-1}
        delta_p = power - baseline_p
        delta_q = q_var - baseline_q

        abs_dp = abs(delta_p)
        is_event = abs_dp >= self.noise_deadband

        if not is_event:
            # Steady state: absorb gradual sensor drift (0.15 EMA factor)
            state["baseline_p"] += delta_p * 0.15
            state["baseline_q"] += delta_q * 0.15
            transition = "STEADY"
            matched_app = None
            is_match = False
            candidates = []
        else:
            # Step event detected!
            transition = "ON" if delta_p > 0 else "OFF"
            abs_dq = abs(delta_q)

            # Classify event using Euclidean distance against all learned centroids
            candidates = []
            best_match: Optional[Dict[str, Any]] = None
            min_dist = float("inf")

            for c in self.centroids:
                mu_p = c["mu_p"]
                mu_q = c["mu_q"]
                r_max = c["tolerance_radius"]

                # Euclidean distance: sqrt((|delta P| - mu_P)^2 + (|delta Q| - mu_Q)^2)
                diff_p = abs_dp - mu_p
                diff_q = abs_dq - mu_q
                dist = math.sqrt(diff_p * diff_p + diff_q * diff_q)

                status = "Match" if dist <= r_max else "Outside r"
                formula_str = (
                    f"v(({round(abs_dp, 1)} - {round(mu_p, 1)})² + "
                    f"({round(abs_dq, 1)} - {round(mu_q, 1)})²)"
                )

                candidate_entry = {
                    "id": c.get("id", c["appliance"]),
                    "appliance": c["appliance"],
                    "category": c["category"],
                    "centroid_p": mu_p,
                    "centroid_q": mu_q,
                    "distance": round(dist, 2),
                    "tolerance_radius": r_max,
                    "status": status,
                    "is_match": dist <= r_max,
                    "formula": formula_str,
                }
                candidates.append(candidate_entry)

                if dist < min_dist:
                    min_dist = dist
                    best_match = candidate_entry

            # State tracking: when turning OFF, restrict / prioritize candidate to currently ON appliances
            if transition == "OFF" and state["active_appliances"]:
                active_matches = [
                    cand for cand in candidates
                    if cand["category"] in state["active_appliances"]
                ]
                if active_matches:
                    best_match = min(active_matches, key=lambda x: x["distance"])

            # Determine final match
            if best_match and best_match["is_match"]:
                matched_app = best_match["category"]
                is_match = True
                if transition == "ON":
                    state["active_appliances"].add(matched_app)
                elif transition == "OFF" and matched_app in state["active_appliances"]:
                    state["active_appliances"].remove(matched_app)
            else:
                matched_app = "Unregistered Load"
                is_match = False

            # Adopt new power baseline so the step event does not re-trigger
            state["baseline_p"] = power
            state["baseline_q"] = q_var

        result = {
            "panel_id": panel_id,
            "is_event": is_event,
            "transition": transition,
            "power_w": round(power, 2),
            "q_var": round(q_var, 2),
            "event": {
                "delta_p": round(delta_p, 2),
                "delta_q": round(delta_q, 2),
                "abs_delta_p": round(abs_dp, 2),
                "abs_delta_q": round(abs(delta_q), 2),
            },
            "dominant_appliance": matched_app if matched_app else "None",
            "is_match": is_match,
            "candidates": candidates,
            "active_appliances": sorted(list(state["active_appliances"])),
        }

        state["last_event"] = result
        return result
