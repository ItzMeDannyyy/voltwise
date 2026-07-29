# NILM Algorithm Alternatives to K-Means Clustering

> **Context:** VoltWise uses NILM (Non-Intrusive Load Monitoring) to identify which
> appliances are running based on whole-home energy readings from a PZEM-004T sensor.
> K-Means is the baseline. This document covers practical alternatives, ranked by
> fit for a capstone project.

---

## Why Look Beyond K-Means?

K-Means has a hard limitation for NILM: it assumes clusters are **spherical and
equal-sized**, and it requires you to pre-define `k` (the number of appliances).
In real homes, appliance power signatures overlap, vary in size, and the number
of active devices changes at runtime — making K-Means fragile without careful
pre-tuning.

---

## Algorithm Alternatives

---

### 1. Hidden Markov Model (HMM)

**Category:** Probabilistic sequence model

**How it works for NILM:**
Each appliance is modeled as a state machine with hidden ON/OFF (or multi-level)
states. The HMM learns transition probabilities (how often a device switches) and
emission probabilities (what power draw each state produces). Given a sequence of
aggregate power readings, Viterbi decoding infers the most likely sequence of
appliance states.

**Key variant:** **Factorial HMM (FHMM)** — models multiple appliances running
simultaneously as independent chains, which is closer to real-world usage.

**Pros:**
- Naturally handles the temporal/sequential nature of power data
- Interpretable states map directly to ON/OFF
- FHMM is the most-cited baseline in academic NILM papers (Hart 1992 → Kolter 2012)

**Cons:**
- FHMM inference is exponential in number of appliances; needs approximation
- Requires labeled per-appliance training data to learn emission distributions
- Poor at handling continuous power levels (not just discrete states)

**Capstone fit:** ⭐⭐⭐⭐ — High. Strong academic precedent, interpretable,
and `hmmlearn` (Python) makes it approachable.

---

### 2. Gaussian Mixture Model (GMM)

**Category:** Probabilistic clustering (direct K-Means alternative)

**How it works for NILM:**
Instead of hard cluster assignments like K-Means, GMM fits a mixture of Gaussian
distributions to the power data. Each Gaussian component represents an appliance
operating mode. A reading is assigned to the most probable component (soft
assignment), which handles overlapping power levels gracefully.

**Pros:**
- Closest drop-in replacement for K-Means — same scikit-learn API
- Soft assignments better reflect reality (two devices with similar draw)
- Covariance flexibility: full, diagonal, spherical, tied — tunable per use case
- BIC/AIC scores help automatically select the number of components (no manual `k`)

**Cons:**
- Still a clustering approach — doesn't use temporal context
- Can converge to bad local optima like K-Means; needs multiple restarts
- Struggles when component distributions heavily overlap

**Capstone fit:** ⭐⭐⭐⭐⭐ — Best immediate swap for K-Means. Minimal
code change, measurably better, and easy to explain.

```python
from sklearn.mixture import GaussianMixture

gmm = GaussianMixture(n_components=n_appliances, covariance_type='full', n_init=5)
gmm.fit(X)  # X = [watts, current, power_factor] feature matrix
labels = gmm.predict(X)
probs  = gmm.predict_proba(X)  # soft assignments
```

---

### 3. DBSCAN (Density-Based Spatial Clustering of Applications with Noise)

**Category:** Density-based clustering

**How it works for NILM:**
DBSCAN finds clusters as dense regions of power readings separated by sparse
regions. It does not require pre-specifying the number of clusters and
automatically labels outlier readings as noise — which in NILM corresponds to
transient switching events or sensor glitches.

**Pros:**
- No need to specify number of appliances upfront
- Naturally detects anomalous/transient readings as noise (useful for VoltWise alerts)
- Handles arbitrary cluster shapes (not just spherical like K-Means)

**Cons:**
- Sensitive to `eps` (neighborhood radius) and `min_samples` — hard to tune without domain knowledge
- Struggles with clusters of varying density (e.g., AC vs. a small fan)
- Not probabilistic — no confidence scores

**Capstone fit:** ⭐⭐⭐ — Good for exploratory analysis or anomaly detection
side-use, but less suited as the primary NILM disaggregator.

---

### 4. Support Vector Machine (SVM)

**Category:** Supervised classification

**How it works for NILM:**
Trained on labeled examples of each appliance's power signature (watts, current,
power factor, voltage), SVM finds maximum-margin hyperplanes that separate
appliance classes in feature space. At inference, a new reading is classified
to the nearest appliance class.

**Pros:**
- Strong performance on small, high-dimensional feature sets
- Works well when per-appliance signatures are distinct
- `sklearn.svm.SVC` with RBF kernel is well-understood and fast to train

**Cons:**
- Requires labeled training data per appliance (supervised)
- Multi-class (multi-appliance) extension is one-vs-rest or one-vs-one — can be unwieldy
- Does not handle multiple simultaneous appliances without decomposition

**Capstone fit:** ⭐⭐⭐ — Solid if you have labeled data. Less realistic for
real deployment where labels are unavailable.

---

### 5. Random Forest / Gradient Boosting

**Category:** Supervised ensemble classification

**How it works for NILM:**
An ensemble of decision trees classifies each time window's aggregate reading
into an appliance state. Features can include raw readings plus engineered ones:
rolling mean power, rate-of-change, time-of-day, day-of-week.

**Key variant:** **XGBoost / LightGBM** offer faster training and often better
accuracy than vanilla Random Forest.

**Pros:**
- Best out-of-the-box accuracy among supervised classifiers for tabular data
- Feature importance scores give interpretable insight ("current is the most
  discriminative feature")
- Handles class imbalance via class weights
- No feature scaling required

**Cons:**
- Fully supervised — needs labeled per-appliance data
- Static model: doesn't model the temporal ON/OFF sequence
- Each prediction is independent (no state memory between readings)

**Capstone fit:** ⭐⭐⭐ — Great accuracy story if labeled data exists;
feature importances are a bonus talking point for panels.

---

### 6. LSTM (Long Short-Term Memory Neural Network)

**Category:** Deep learning / sequence model

**How it works for NILM:**
An LSTM processes a sliding window of aggregate power readings as a sequence and
outputs per-appliance power estimates. The recurrent architecture retains memory
of recent readings, capturing the temporal dependency between consecutive samples
(e.g., a device that turned on 3 readings ago is still running now).

**Key variant:** **Seq2Seq LSTM** — encoder reads a window of aggregate power,
decoder outputs the disaggregated per-appliance sequence. This is the architecture
used in NILMTK's deep learning baselines.

**Pros:**
- State-of-the-art accuracy on benchmark NILM datasets (REDD, UK-DALE)
- Learns temporal patterns automatically — no manual feature engineering
- Can handle continuous power values, not just ON/OFF states

**Cons:**
- Requires large amounts of labeled training data
- Training is slow; hyperparameter-sensitive
- Black-box: harder to explain to a panel than GMM or HMM
- Overkill for a capstone with simulated/seeded data

**Capstone fit:** ⭐⭐ — Impressive to mention as a future direction, but
impractical to properly train and validate on MVP-scale simulated data.

---

### 7. Isolation Forest

**Category:** Anomaly detection (unsupervised)

**How it works for NILM (anomaly-detection angle):**
Rather than disaggregating appliances, Isolation Forest detects *abnormal*
consumption events — a spike that deviates from the home's learned baseline.
It isolates anomalies by randomly partitioning the feature space; anomalous
readings are isolated in fewer splits.

**Note:** This is already referenced in `analytics.service.ts` in VoltWise's
`current` metric info text. It is **complementary to NILM**, not a replacement —
it answers "is something wrong?" rather than "which device is running?"

**Pros:**
- Fully unsupervised — no labels needed
- Fast and effective on tabular sensor data
- Directly powers the VoltWise alert system

**Cons:**
- Not a disaggregation algorithm — cannot identify *which* appliance caused an anomaly
- Needs combination with a classifier to be useful for NILM proper

**Capstone fit:** ⭐⭐⭐⭐ — Already implied in your design; pair with GMM
or HMM to complete the NILM + anomaly pipeline.

---

## Summary Comparison Table

| Algorithm | Type | Needs Labels | Handles Simultaneous Appliances | Temporal Awareness | Capstone Fit |
|---|---|---|---|---|---|
| K-Means (baseline) | Clustering | No | Partial | No | — |
| **GMM** | Probabilistic clustering | No | Partial | No | ⭐⭐⭐⭐⭐ |
| **HMM / FHMM** | Sequence model | No* | Yes (FHMM) | Yes | ⭐⭐⭐⭐ |
| DBSCAN | Density clustering | No | No | No | ⭐⭐⭐ |
| SVM | Supervised classifier | Yes | No | No | ⭐⭐⭐ |
| Random Forest | Supervised ensemble | Yes | No | No | ⭐⭐⭐ |
| LSTM / Seq2Seq | Deep learning | Yes | Yes | Yes | ⭐⭐ |
| Isolation Forest | Anomaly detection | No | N/A | No | ⭐⭐⭐⭐ |

> *HMM can be trained unsupervised (Baum-Welch) on aggregate data alone, then
> matched to appliances via power level heuristics.

---

## Recommended Path for VoltWise

1. **Swap K-Means → GMM** as the primary clustering/disaggregation model.
   Minimal code change, better theoretical fit, and easy to justify academically.

2. **Add Isolation Forest** alongside GMM for anomaly detection — this directly
   feeds the VoltWise alerts system and is already implied by the codebase.

3. **Reference HMM/FHMM** as the natural next-step upgrade in your paper/defense:
   "GMM gives us steady-state appliance identification; an FHMM would additionally
   model the temporal switching behavior of each appliance."

This gives you a credible, layered NILM story without overcomplicating the MVP.

---

*Last updated: 2026-07-01*
