// Documentation only: Pure step-change detector for whole-home power readings.
// Watches the stream of telemetry watts and fires when a *sustained* jump above
// the rolling baseline appears — the signature of a new appliance switching on.
// It performs no I/O, keeps all state inside the factory closure, and is driven
// one sample at a time, which makes it trivially unit-testable and safe to call
// from the MQTT message handler.
//
// Algorithm:
//   - The first sample seeds the baseline.
//   - A sample >= baseline + deltaThresholdWatts starts (or extends) an
//     "elevated" streak; anything below it resets the streak and lets the
//     baseline drift toward the current level (EMA), so slow changes and
//     device switch-offs never trigger.
//   - Once the streak reaches sustainSamples consecutive readings (~2 s apart
//     each), the new level is adopted as the baseline. A detection is reported
//     unless one already fired within cooldownMs — either way the adoption
//     prevents the same appliance from re-triggering forever.

export interface LoadDetectorOptions {
  /** Minimum watts jump above the baseline that counts as a new load. */
  deltaThresholdWatts?: number;
  /** Consecutive elevated samples required before firing (spike filter). */
  sustainSamples?: number;
  /** Minimum time between two detections. */
  cooldownMs?: number;
}

export interface LoadDetection {
  /** Average size of the sustained jump, rounded to whole watts. */
  deltaWatts: number;
}

export interface LoadDetector {
  /** Feed one telemetry sample; returns a detection or null. */
  sample: (watts: number, nowMs: number) => LoadDetection | null;
}

// How strongly the baseline follows non-elevated samples (0..1). 0.2 settles
// on a new lower level within ~10 samples (~20 s of telemetry).
const BASELINE_DRIFT_FACTOR = 0.2;

export const createLoadDetector = (
  options: LoadDetectorOptions = {}
): LoadDetector => {
  const deltaThresholdWatts = options.deltaThresholdWatts ?? 60;
  const sustainSamples = options.sustainSamples ?? 3;
  const cooldownMs = options.cooldownMs ?? 120_000;

  let baseline: number | null = null;
  let elevatedCount = 0;
  let elevatedDeltaSum = 0;
  let lastFiredAtMs = Number.NEGATIVE_INFINITY;

  const sample = (watts: number, nowMs: number): LoadDetection | null => {
    if (!Number.isFinite(watts) || watts < 0) return null;

    if (baseline === null) {
      baseline = watts;
      return null;
    }

    const delta = watts - baseline;

    if (delta < deltaThresholdWatts) {
      // Not a step (or the step ended early) — reset the streak and let the
      // baseline drift so gradual changes and switch-offs are absorbed.
      elevatedCount = 0;
      elevatedDeltaSum = 0;
      baseline += delta * BASELINE_DRIFT_FACTOR;
      return null;
    }

    elevatedCount += 1;
    elevatedDeltaSum += delta;

    if (elevatedCount < sustainSamples) return null;

    // Sustained step confirmed: adopt the new level so it can't re-trigger.
    const averageDelta = elevatedDeltaSum / elevatedCount;
    baseline = watts;
    elevatedCount = 0;
    elevatedDeltaSum = 0;

    if (nowMs - lastFiredAtMs < cooldownMs) return null;

    lastFiredAtMs = nowMs;
    return { deltaWatts: Math.round(averageDelta) };
  };

  return { sample };
};
