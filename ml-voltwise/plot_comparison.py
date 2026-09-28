import matplotlib.pyplot as plt
import pandas as pd
import numpy as np
from pathlib import Path

# Paths
AC_PATH = Path("data/raw/voltwise_air_conditioner_2026-09-25T23-45-16.csv")
FRIDGE_PATH = Path("data/raw/voltwise_refrigerator_2026-09-26T00-04-25.csv")

# Load datasets
ac_df = pd.read_csv(AC_PATH)
fridge_df = pd.read_csv(FRIDGE_PATH)

# Standardize timestamps and compute elapsed minutes from start of each recording
for df in [ac_df, fridge_df]:
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df.sort_values("timestamp", inplace=True)
    df["elapsed_sec"] = (df["timestamp"] - df["timestamp"].iloc[0]).dt.total_seconds()
    df["elapsed_min"] = df["elapsed_sec"] / 60.0

# Styling
plt.style.use("seaborn-v0_8-whitegrid" if "seaborn-v0_8-whitegrid" in plt.style.available else "default")
fig, axes = plt.subplots(4, 1, figsize=(14, 16), sharex=True)
fig.suptitle("VoltWise Electrical Telemetry Comparison: Air Conditioner vs Refrigerator", fontsize=16, fontweight="bold", y=0.98)

COLOR_AC = "#1f77b4"      # Blue
COLOR_FRIDGE = "#ff7f0e"  # Orange

# 1. Active Power (Watts)
ax1 = axes[0]
ax1.plot(ac_df["elapsed_min"], ac_df["power_watts"], label="Air Conditioner", color=COLOR_AC, linewidth=1.5, alpha=0.9)
ax1.plot(fridge_df["elapsed_min"], fridge_df["power_watts"], label="Refrigerator", color=COLOR_FRIDGE, linewidth=1.5, alpha=0.9)
ax1.set_ylabel("Power (Watts)", fontsize=12, fontweight="bold")
ax1.set_title("Active Power Consumption (Watts)", fontsize=13, fontweight="bold")
ax1.legend(loc="upper right", frameon=True, shadow=True)
ax1.grid(True, linestyle="--", alpha=0.6)

# Annotate AC inrush spike
ac_max_power = ac_df["power_watts"].max()
ac_max_time = ac_df.loc[ac_df["power_watts"].idxmax(), "elapsed_min"]
ax1.annotate(f"AC Inrush Spike: {ac_max_power:.1f} W",
             xy=(ac_max_time, ac_max_power),
             xytext=(ac_max_time + 0.8, ac_max_power - 300),
             arrowprops=dict(facecolor=COLOR_AC, shrink=0.05, width=1.5, headwidth=8),
             fontweight="bold", color="#0d47a1")

# Annotate Fridge cycle
fridge_max_power = fridge_df["power_watts"].max()
fridge_max_time = fridge_df.loc[fridge_df["power_watts"].idxmax(), "elapsed_min"]
ax1.annotate(f"Fridge Peak: {fridge_max_power:.1f} W",
             xy=(fridge_max_time, fridge_max_power),
             xytext=(fridge_max_time + 0.8, fridge_max_power + 300),
             arrowprops=dict(facecolor=COLOR_FRIDGE, shrink=0.05, width=1.5, headwidth=8),
             fontweight="bold", color="#e65100")

# 2. Current (Amperes)
ax2 = axes[1]
ax2.plot(ac_df["elapsed_min"], ac_df["current_a"], label="Air Conditioner", color=COLOR_AC, linewidth=1.5, alpha=0.9)
ax2.plot(fridge_df["elapsed_min"], fridge_df["current_a"], label="Refrigerator", color=COLOR_FRIDGE, linewidth=1.5, alpha=0.9)
ax2.set_ylabel("Current (Amps)", fontsize=12, fontweight="bold")
ax2.set_title("Load Current (Amperes)", fontsize=13, fontweight="bold")
ax2.legend(loc="upper right", frameon=True, shadow=True)
ax2.grid(True, linestyle="--", alpha=0.6)

# Annotate AC peak current
ac_max_curr = ac_df["current_a"].max()
ax2.annotate(f"AC Inrush Current: {ac_max_curr:.2f} A",
             xy=(ac_max_time, ac_max_curr),
             xytext=(ac_max_time + 0.8, ac_max_curr - 3.5),
             arrowprops=dict(facecolor=COLOR_AC, shrink=0.05, width=1.5, headwidth=8),
             fontweight="bold", color="#0d47a1")

# 3. Power Factor
ax3 = axes[2]
ax3.plot(ac_df["elapsed_min"], ac_df["power_factor"], label="Air Conditioner", color=COLOR_AC, linewidth=1.5, alpha=0.9)
ax3.plot(fridge_df["elapsed_min"], fridge_df["power_factor"], label="Refrigerator", color=COLOR_FRIDGE, linewidth=1.5, alpha=0.9)
ax3.set_ylabel("Power Factor (0 to 1)", fontsize=12, fontweight="bold")
ax3.set_title("Power Factor (Efficiency)", fontsize=13, fontweight="bold")
ax3.set_ylim(0.2, 1.05)
ax3.legend(loc="lower right", frameon=True, shadow=True)
ax3.grid(True, linestyle="--", alpha=0.6)

# 4. Voltage (V)
ax4 = axes[3]
ax4.plot(ac_df["elapsed_min"], ac_df["voltage_v"], label="Air Conditioner Run", color=COLOR_AC, linewidth=1.2, alpha=0.85)
ax4.plot(fridge_df["elapsed_min"], fridge_df["voltage_v"], label="Refrigerator Run", color=COLOR_FRIDGE, linewidth=1.2, alpha=0.85)
ax4.set_xlabel("Elapsed Time (Minutes)", fontsize=12, fontweight="bold")
ax4.set_ylabel("Voltage (Volts)", fontsize=12, fontweight="bold")
ax4.set_title("AC Line Voltage Stability (Volts)", fontsize=13, fontweight="bold")
ax4.legend(loc="lower right", frameon=True, shadow=True)
ax4.grid(True, linestyle="--", alpha=0.6)

plt.tight_layout(rect=[0, 0.02, 1, 0.96])

# Output paths
graphs_output = Path("artifacts/graphs/ac_vs_refrigerator_comparison.png")
graphs_output.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(graphs_output, dpi=300, bbox_inches="tight")
print(f"Saved plot to: {graphs_output.resolve()}")

# Also keep docs copy
docs_output = Path("docs/ac_vs_refrigerator_comparison.png")
docs_output.parent.mkdir(parents=True, exist_ok=True)
plt.savefig(docs_output, dpi=300, bbox_inches="tight")

# Also save directly to conversation artifact directory
artifact_dir = Path(r"C:\Users\ThinkPad\.gemini\antigravity-cli\brain\eec9d8ba-2fb5-443f-adfd-cfa2aaf32c64")
if artifact_dir.exists():
    artifact_output = artifact_dir / "ac_vs_refrigerator_comparison.png"
    plt.savefig(artifact_output, dpi=300, bbox_inches="tight")
    print(f"Saved artifact plot to: {artifact_output.resolve()}")

plt.close()
