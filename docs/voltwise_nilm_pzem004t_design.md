# VoltWise NILM Design Using PZEM-004T Sensor

## 1. System Scope

The system uses **one aggregate PZEM-004T sensor connection** to monitor electrical behavior from a main line, outlet group, or monitored circuit. The goal is to estimate which registered appliances are running and detect unknown or unregistered loads.

This setup is closer to **Non-Intrusive Load Monitoring (NILM)** because appliance activity is inferred from one aggregate sensor, not from one sensor per appliance.

```txt
One PZEM-004T sensor
        ↓
Reads aggregate electrical data
        ↓
Detects load changes/events
        ↓
Matches or classifies appliance activity
        ↓
Updates appliance states or sends alerts
```

## 2. Why This Is NILM, Not ILM

### NILM Setup

```txt
One sensor monitors the total load.
The system estimates which appliance caused the change.
```

Example:

```txt
Before: 180W
After: 850W
Change: +670W

Likely event: Rice cooker turned ON
```

### ILM Setup

```txt
One sensor per appliance.
Each sensor already knows which appliance it monitors.
```

Example:

```txt
PZEM 1 = Refrigerator
PZEM 2 = Fan
PZEM 3 = TV
```

For VoltWise, the intended design is:

```txt
Single aggregate PZEM-004T sensor + appliance identification logic
```

---

## 3. PZEM-004T Sensor Data to Utilize

The PZEM-004T can provide multiple electrical readings:

```txt
Voltage
Current
Power / Wattage
Power factor
Frequency
Energy / kWh
```

For appliance identification, the most useful values are:

```txt
Power
Current
Power factor
Energy change
Power changes over time
Current changes over time
Duration of load behavior
```

Voltage and frequency are still useful, but they are better for detecting abnormal electrical conditions such as brownout, overvoltage, undervoltage, outage, or unstable supply.

---

## 4. Best Algorithm for This System

The best practical algorithm for this setup is:

```txt
Event-Based NILM + Random Forest / XGBoost + Appliance State Tracker
```

Recommended final algorithm name:

```txt
Event-Based NILM Using Random Forest Classification and Appliance State Tracking
```

Or stronger version:

```txt
Event-Based NILM Using XGBoost Classification and Appliance State Tracking
```

### Recommended Pipeline

```txt
PZEM-004T aggregate sensor
        ↓
ESP32 reads voltage, current, power, power factor, frequency, energy
        ↓
Send readings to backend/database
        ↓
Smooth/filter readings
        ↓
Detect load event
        ↓
Extract electrical features
        ↓
Classify appliance event
        ↓
Update appliance state tracker
        ↓
Show running appliances or send alert
```

---

## 5. Why Event-Based NILM Is Suitable

The PZEM-004T gives summarized electrical measurements, not high-frequency waveform data. Because of that, deep learning models such as CNN, LSTM, or Transformer are not the best first choice unless there is a large dataset and high sampling rate.

For this project, readings are better treated as **tabular time-series event features**.

Best practical models:

```txt
Random Forest
XGBoost
Decision Tree
Threshold Matching
KNN
```

Recommended ranking:

| Rank | Algorithm                                 | Recommendation                              |
| ---- | ----------------------------------------- | ------------------------------------------- |
| 1    | Event-Based XGBoost + State Tracker       | Best overall if implementation time allows  |
| 2    | Event-Based Random Forest + State Tracker | Best capstone choice                        |
| 3    | Decision Tree                             | Best for explainability                     |
| 4    | Threshold Matching                        | Best simple baseline                        |
| 5    | KNN                                       | Acceptable for small prototype              |
| 6    | FHMM                                      | More NILM-theoretical but harder            |
| 7    | CNN/LSTM/Transformer                      | Better only with large time-series datasets |

---

## 6. Event Detection

The system should monitor changes in aggregate electrical readings.

Important event values:

```txt
delta_power = current_power - previous_power
delta_current = current_current - previous_current
delta_power_factor = current_power_factor - previous_power_factor
delta_energy = current_energy - previous_energy
```

Example ON event:

```txt
Previous power: 180W
Current power: 850W
Delta power: +670W

Possible event: Rice cooker turned ON
```

Example OFF event:

```txt
Previous power: 850W
Current power: 180W
Delta power: -670W

Possible event: Rice cooker turned OFF
```

Event direction:

```txt
Positive delta power = appliance/load turned ON
Negative delta power = appliance/load turned OFF
```

---

## 7. Feature Extraction

To fully utilize the PZEM-004T sensor, use both raw and derived features.

### Raw Features

```txt
voltage
current
power
power_factor
frequency
energy
```

### Event Features

```txt
delta_power
delta_current
delta_power_factor
delta_energy
event_direction
```

### Window Features

Use a short window such as 3 seconds, 5 seconds, or 10 seconds.

```txt
average_power_5s
max_power_5s
min_power_5s
power_std_5s
average_current_5s
current_std_5s
average_power_factor_5s
```

### Derived Electrical Features

```txt
apparent_power = voltage × current
estimated_reactive_behavior = apparent_power - active_power
power_factor_category
```

Power factor is useful because appliances with similar wattage may behave differently.

Example:

```txt
Resistive appliances:
- Rice cooker
- Flat iron
- Electric kettle

Usually have high power factor close to 1.0.

Motor/compressor appliances:
- Electric fan
- Refrigerator

May have different power factor behavior and startup spikes.
```

---

## 8. Appliance State Tracker

The model should not only predict an appliance name. It should predict appliance events and update appliance states.

Example model outputs:

```txt
fan_on
fan_off
tv_on
tv_off
refrigerator_on
refrigerator_off
rice_cooker_on
rice_cooker_off
unknown_load
```

Example state tracker:

```python
states = {
    "fan": False,
    "tv": False,
    "refrigerator": False,
    "rice_cooker": False
}

prediction = model.predict(features)

if prediction == "fan_on":
    states["fan"] = True
elif prediction == "fan_off":
    states["fan"] = False
elif prediction == "refrigerator_on":
    states["refrigerator"] = True
elif prediction == "refrigerator_off":
    states["refrigerator"] = False
elif prediction == "unknown_load":
    send_alert("Unknown appliance detected")
```

Example app output:

```txt
Currently running:
- Fan
- Refrigerator
- Rice cooker
```

---

## 9. Manual Appliance Registration Feature

The current application feature allows users to manually add known appliances.

Example:

```txt
User adds:
- Refrigerator
- Electric fan
- TV
- Rice cooker
```

Each appliance can have an expected electrical signature.

Example:

```txt
Refrigerator:
Expected running power: 80W–350W
Possible startup surge: up to 1200W briefly
Power factor range: based on collected data

Electric fan:
Expected running power: 40W–90W

TV:
Expected running power: 60W–180W

Rice cooker:
Expected running power: 500W–1000W
```

This feature can be described as:

```txt
Registered Appliance Signature Matching
```

or:

```txt
Known-Appliance Whitelist with Event-Based Unknown Load Detection
```

---

## 10. Unknown Load Detection

If the PZEM detects a load change that does not match any registered appliance signature, the system sends an alert.

Example:

```txt
Registered appliances:
- Fan: 40W–90W
- TV: 60W–180W
- Refrigerator: 80W–350W running
- Rice cooker: 500W–1000W

Detected event:
Before: 180W
After: 520W
Delta power: +340W

No registered appliance confidently matches the event.

Alert:
Unknown appliance detected.
Estimated load: 340W
```

Recommended feature name:

```txt
Threshold-Based Unknown Load Detection Using Registered Appliance Signatures
```

Better technical description:

```txt
The system uses event-based load monitoring with predefined appliance electrical signatures. When an observed load event does not match any registered appliance signature, the system classifies it as an unknown load and sends an alert.
```

---

## 11. Threshold Matching as Baseline

Threshold matching is a valid baseline for the first version.

Example logic:

```python
registered_appliances = [
    {"name": "Fan", "min_w": 40, "max_w": 90},
    {"name": "TV", "min_w": 60, "max_w": 180},
    {"name": "Refrigerator", "min_w": 80, "max_w": 350},
    {"name": "Rice Cooker", "min_w": 500, "max_w": 1000},
]

def identify_event(delta_power):
    for appliance in registered_appliances:
        if appliance["min_w"] <= abs(delta_power) <= appliance["max_w"]:
            if delta_power > 0:
                return f"{appliance['name']} turned ON"
            else:
                return f"{appliance['name']} turned OFF"

    return "Unknown appliance detected"
```

Important: do not use exact wattage only. Use tolerance ranges.

Example:

```txt
Fan rated power: 60W
Allowed range: 45W–75W
```

Or:

```txt
Allowed tolerance: ±20%
```

---

## 12. Refrigerator Handling

A refrigerator is tricky because it does not behave like a simple fixed-wattage appliance.

A refrigerator can have multiple states:

```txt
Idle / standby
Compressor startup
Compressor running
Defrost cycle, if available
```

A simple threshold like this is too strict:

```txt
Refrigerator: 100W–250W
```

Better refrigerator model:

```txt
Refrigerator running range: 80W–350W
Refrigerator startup/surge: 350W–1200W briefly
```

The important addition is **duration**.

Example rule:

```txt
If power briefly spikes above 350W for 1–5 seconds,
treat it as possible refrigerator compressor startup.

If the high power remains for longer than expected,
treat it as possible unknown load or another appliance.
```

Recommended logic:

```txt
If delta_power = +80W to +350W:
    Possible refrigerator compressor ON

If delta_power spikes +350W to +1200W but drops quickly:
    Possible refrigerator startup surge

If power remains high and does not follow refrigerator behavior:
    Unknown load alert
```

This prevents false alerts when the refrigerator compressor starts.

---

## 13. Power Outage Detection

Power outage detection depends on whether the ESP32 remains powered during the outage.

### Best Setup

```txt
ESP32 powered by backup battery / power bank / UPS
PZEM-004T monitors the main line voltage
```

Then the system can directly detect outage from voltage readings.

Example logic:

```txt
Normal voltage: around 220V–240V
Power outage: voltage becomes 0V or invalid
Brownout/undervoltage: voltage is very low
```

Recommended rules:

```txt
Voltage < 50V for 3–5 seconds
→ Power outage

Voltage between 50V and 180V
→ Brownout / undervoltage

Voltage between 200V and 250V
→ Normal

Voltage > 250V
→ Overvoltage warning
```

Example ESP32 logic:

```cpp
float voltage = pzem.voltage();

if (isnan(voltage) || voltage < 50) {
    // Possible power outage
}
```

Use consecutive readings instead of triggering from one reading.

```txt
If voltage < 50V for 3–5 seconds:
    status = POWER_OUTAGE

If voltage > 200V for 5–10 seconds:
    status = POWER_RESTORED
```

---

## 14. Heartbeat Monitoring

If the ESP32 has no backup power, then during an outage the device may turn off and stop sending data.

In that case, the backend should use heartbeat monitoring.

Example:

```txt
ESP32 sends readings every 5 seconds.

Last reading received: 10:00:00
No readings received until: 10:01:00

Backend marks device as offline or possible outage.
```

Backend example:

```js
const secondsSinceLastReading =
  (Date.now() - new Date(device.lastSeen).getTime()) / 1000;

if (secondsSinceLastReading > 30) {
  device.status = "OFFLINE_OR_POSSIBLE_POWER_OUTAGE";
}
```

This cannot perfectly prove a power outage because it could also be caused by:

```txt
WiFi disconnection
ESP32 crash
Backend/network problem
Power outage
```

So the correct status is:

```txt
Possible power outage / device offline
```

---

## 15. Power Restoration Detection

When power returns, the system should wait until voltage is stable before declaring restoration.

Example rule:

```txt
If previous status was POWER_OUTAGE
and voltage becomes > 200V for 10 seconds:
    status = POWER_RESTORED
    send notification
```

Example notification:

```txt
Power has been restored. Voltage is stable at 228V.
Please check sensitive appliances before turning them back on.
```

This is useful because appliances can be stressed when power returns unstable after an outage.

---

## 16. Recommended Application Features

### Current Features

```txt
Manual appliance registration
Known appliance signature storage
Aggregate PZEM monitoring
Unknown load alert
```

### Recommended Additional Features

```txt
Appliance ON/OFF state tracking
Power outage detection
Power restored notification
Brownout/undervoltage alert
Overvoltage alert
Refrigerator startup surge handling
Unknown load detection using tolerance and duration
```

---

## 17. Suggested Database Fields

### Appliances Table

```txt
id
user_id
name
category
min_power_w
max_power_w
min_current_a
max_current_a
min_power_factor
max_power_factor
startup_surge_min_w
startup_surge_max_w
startup_surge_duration_sec
created_at
updated_at
```

### Sensor Readings Table

```txt
id
device_id
timestamp
voltage
current
power
power_factor
frequency
energy
created_at
```

### Events Table

```txt
id
device_id
timestamp
event_type
predicted_appliance_id
predicted_label
delta_power
delta_current
delta_power_factor
confidence
status
created_at
```

### Alerts Table

```txt
id
user_id
device_id
alert_type
message
severity
is_read
created_at
```

---

## 18. Suggested Dataset Format

For model training, collect readings and label appliance events.

Example CSV:

```csv
timestamp,voltage,current,power,power_factor,frequency,energy,delta_power,delta_current,delta_power_factor,event_label
2026-07-01 10:00:01,221,0.55,120,0.82,60,0.010,0,0,0,baseline
2026-07-01 10:00:05,220,3.75,825,0.91,60,0.011,705,3.20,0.09,rice_cooker_on
2026-07-01 10:05:10,221,4.00,880,0.89,60,0.015,55,0.25,-0.02,fan_on
2026-07-01 10:10:20,220,0.95,210,0.76,60,0.020,-670,-3.05,-0.13,rice_cooker_off
```

Recommended event labels:

```txt
fan_on
fan_off
tv_on
tv_off
refrigerator_on
refrigerator_off
rice_cooker_on
rice_cooker_off
unknown_load
power_outage
power_restored
brownout
overvoltage
```

---

## 19. Evaluation Metrics

For the threshold baseline:

```txt
Correct detection rate
False unknown alerts
Missed unknown loads
False appliance matches
```

For Random Forest or XGBoost:

```txt
Accuracy
Precision
Recall
F1-score
Confusion matrix
Feature importance
```

For outage detection:

```txt
Detection delay
False outage alerts
Power restoration detection accuracy
```

---

## 20. Limitations

The system should honestly state its limitations:

```txt
Accuracy may decrease when multiple appliances turn ON or OFF at the same time.
Appliances with similar wattage and power factor may be confused.
Some appliances, such as refrigerators, have startup surges and variable behavior.
Unknown load detection depends on the quality of registered appliance signatures.
If the ESP32 and router lose power, real-time outage notification may not be possible unless backup power is used.
```

---

## 21. Recommended Defense Statement

Use this in documentation or presentation:

```txt
The system uses a single PZEM-004T sensor to collect aggregate electrical parameters such as voltage, current, power, power factor, frequency, and energy. Appliance activity is identified using event-based NILM, where sudden changes in power and current are treated as load events. Registered appliances are matched using predefined electrical signatures and tolerance ranges. Unknown load detection is triggered when an event does not match any registered appliance signature. For improved classification, Random Forest or XGBoost can be used to classify appliance events, while a state tracker maintains the estimated ON/OFF status of each appliance.
```

---

## 22. Recommended Project Title

```txt
VoltWise: Event-Based Non-Intrusive Load Monitoring and Unknown Load Detection Using PZEM-004T Sensor Data
```

Alternative title:

```txt
Appliance Load Identification and Unknown Load Detection Using Event-Based NILM with PZEM-004T Electrical Measurements
```

---

## 23. Final Recommended Implementation

For the current version, implement:

```txt
Event Detection + Threshold Matching + Unknown Load Alert + Appliance State Tracker
```

For the improved version, implement:

```txt
Event Detection + Random Forest/XGBoost Classifier + Unknown Load Detection + Appliance State Tracker
```

Best practical path:

```txt
1. Collect PZEM readings every 1 second.
2. Store voltage, current, power, power factor, frequency, and energy.
3. Detect sudden changes in power/current.
4. Compare the event against registered appliance signatures.
5. If matched, update appliance state.
6. If unmatched, send unknown load alert.
7. Add voltage-based outage, brownout, and overvoltage detection.
8. Later, train Random Forest or XGBoost using labeled event data.
```
