# Non-Intrusive Load Monitoring (NILM) with K-Means Clustering

A comprehensive summary of NILM training paradigms, isolated CSV data collection, event-based step detection ($\Delta P, \Delta Q$), and Euclidean distance classification.

---

## 1. Overview of NILM Training Paradigms

Depending on smart meter sampling rates and model complexity, NILM approaches fall into two main categories:

| Paradigm | Typical Sampling Rate | How It Works | Common Models |
| :--- | :--- | :--- | :--- |
| **Non-Event-Based (Time-Series Disaggregation)** | Low frequency ($1\text{ Hz}$ to $1/6\text{ Hz}$) | Feeds sliding windows of raw aggregate wattage into a model to directly regress individual appliance power or predict ON/OFF states. | Seq2Seq, Seq2Point, Denoising Autoencoders (dAE), BERT4NILM, ELECTRIcity |
| **Event-Based Classification** | Low to High frequency ($\ge 1\text{ Hz}$ up to $\text{kHz}$) | Detects sudden step changes ($\Delta P, \Delta Q$) when appliances switch ON/OFF, extracts electrical signatures, and classifies each event. | **K-Means**, Combinatorial Optimization (CO), Random Forest, SVM, 2D CNN (V-I trajectories) |

### Key Benchmark Datasets & Literature
* **Datasets:** REDD ($1\text{ Hz}$ US homes), UK-DALE ($1/6\text{ Hz}$ & $16\text{ kHz}$ UK homes), REFIT ($1/8\text{ Hz}$ across 20 homes), and PLAID/WHITED ($\ge 30\text{ kHz}$ transient signatures).
* **Foundational Papers:**
  * *Hart (1992)* — Steady-state $(\Delta P, \Delta Q)$ clustering and finite-state appliance modeling.
  * *Kolter & Jaakkola (2012)* — Additive Factorial HMMs and the REDD dataset.
  * *Kelly & Knottenbelt (2015)* — *Neural NILM* (deep learning & synthetic aggregate data augmentation).
  * *Zhang et al. (2018)* — *Sequence-to-Point (Seq2Point)* learning.
  * *Yue et al. (2020)* — *BERT4NILM* (bidirectional Transformers for NILM).

---

## 2. Training K-Means Using Isolated Appliance CSVs

Collecting datasets by running **one appliance at a time** and saving each trace to a CSV is an effective way to extract clean state centroids—provided the inference pipeline accounts for overlapping loads.

### Why Raw Wattage Clustering Fails Alone
1. **The Overlap Problem:** Two different appliances with similar active wattage (e.g., a $60\text{ W}$ bulb and a $60\text{ W}$ fan) cannot be separated using Active Power ($P$) alone.
2. **The Combination Problem:** When a $60\text{ W}$ fan and a $500\text{ W}$ rice cooker run together, the meter reads $560\text{ W}$—a combined value that never appears in single-appliance CSV files.

### Three-Stage Pipeline Solution
1. **Multi-Feature Data Logging:** Log Voltage ($V$), Current ($I$), Active Power ($P$), and Power Factor ($PF$) at a fixed interval (e.g., $1\text{ Hz}$).
2. **Per-Appliance Centroid Extraction:**
   * Filter out the `OFF` state ($\approx 0\text{ W}$).
   * Select $K$ based on the appliance's operational modes ($K=1$ for simple ON/OFF loads; $K=2\text{–}3$ for multi-speed fans or compressor cycles).
   * Fit K-Means on each CSV independently to extract each state's centroid vector $(\mu_P, \mu_Q, \mu_I)$.
3. **Event-Based Disaggregation:** Apply finite differencing ($\Delta$) to the live aggregate stream so each switching event isolates a single appliance's signature, then match it to the nearest learned centroid.

---

## 3. Event Detection: Finite Difference ($\Delta P$)

### Formula & Pronunciation
$$\Delta P = P_t - P_{t-1}$$

* **Read aloud:** *"Delta P equals P sub t minus P sub t minus one."*
* **$\Delta P$ ("Delta P"):** The net change in Active Power (Watts) between two consecutive readings.
* **$P_t$ ("P sub t"):** Total aggregate wattage measured **right now** at timestamp $t$.
* **$P_{t-1}$ ("P sub t minus one"):** Total aggregate wattage measured **one sample earlier** at timestamp $t - 1$.

### How Subtraction Cancels Background Loads
Because total power is the sum of all running appliances ($P_t = P_{\text{background}} + P_{\text{new}}$), subtracting $P_{t-1}$ cancels out steady background devices:

$$\Delta P = (P_{\text{background}} + P_{\text{new}}) - P_{\text{background}} = +P_{\text{new}}$$

* **$\Delta P \approx 0$ (Steady State):** No switching event; ignore.
* **$\Delta P \gt 0$ (Rising Edge):** An appliance turned **ON** or stepped **up** to a higher power state.
* **$\Delta P \lt 0$ (Falling Edge):** An appliance turned **OFF** or stepped **down** to a lower power state.

### Four Practical Safeguards for Live Data
1. **Noise Deadband Threshold ($\theta$):** Ignore minor AC line fluctuations ($\pm 1\text{–}3\text{ W}$) by requiring $|\Delta P| \gt \theta$ (typically $10\text{–}20\text{ W}$) before triggering an event.
2. **Windowed Delta for Inrush Spikes & Ramps:** Wait 2–3 seconds after $|\Delta P| \gt \theta$ triggers so motor inrush spikes settle, then calculate $\Delta P_{\text{window}} = \bar{P}_{\text{after}} - \bar{P}_{\text{before}}$.
3. **Use Reactive Power ($\Delta Q$), Not $\Delta PF$:** Power Factor is non-linear and cannot be subtracted across parallel loads. Derive linearly additive Reactive Power ($Q$) from Apparent Power ($S = V \times I$) and Active Power ($P$):
   $$Q_t = \sqrt{\max(0, S_t^2 - P_t^2)} \quad \Longrightarrow \quad \Delta Q = Q_t - Q_{t-1}$$
4. **State Tracking:** When $\Delta P \lt 0$, restrict candidate matches to appliances currently tracked as **ON** in system memory.

---

## 4. Classification: Euclidean Distance ($d_k$)

Once a switching event $(|\Delta P|, |\Delta Q|)$ is isolated, K-Means classifies it by finding the shortest straight-line (**Euclidean**) distance to every learned centroid $k$.

### Formula & Pronunciation
$$d_k = \sqrt{(\Delta P - \mu_{P,k})^2 + (\Delta Q - \mu_{Q,k})^2}$$

* **Read aloud:** *"d sub k equals the square root of: delta P minus mu sub P comma k, squared, plus delta Q minus mu sub Q comma k, squared."*
* **$d_k$:** Straight-line distance between the live event and centroid $k$.
* **$(\Delta P, \Delta Q)$:** Coordinates of the detected switching event.
* **$(\mu_{P,k}, \mu_{Q,k})$:** Learned average active and reactive power of appliance state $k$.

*(If including additional features like Current $\Delta I$, add $(\Delta I - \mu_{I,k})^2$ inside the square root—and apply feature scaling such as `StandardScaler` first so large Watt values do not overpower smaller Ampere values.)*

### Worked Classification Example
Suppose two centroids share the same $60\text{ W}$ active power draw but differ in reactive power:
* **Resistive Bulb:** $(60\text{ W},\; 2\text{ VAR})$
* **Electric Fan:** $(60\text{ W},\; 45\text{ VAR})$

When a live switching event occurs at **$(62\text{ W},\; 42\text{ VAR})$**:
* $d_{\text{bulb}} = \sqrt{(62 - 60)^2 + (42 - 2)^2} = \sqrt{4 + 1600} \approx \mathbf{40.05}$
* $d_{\text{fan}} = \sqrt{(62 - 60)^2 + (42 - 45)^2} = \sqrt{4 + 9} \approx \mathbf{3.61}$

Because $3.61 \lt 40.05$ (and falls within a maximum tolerance radius $r_{\max}$), the event is assigned to the **Electric Fan**. If the minimum distance exceeds $r_{\max}$, the event is flagged as an **Unknown / Simultaneous Load**.

---

## 5. Summary Reference Table

| Step | Formula | Name | Role in Pipeline |
| :--- | :--- | :--- | :--- |
| **1. Event Detection** | $\Delta P = P_t - P_{t-1}$ | First-Order Finite Difference | Isolates sudden power changes from steady background loads. |
| **2. Feature Extraction** | $Q_t = \sqrt{\max(0, (V_t I_t)^2 - P_t^2)}$ | Power Triangle Equation | Computes linearly additive reactive power to separate same-wattage devices. |
| **3. Classification** | $d_k = \sqrt{\sum_{i} (\Delta x_i - \mu_{i,k})^2}$ | Euclidean Distance | Matches the normalized event vector to the nearest K-Means appliance centroid. |