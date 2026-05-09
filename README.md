# Traffic Intelligence — Smart City ML Demo

End-to-end prototype: **simulated IoT traffic data** → **historical dataset** → **trained model** → **real-time FastAPI inference** → **React live dashboard** (Hyderabad urban grid theme).

Public repo: [gaganpasupuleti/Traffic_Intelligence](https://github.com/gaganpasupuleti/Traffic_Intelligence)

---

## What this project is for

| Goal | How this repo supports it |
|------|---------------------------|
| **Teaching / portfolio** | Clear stages: data generation → training → API → UI. |
| **Live demo** | Run three processes: API, optional data stream, and the Vite frontend to show “live” predictions and charts. |
| **ML pipeline pattern** | Same schema from simulator through CSV, model, and `/predict` so feature engineering stays consistent. |

It does **not** connect to real road sensors; counts and weather are **synthetic** but structured like a real smart-city feed.

---

## Architecture (data flow)

```text
data_simulator.py          historical_traffic.csv          train_model.py
     │                              │                           │
     │  (optional live CSV +         │  (features +              │
     │   stdout stream)              │   RandomForest)           │
     │                              ▼                           ▼
     │                      traffic_model.pkl ◄──────────────────┘
     │                              │
     │                              │  load at startup
     ▼                              ▼
data_simulator_api.py ──POST──► realtime_api.py (FastAPI)
  (loop: JSON rows)              /predict, /latest-traffic, /health
                                       │
                                       │  GET /latest-traffic (poll ~2s)
                                       ▼
                              smart-city-dashboard (React + Vite)
                              Charts, status cards, prediction table
```

---

## Repository layout

| Path | Purpose |
|------|---------|
| `data_simulator.py` | **Stage 1 — Data.** Builds `historical_traffic.csv`, defines Hyderabad-style **intersections**, sensors, weather, peak hours; can stream rows to stdout. Core function: `generate_single_row()`. |
| `train_model.py` | **Stage 2 — Training.** Reads the CSV, engineers features (time, one-hot intersection/weather), trains **RandomForestRegressor**, saves **`traffic_model.pkl`** (+ metadata for inference). |
| `realtime_api.py` | **Stage 3 — API.** FastAPI app: loads **`traffic_model.pkl`**, **`POST /predict`** for one IoT row, **`GET /latest-traffic`** for the last N predictions (dashboard), **`GET /health`**. CORS enabled for the dev UI. |
| `data_simulator_api.py` | **Stage 3 helper.** Calls `generate_single_row()` in a loop and **POSTs** each row to `http://localhost:8000/predict` (configurable `--url`, `--interval`). |
| `traffic_model.pkl` | Trained model artifact used by `realtime_api.py`. |
| `historical_traffic.csv` | Sample historical data (regenerate with `data_simulator.py` if you change the schema or intersections). |
| `smart-city-dashboard/` | **Stage 4 — UI.** React 19 + Vite + Recharts + Tailwind 4; **`src/Dashboard.jsx`** polls **`http://localhost:8000/latest-traffic`** every 2 seconds. |
| `ML_Enabled_Smart_City_Presentation_with_Team (1).pptx` | Team presentation asset (optional for code runs). |

---

## Stages in order (what we built)

1. **Stage 1 — Synthetic IoT data** (`data_simulator.py`)  
   Produces rows: `timestamp`, `sensor_id`, `intersection_name`, `vehicle_count`, `average_speed_kmh`, `weather_condition`.

2. **Stage 2 — Model** (`train_model.py`)  
   Trains on the CSV; writes `traffic_model.pkl`. Re-run after you change data generation in a way that affects labels or categorical values.

3. **Stage 3 — Real-time API** (`realtime_api.py`)  
   Serves predictions and keeps a rolling buffer for the dashboard.

4. **Stage 3 — Stream simulator** (`data_simulator_api.py`)  
   Feeds the API continuously so the dashboard shows **LIVE** activity.

5. **Stage 4 — Dashboard** (`smart-city-dashboard`)  
   Visualizes recent predictions vs actuals, weather, and trends for the **Hyderabad Urban Grid** branding.

**Polish applied in this project:** city copy and meta set to **Hyderabad**; intersection list uses real Hyderabad-style location names; Git repo initialized and pushed to GitHub; root `.gitignore` excludes `node_modules`, `__pycache__`, virtualenvs, etc.

---

## How to run locally

### Python (API + optional stream)

From the **repository root** (where `realtime_api.py` lives):

```bash
# Terminal 1 — API (if `uvicorn` is not on PATH, use python -m)
python -m uvicorn realtime_api:app --reload --port 8000

# Terminal 2 — synthetic sensor stream (optional, for live updates)
python data_simulator_api.py
```

**Python dependencies** (install as needed): `fastapi`, `uvicorn`, `scikit-learn`, `joblib`, `pandas`, `numpy`, `requests`, `pydantic` — plus simulator extras: `pyarrow` not required; simulator uses `pandas`/`numpy`.

### Frontend

```bash
cd smart-city-dashboard
npm install
npm run dev
```

Open **http://localhost:5173**. The UI expects the API on **http://localhost:8000** (see `API_BASE` in `Dashboard.jsx`).

- If **5173** shows “connection refused”, the Vite dev server is not running — start `npm run dev`.
- If the dashboard shows **OFFLINE**, start the API on port 8000 (and optionally the simulator).

---

## API quick reference

| Method | Path | Role |
|--------|------|------|
| `POST` | `/predict` | Body: one IoT JSON row → returns prediction + echoes key fields. |
| `GET` | `/latest-traffic` | Last ~50 buffered predictions for charts/table. |
| `GET` | `/health` | Liveness check. |

---

## Important consistency note

The **`INTERSECTIONS`** list (and order) used when **building features** for inference in `realtime_api.py` must stay aligned with:

- `data_simulator.py` (what the stream generates), and  
- How **`historical_traffic.csv`** / **`traffic_model.pkl`** were produced.

If you rename or reorder intersections in the simulator, **regenerate the CSV**, **retrain** (`train_model.py`), and **update** the API’s intersection list to match.

---

## Git

- Remote: `https://github.com/gaganpasupuleti/Traffic_Intelligence.git`
- Default branch: `main`

After edits:

```bash
git add -A
git commit -m "Describe your change"
git push
```

---

## License / credits

Use and attribution as appropriate for your course or team; add a `LICENSE` file if you need a formal open-source license.
