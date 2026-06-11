# VoltWise: An IoT smart power monitoring and 

> A smart power management and optimization platform designed to monitor, analyze, and reduce power consumption in real-time.

VoltWise is an IoT+Ml based system to track energy consumption, detect electrical usage anomalies, provides a automated safety intervention towards user's electrical dependent assets such as appliances.

---

## Key Features

* **Real-Time Telemetry:** Stream and visualize live data from smart meters and IoT energy sensors.
* **Predictive Load Analytics:** Foresee peak demand periods and estimate upcoming utility bills using machine learning.
* **Automated Anomalies:** Instant alerts for unusual power spikes, vampire loads, or equipment inefficiencies.
* **Automated Protection:** with 3-10 seconds alert to shutdown the power stream to protect the user assets such as appliances via relay module.

---

## Tech Stack

VoltWise is built using a modern, scalable architecture:

| Component | Technology |
| :--- | :--- |
| **Frontend** | ReactNative.js, Tremor (Charts) |
| **Backend API** | Node.js (Express.js) / Python (FastAPI) |
| **Database** | TimescaleDB (Time-series telemetry), PostgreSQL (User data) |
| **Message Broker**| MQTT / Apache Kafka (For high-throughput IoT ingestion) |
| **Deployment** | Docker, AWS (ECS, Timestream, Lambda) |

---

## Getting Started

### Prerequisites

Before running VoltWise locally, ensure you have the following installed:
* [Node.js](https://nodejs.org/) (v18.x or higher)
* [Docker](https://www.docker.com/) & Docker Compose
* A running instance of PostgreSQL/TimescaleDB (or use our provided Docker setup)

### Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/your-username/voltwise.git](https://github.com/your-username/voltwise.git)
   cd voltwise
