# VoltWise Model Service Guide

This guide explains how to use `train.py`, `evaluate.py`, and `inference.py` for an isolated machine learning model service in your VoltWise project.

---

## Basic Idea

Think of the three files like this:

```txt
train.py      = teaches the model from past data
evaluate.py   = checks how good the trained model is
inference.py  = uses the trained model on new readings
```

For VoltWise, your model might answer:

> Is this power reading normal or abnormal?

---

## Recommended Folder Structure

```txt
voltwise/
├── backend/
├── mobile/
└── model-service/
    ├── app/
    │   └── inference.py
    ├── training/
    │   └── train.py
    ├── evaluation/
    │   └── evaluate.py
    ├── data/
    │   └── raw/
    │       └── readings.csv
    ├── models/
    │   ├── anomaly_model.joblib
    │   └── scaler.joblib
    └── requirements.txt
```

---

## Install Packages

Inside `model-service/`, run:

```bash
cd model-service
python -m venv .venv
source .venv/bin/activate
pip install pandas scikit-learn joblib
```

---

# 1. Sample Dataset

Create this file:

```txt
model-service/data/raw/readings.csv
```

Example content:

```csv
voltage,current,power,energy_kwh,power_factor,label
220,0.5,110,0.20,0.95,normal
221,0.6,132,0.25,0.94,normal
219,0.7,153,0.30,0.96,normal
230,5.5,1265,2.80,0.70,abnormal
235,6.0,1410,3.20,0.65,abnormal
180,4.5,810,2.50,0.60,abnormal
222,0.8,177,0.35,0.93,normal
218,0.4,87,0.15,0.97,normal
240,7.2,1728,4.00,0.55,abnormal
217,0.6,130,0.24,0.95,normal
```

Each row means:

```txt
voltage       = electrical voltage reading
current       = current usage
power         = wattage
energy_kwh    = consumed energy
power_factor  = efficiency value
label         = expected answer: normal or abnormal
```

---

# 2. `train.py`

This file trains the model and saves it.

Create this file:

```txt
model-service/training/train.py
```

Code:

```python
import os
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import RandomForestClassifier



BASE_DIR = os.path.dirname(os.path.dirname(__file__))

DATA_PATH = os.path.join(BASE_DIR, "data", "raw", "readings.csv")
MODEL_DIR = os.path.join(BASE_DIR, "models")

MODEL_PATH = os.path.join(MODEL_DIR, "anomaly_model.joblib")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.joblib")



def main():
    os.makedirs(MODEL_DIR, exist_ok=True)

    # 1. Load dataset
    df = pd.read_csv(DATA_PATH)

    # 2. Separate input features and target label
    X = df[["voltage", "current", "power", "energy_kwh", "power_factor"]]
    y = df["label"]

    # 3. Split data into training and testing parts
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    # 4. Scale the input features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)

    # 5. Train model
    model = RandomForestClassifier(
        n_estimators=100,
        random_state=42
    )

    model.fit(X_train_scaled, y_train)

    # 6. Save trained model and scaler
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    print("Training complete.")
    print(f"Model saved to: {MODEL_PATH}")
    print(f"Scaler saved to: {SCALER_PATH}")



if __name__ == "__main__":
    main()
```

Run it:

```bash
python training/train.py
```

After running, you should get:

```txt
model-service/models/anomaly_model.joblib
model-service/models/scaler.joblib
```

---

## What `train.py` Does

This part loads your data:

```python
df = pd.read_csv(DATA_PATH)
```

This part selects the input columns:

```python
X = df[["voltage", "current", "power", "energy_kwh", "power_factor"]]
```

This is the answer column:

```python
y = df["label"]
```

So the model learns this pattern:

```txt
voltage + current + power + energy_kwh + power_factor → normal/abnormal
```

This part scales the data:

```python
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
```

Scaling means it normalizes the values so big values like `power = 1728` do not dominate smaller values like `power_factor = 0.95`.

This part trains the model:

```python
model.fit(X_train_scaled, y_train)
```

This part saves the trained model:

```python
joblib.dump(model, MODEL_PATH)
joblib.dump(scaler, SCALER_PATH)
```

You save both because later, during inference, the new reading must be scaled in the same way.

---

# 3. `evaluate.py`

This file checks if your model performs well.

Create this file:

```txt
model-service/evaluation/evaluate.py
```

Code:

```python
import os
import joblib
import pandas as pd

from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix



BASE_DIR = os.path.dirname(os.path.dirname(__file__))

DATA_PATH = os.path.join(BASE_DIR, "data", "raw", "readings.csv")
MODEL_PATH = os.path.join(BASE_DIR, "models", "anomaly_model.joblib")
SCALER_PATH = os.path.join(BASE_DIR, "models", "scaler.joblib")



def main():
    # 1. Load dataset
    df = pd.read_csv(DATA_PATH)

    X = df[["voltage", "current", "power", "energy_kwh", "power_factor"]]
    y = df["label"]

    # 2. Use same split style as training
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=y
    )

    # 3. Load saved model and scaler
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)

    # 4. Scale test data
    X_test_scaled = scaler.transform(X_test)

    # 5. Predict
    y_pred = model.predict(X_test_scaled)

    # 6. Show metrics
    accuracy = accuracy_score(y_test, y_pred)

    print(f"Accuracy: {accuracy:.2f}")
    print("\nClassification Report:")
    print(classification_report(y_test, y_pred))

    print("Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))



if __name__ == "__main__":
    main()
```

Run it:

```bash
python evaluation/evaluate.py
```

---

## What `evaluate.py` Does

It loads the saved files:

```python
model = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)
```

Then it tests the model using unseen data:

```python
y_pred = model.predict(X_test_scaled)
```

Then it prints metrics.

Example:

```txt
Accuracy: 0.85
```

Meaning:

```txt
The model got 85% of the test examples correct.
```

The classification report may show:

```txt
precision
recall
f1-score
```

For VoltWise, **recall for abnormal readings** is very important.

Why?

Because missing a dangerous abnormal reading is worse than accidentally warning the user once.

---

# 4. `inference.py`

This file uses the trained model on new incoming data.

Create this file:

```txt
model-service/app/inference.py
```

Code:

```python
import os
import joblib
import pandas as pd



BASE_DIR = os.path.dirname(os.path.dirname(__file__))

MODEL_PATH = os.path.join(BASE_DIR, "models", "anomaly_model.joblib")
SCALER_PATH = os.path.join(BASE_DIR, "models", "scaler.joblib")



model = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)



def predict_reading(voltage, current, power, energy_kwh, power_factor):
    # 1. Create dataframe from new reading
    input_data = pd.DataFrame([{
        "voltage": voltage,
        "current": current,
        "power": power,
        "energy_kwh": energy_kwh,
        "power_factor": power_factor
    }])

    # 2. Scale input using the same scaler from training
    input_scaled = scaler.transform(input_data)

    # 3. Predict class
    prediction = model.predict(input_scaled)[0]

    # 4. Get confidence score
    probabilities = model.predict_proba(input_scaled)[0]
    confidence = max(probabilities)

    return {
        "prediction": prediction,
        "confidence": round(float(confidence), 2)
    }



if __name__ == "__main__":
    result = predict_reading(
        voltage=230,
        current=5.5,
        power=1265,
        energy_kwh=2.8,
        power_factor=0.70
    )

    print(result)
```

Run it:

```bash
python app/inference.py
```

Example output:

```txt
{'prediction': 'abnormal', 'confidence': 0.94}
```

---

## What `inference.py` Does

This is the file your backend or API will eventually use.

Example new reading:

```python
voltage=230
current=5.5
power=1265
energy_kwh=2.8
power_factor=0.70
```

The model predicts:

```txt
abnormal
```

That means VoltWise can say:

```txt
Warning: abnormal power consumption detected.
```

---

# Simple Flow

```txt
Step 1: You collect sensor readings
Step 2: You save readings in CSV or database
Step 3: train.py learns from labeled readings
Step 4: evaluate.py checks model performance
Step 5: inference.py predicts new readings
Step 6: backend receives prediction
Step 7: mobile app displays alert
```

---

# Full ML Flow in Your Project

```txt
ESP32 / Sensor
     ↓
Backend receives reading
     ↓
Backend sends reading to model-service
     ↓
model-service runs inference.py
     ↓
Prediction: normal / abnormal
     ↓
Backend saves result
     ↓
Mobile app shows alert
```

---

# Important Difference

## Training

Training is not done every request.

```txt
train.py = run sometimes
```

Example:

```bash
python training/train.py
```

You only run this when:

```txt
you have new dataset
you improved your model
you changed your features
you want to retrain
```

## Inference

Inference happens often.

```txt
inference.py = used every time there is a new reading
```

Example:

```txt
Sensor sends reading → model predicts immediately
```

So:

```txt
train.py      = occasional
evaluate.py   = occasional
inference.py  = frequent
```

---

# Backend Usage Later

Your backend should not run this:

```bash
python training/train.py
```

Your backend should only call inference.

Later, you can wrap inference with FastAPI:

```txt
POST /predict
```

Example request:

```json
{
  "voltage": 230,
  "current": 5.5,
  "power": 1265,
  "energy_kwh": 2.8,
  "power_factor": 0.7
}
```

Example response:

```json
{
  "prediction": "abnormal",
  "confidence": 0.94
}
```

---

# Best Mental Model

Imagine the model as a student.

```txt
train.py
```

Teaches the student.

```txt
evaluate.py
```

Gives the student an exam.

```txt
inference.py
```

Asks the student a real-world question.

For VoltWise:

```txt
train.py:
Here are past normal and abnormal readings. Learn the pattern.

evaluate.py:
Here are readings you have not seen before. How many can you answer correctly?

inference.py:
Here is a new live sensor reading. Is it normal or abnormal?
```

---

# Suggested Next Step

Build this small version first using CSV.

After it works, connect `inference.py` to FastAPI and let your Node.js backend call the model service.
