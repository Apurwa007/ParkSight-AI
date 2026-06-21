# 🏙️ ParkSight-AI: Traffic Command Center & Predictive Intelligence

ParkSight-AI is an advanced, AI-powered traffic command center and predictive intelligence platform designed to forecast, analyze, and mitigate double-parking congestion. Focusing on dense urban corridors like Bengaluru (Bangalore), India, the system converts raw traffic violation telemetry into actionable, localized intervention strategies in real-time.

---

## 🚀 Key Features

*   **📍 HDBSCAN Hotspot Cluster Detection**: Automatically parses millions of raw police traffic violations and groups them into high-density congestion zones using **HDBSCAN** clustering.
*   **🔮 Multi-Horizon Congestion Forecasting**: Trains and deploys **XGBoost Regressors** to predict violation counts and congestion levels over short-term (1h) and medium-term (3h) horizons.
*   **🧠 SHAP Explainability & Feature Attribution**: Computes mathematical feature importances via **SHAP (SHapley Additive exPlanations)**, mapping risk drivers (e.g., rainfall, public holidays, temporal diurnal cycles) to specific hotspots.
*   **🤖 AI Copilot Decision Support**: Uses **Gemini 1.5 Flash** (via Google Generative AI) to convert complex SHAP values into natural language insights, providing dynamic action plans and adjoining road advisories (e.g., predicting bottlenecks on arterials).
*   **🛡️ Tactical Resource War Room**: Features a resource optimizer that uses a greedy knapsack algorithm to allocate parking enforcement officers (🚓) and tow trucks (🚚) to maximize the reduction of the **City Mobility Risk Score (CMRS)**.
*   **🗺️ Interactive Dark Matter Map**: Next-generation web UI utilizing **MapLibre GL** with CartoDB tiles to visualize:
    *   *Pulsing Risk Hotspots* (Critical, High, Medium, Low risk categories).
    *   *Spillover Network Links* depicting cascading risk transfers between adjacent sectors.
    *   *Pulsing Risk Boundary Rings* and *Density Heatmaps*.
    *   *Live Resource Placements* showing officer and truck symbols directly at allocated hotspots.

---

## 🛠️ Tech Stack

### Frontend
*   **Core**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
*   **Mapping**: MapLibre GL (CartoDB Dark Matter tiles)
*   **Icons & Style**: Lucide React, CSS Transitions & Animations

### Backend
*   **Framework**: FastAPI, Uvicorn (Asynchronous REST API endpoints)
*   **Database Interface**: SQLAlchemy (ORM mapping), Psycopg2
*   **Machine Learning**: XGBoost, HDBSCAN, SHAP, Joblib, Scikit-learn
*   **Data Processing**: Pandas, NumPy
*   **External APIs**: Open-Meteo API (Historical and live weather parameters), Python Holidays (India regional holiday calendars), Google Generative AI (Gemini SDK)

### Infrastructure
*   **Containerization**: Docker, Docker Compose
*   **Database**: PostgreSQL with PostGIS extension (for spatial analysis)

---

## 📐 System Architecture

```mermaid
graph TD
    A[Raw Violations CSV] -->|Upload Script| B[(Postgres + PostGIS)]
    B -->|Fetch Dataset| C[ETL Pipeline & Feature Prep]
    C -->|Clustering| D[HDBSCAN Hotspot Finder]
    C -->|Historical Weather & Holidays| E[ML Training & Inference Engine]
    E -->|Train Models| F[XGBoost 1h/3h Predictors]
    
    F -->|Forecast Risk & Trend| G[Database Seeder / Scenarios]
    G -->|Commit States| B
    
    B -->|Query State| H[FastAPI REST API]
    H -->|Input Resources| I[Tactical War Room Optimizer]
    H -->|Inference Parameters| J[Gemini 1.5 Flash Copilot]
    
    J -->|Natural Language Advisory| K[Intelligence Drawer]
    I -->|Greedy Knapsack Strategy| L[Interactive Map UI]
    H -->|Dashboard State & GeoJSON| M[Next.js Frontend]
    M --> L
    M --> K
```

---

## 📂 Project Structure

```
ParkSight-AI/
├── backend/                   # FastAPI Backend Service
│   ├── model_artifacts/       # Saved joblib models and cluster data
│   ├── copilot.py             # Gemini Copilot integration & fallback rules
│   ├── database.py            # SQLAlchemy database connection configuration
│   ├── etl.py                 # Core ETL, scenario loader, and metric calculations
│   ├── main.py                # FastAPI app endpoints and entrypoint
│   ├── ml_engine.py           # HDBSCAN clustering, XGBoost training, and SHAP explainer
│   ├── models.py              # SQLAlchemy DB models (Hotspot, CityMetric, Alert, Violation)
│   ├── requirements.txt       # Python dependencies
│   ├── setup_demo.py          # Scripts to pre-seed demonstration scenario data
│   └── war_room.py            # Greedy knapsack resource allocation algorithm
├── frontend/                  # Next.js Frontend App
│   ├── src/
│   │   ├── app/
│   │   │   ├── globals.css    # Core styling & custom animations
│   │   │   ├── layout.tsx     # Next.js root layout
│   │   │   └── page.tsx       # Main Command Center Dashboard
│   │   └── components/
│   │       ├── Map.tsx        # MapLibre GL map component & legend renderer
│   │       ├── MapControls.tsx# Map overlay layer toggles
│   │       └── IntelligenceDrawer.tsx # Side drawer displaying SHAP metrics, SVG graphs & Copilot
│   ├── package.json           # Frontend scripts & Node dependencies
│   └── tailwind.config.js     # Tailwind configurations
├── docker-compose.yml         # Multi-container local orchestration (Postgres, Backend, Frontend)
└── README.md                  # System Documentation
```

---

## ⚙️ Environment Configuration

Create a `.env` file in the root directory to store your environment keys.

```env
# Database Configuration
DATABASE_URL=postgresql://parksight_user:parksight_password@postgres:5432/parksight_db

# Gemini API Key (Required for Phase 3 Smart Copilot Insights)
GEMINI_API_KEY=your_gemini_api_key_here

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## 🏃 Getting Started

### Prerequisites
*   Docker & Docker Compose installed on your system.
*   *(Optional)* Python 3.10+ and Node.js 18+ (if running without Docker).

### Option 1: Running with Docker (Recommended)

1. Clone this repository and navigate to the folder:
   ```bash
   git clone https://github.com/Apurwa007/ParkSight-AI.git
   cd ParkSight-AI
   ```
2. Configure your environment variables in `.env` at the root.
3. Start the containers using Docker Compose:
   ```bash
   docker-compose up --build
   ```
4. Access the applications:
   *   **Frontend Dashboard**: [http://localhost:3000](http://localhost:3000)
   *   **FastAPI Swagger Documentation**: [http://localhost:8000/docs](http://localhost:8000/docs)

### Option 2: Running Manually (Development Mode)

#### 1. Setup Backend
1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Configure environment variables in `.env` inside the `backend` folder.
5. Run the FastAPI server:
   ```bash
   python main.py
   ```
   *The backend will automatically create table structures and auto-seed the default scenario if the database is empty.*

#### 2. Setup Frontend
1. Open a new terminal and navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📊 Demo Scenarios

ParkSight-AI is equipped with a demonstration scenario engine accessible directly from the dashboard header, enabling you to inspect system behavior under varying traffic profiles:

1.  **Market Evening Peak (Rainfall Focus)**:
    *   Simulates heavy monsoon evening rainfall (18.5mm) and a drop in temperature (22°C).
    *   Generates a critical surge in violations around commercial markets (K.R. Market, Kalasipalyam).
    *   *Copilot Advice*: Highlights drainage obstructions and schedules high-priority double-parking enforcement.
2.  **Metro Morning Rush (Commuter Peak)**:
    *   Simulates early weekday morning commuter parking violations near metro transit zones (Indiranagar, Outer Ring Road).
    *   *Copilot Advice*: Coordinates with transit police to clear bus lanes and direct commuters to park & ride facilities.
3.  **Commercial Weekend Surge (Holiday Shift)**:
    *   Simulates weekend afternoon shopping congestion overlapping with a regional public holiday.
    *   *Copilot Advice*: Advises opening commercial parking garage reserves and outlines arterial road bypass routes.

---

## 🤝 Contributing

Contributions are welcome! Please open an issue or submit a pull request for any bugs, UI improvements, or feature suggestions.
