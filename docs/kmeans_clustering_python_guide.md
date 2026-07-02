# Beginner Guide: Using K-Means Clustering in Python for Machine Learning

## What is K in K-Means?

In **K-Means clustering**, **K** means the **number of clusters or groups** you want the algorithm to create.

For example, if you set:

```text
K = 3
```

The algorithm will try to separate your data into **3 groups**.

Example:

```text
Cluster 1 → low-power appliances
Cluster 2 → medium-power appliances
Cluster 3 → high-power appliances
```

So in simple words:

> **K = how many groups you want the data to be separated into.**

The **“means”** part refers to the algorithm using the **mean/center point** of each cluster to group similar data points together.

---

## Simple Appliance Example

Suppose you have this appliance power data:

```text
Data: 50W, 55W, 60W, 300W, 320W, 1000W, 1050W
K = 3
```

Possible clusters:

```text
Cluster 1: 50W, 55W, 60W
Cluster 2: 300W, 320W
Cluster 3: 1000W, 1050W
```

For your **PZEM-004T / VoltWise / NILM idea**, K-Means could group appliance behavior based on features like:

```text
power, current, power factor, energy, voltage fluctuation
```

But the hard part is choosing the right **K**, because the algorithm does not automatically know how many appliances or appliance states exist.

---

# How to Use K-Means in Python

You use **K-Means** when you want the machine to **group similar data automatically**.

K-Means is an **unsupervised learning** algorithm. This means you do **not** give labels like:

```text
refrigerator
fan
rice cooker
```

Instead, you give it sensor data, and it tries to find patterns or groups by itself.

In Python, the usual library for this is **scikit-learn**.

Official documentation:

- KMeans: https://scikit-learn.org/stable/modules/generated/sklearn.cluster.KMeans.html
- StandardScaler: https://scikit-learn.org/stable/modules/generated/sklearn.preprocessing.StandardScaler.html

---

## Install Required Libraries

Run this in your terminal:

```bash
pip install scikit-learn pandas
```

---

# Beginner-Friendly Python Code Example

This example uses appliance-like readings similar to what you may collect from a **PZEM-004T sensor**.

```python
# Import pandas so we can create and handle table-like data
import pandas as pd

# Import StandardScaler to make all features use a fair scale
# Example: power might be 1000W while power factor is only 0.90
from sklearn.preprocessing import StandardScaler

# Import KMeans, the clustering algorithm
from sklearn.cluster import KMeans


# ---------------------------------------------------------
# 1. Create sample appliance sensor data
# Each row is one sensor reading from your PZEM-004T-like data
# ---------------------------------------------------------
data = {
    "power_watts": [55, 60, 58, 145, 150, 148, 900, 950, 920],
    "current_amps": [0.25, 0.27, 0.26, 0.70, 0.72, 0.71, 4.10, 4.30, 4.20],
    "power_factor": [0.60, 0.62, 0.61, 0.85, 0.86, 0.84, 0.95, 0.96, 0.94]
}

# Convert the dictionary into a DataFrame, like a spreadsheet/table
df = pd.DataFrame(data)

# Show the raw data
print("Original Data:")
print(df)



# ---------------------------------------------------------
# 2. Select the features used for clustering
# These are the columns K-Means will study
# ---------------------------------------------------------
features = df[["power_watts", "current_amps", "power_factor"]]



# ---------------------------------------------------------
# 3. Scale the features
# K-Means uses distance, so large-value columns like watts
# can overpower smaller columns like power factor.
# StandardScaler makes the values more balanced.
# ---------------------------------------------------------
scaler = StandardScaler()

# fit_transform() learns the scaling rule and applies it
scaled_features = scaler.fit_transform(features)



# ---------------------------------------------------------
# 4. Create the K-Means model
# n_clusters=3 means we want 3 groups
# random_state=42 makes the result repeatable
# ---------------------------------------------------------
kmeans = KMeans(
    n_clusters=3,
    random_state=42,
    n_init="auto"
)



# ---------------------------------------------------------
# 5. Train the model using the scaled sensor data
# This is where K-Means finds the groups
# ---------------------------------------------------------
kmeans.fit(scaled_features)



# ---------------------------------------------------------
# 6. Add the cluster result back to the original table
# labels_ contains the group number assigned to each row
# ---------------------------------------------------------
df["cluster"] = kmeans.labels_

print("\nData with Cluster Results:")
print(df)



# ---------------------------------------------------------
# 7. Predict the cluster of a new appliance reading
# Example: new PZEM reading = 155W, 0.73A, 0.85 PF
# ---------------------------------------------------------
new_reading = pd.DataFrame({
    "power_watts": [155],
    "current_amps": [0.73],
    "power_factor": [0.85]
})

# Important: use transform(), NOT fit_transform()
# because we must use the same scaling rule learned earlier
new_reading_scaled = scaler.transform(new_reading)

# Predict which cluster the new reading belongs to
predicted_cluster = kmeans.predict(new_reading_scaled)

print("\nNew Reading:")
print(new_reading)

print("\nPredicted Cluster:")
print(predicted_cluster[0])
```

---

# Why Do We Use StandardScaler?

K-Means uses **distance** to decide which data points are similar.

That means if one feature has big values, it can dominate the clustering.

Example:

```text
power_watts = 900
power_factor = 0.95
```

Without scaling, the model may care too much about `power_watts` and almost ignore `power_factor`.

That is why we use:

```python
scaler = StandardScaler()
scaled_features = scaler.fit_transform(features)
```

This makes the feature values more balanced before training.

---

# Example Output

Your output may look something like this:

```text
Data with Cluster Results:
   power_watts  current_amps  power_factor  cluster
0           55          0.25          0.60        1
1           60          0.27          0.62        1
2           58          0.26          0.61        1
3          145          0.70          0.85        2
4          150          0.72          0.86        2
5          148          0.71          0.84        2
6          900          4.10          0.95        0
7          950          4.30          0.96        0
8          920          4.20          0.94        0
```

The cluster numbers **0, 1, 2** do not automatically mean:

```text
0 = fan
1 = refrigerator
2 = rice cooker
```

K-Means only gives you groups. You still need to inspect and interpret them.

For example:

```text
Cluster 1 → low power readings
Cluster 2 → medium power readings
Cluster 0 → high power readings
```

---

# Applying This to VoltWise / PZEM-004T

For your real sensor data, your dataset could have columns like:

```text
voltage, current, power, power_factor, frequency, energy
```

Then your feature selection would look like this:

```python
features = df[[
    "voltage",
    "current",
    "power",
    "power_factor",
    "frequency",
    "energy"
]]
```

This means K-Means will study these values and try to group similar electrical behaviors.

---

# Giving Meaning to Clusters

After clustering, you can manually assign names to the clusters.

Example:

```python
cluster_names = {
    0: "High power appliance behavior",
    1: "Low power appliance behavior",
    2: "Medium power appliance behavior"
}

# Create a new column with human-readable cluster names
df["cluster_name"] = df["cluster"].map(cluster_names)

print(df)
```

This is useful because K-Means only gives numbers. You provide the meaning after checking the behavior of each group.

---

# Full Workflow

```text
Collect PZEM readings
→ Put them in a table
→ Choose features
→ Scale the features
→ Train K-Means
→ Check the clusters
→ Give human meaning to each cluster
```

---

# Important Warning for NILM

K-Means is a good **starting algorithm**, but it may struggle when appliances have overlapping behavior.

Example:

```text
Fan = 60W
Light = 55W
Small charger = 50W
```

These may look very similar to the model.

For a stronger NILM system, you may later combine K-Means with:

- threshold rules
- appliance states
- time patterns
- power factor behavior
- event detection
- supervised machine learning models

---

# Simple Summary

K-Means is useful when you want to discover groups in your sensor data.

For your project:

```text
K-Means can help group appliance behavior,
but it does not automatically know the appliance name.
```

You use it to discover patterns first, then you interpret those patterns based on your actual appliance readings.
