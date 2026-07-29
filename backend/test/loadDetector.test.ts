// Unit tests for the pure new-load step detector (src/lib/loadDetector.ts).
// The detector has no I/O, so these tests just feed watt samples with fake
// timestamps and assert when a detection fires.

import { describe, it, expect } from "@jest/globals";
import { createLoadDetector } from "../src/lib/loadDetector.ts";

// Telemetry arrives every ~2 s; helper to build increasing timestamps.
const at = (n: number) => n * 2_000;

describe("createLoadDetector", () => {
  it("fires once after a sustained step above the baseline", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 3,
      cooldownMs: 120_000,
    });

    detector.sample(100, at(0)); // seeds baseline
    expect(detector.sample(200, at(1))).toBeNull(); // elevated 1/3
    expect(detector.sample(200, at(2))).toBeNull(); // elevated 2/3

    const detection = detector.sample(200, at(3)); // elevated 3/3 -> fire
    expect(detection).toEqual({ deltaWatts: 100 });
  });

  it("adopts the new level so the same load cannot re-trigger", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 3,
      cooldownMs: 0,
    });

    detector.sample(100, at(0));
    detector.sample(200, at(1));
    detector.sample(200, at(2));
    expect(detector.sample(200, at(3))).not.toBeNull();

    // The appliance stays on: no further detections at the same level.
    for (let i = 4; i < 20; i++) {
      expect(detector.sample(200, at(i))).toBeNull();
    }
  });

  it("ignores a single-sample spike", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 3,
      cooldownMs: 0,
    });

    detector.sample(100, at(0));
    expect(detector.sample(900, at(1))).toBeNull(); // spike
    expect(detector.sample(100, at(2))).toBeNull(); // back to normal (streak reset)
    expect(detector.sample(105, at(3))).toBeNull();
    expect(detector.sample(100, at(4))).toBeNull();
  });

  it("ignores steps smaller than the threshold", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 3,
      cooldownMs: 0,
    });

    detector.sample(100, at(0));
    for (let i = 1; i < 30; i++) {
      expect(detector.sample(150, at(i))).toBeNull(); // +50 W, under threshold
    }
  });

  it("suppresses a second detection during the cooldown but still adopts the level", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 2,
      cooldownMs: 60_000,
    });

    detector.sample(100, 0);
    detector.sample(300, 2_000);
    expect(detector.sample(300, 4_000)).not.toBeNull(); // first fire at t=4 s

    // Second step within the cooldown window: adopted silently.
    detector.sample(600, 10_000);
    expect(detector.sample(600, 12_000)).toBeNull();

    // After the cooldown a third step fires again — and its baseline is 600,
    // proving the suppressed step was still adopted.
    detector.sample(900, 70_000);
    expect(detector.sample(900, 72_000)).toEqual({ deltaWatts: 300 });
  });

  it("does not fire when a load switches OFF (negative step)", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 3,
      cooldownMs: 0,
    });

    detector.sample(500, at(0));
    for (let i = 1; i < 30; i++) {
      expect(detector.sample(100, at(i))).toBeNull();
    }
  });

  it("drifts the baseline down after a switch-off, re-arming for the next load", () => {
    const detector = createLoadDetector({
      deltaThresholdWatts: 60,
      sustainSamples: 2,
      cooldownMs: 0,
    });

    detector.sample(500, at(0));
    // Load off: baseline drifts toward 100 over many samples.
    for (let i = 1; i < 40; i++) detector.sample(100, at(i));

    // A fresh +200 W load must be detected against the settled ~100 W baseline.
    detector.sample(300, at(40));
    const detection = detector.sample(300, at(41));
    expect(detection).not.toBeNull();
    expect(detection!.deltaWatts).toBeGreaterThanOrEqual(190);
  });

  it("ignores non-finite and negative samples", () => {
    const detector = createLoadDetector({ sustainSamples: 1, cooldownMs: 0 });

    expect(detector.sample(Number.NaN, 0)).toBeNull();
    expect(detector.sample(-5, 0)).toBeNull();
    detector.sample(100, 0);
    expect(detector.sample(Number.POSITIVE_INFINITY, 2_000)).toBeNull();
  });
});
