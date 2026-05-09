"""
realtime_api.py
===============
Stage 3 — ML-Enabled Smart City Traffic System
-----------------------------------------------
FastAPI server that:
  1. Loads the trained RandomForest model artifact (traffic_model.pkl)
  2. Exposes POST /predict  — accepts raw IoT sensor data, returns ML prediction
  3. Exposes GET  /latest-traffic — returns the last 50 predictions as JSON
  4. Exposes GET  /health — simple liveness probe

Usage
-----
  uvicorn realtime_api:app --reload --port 8000

Dependencies
------------
  pip install fastapi uvicorn scikit-learn joblib pandas numpy
"""

from __future__ import annotations

import sys
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Deque

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MODEL_PATH = "traffic_model.pkl"
PREDICTION_BUFFER_SIZE = 50   # rolling window served to the frontend

# All intersection names from data_simulator.py — needed to rebuild one-hot cols
INTERSECTIONS = [
    "Jubilee Hills Checkpost",
    "Gachibowli Junction",
    "Ameerpet Crossroads",
    "Madhapur IT Corridor",
    "Tank Bund Road",
    "Hitech City Signal",
    "Begumpet Flyover",
    "LB Nagar Crossroads",
    "Kukatpally Housing Board",
    "Secunderabad Clock Tower",
    "Mehdipatnam Bus Stand",
    "PVNR Expressway Toll",
]

WEATHER_CONDITIONS = ["Clear", "Cloudy", "Light Rain", "Heavy Rain", "Fog", "Drizzle"]
PEAK_HOURS = set(range(8, 11)) | set(range(17, 20))


# ---------------------------------------------------------------------------
# App initialisation
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Smart City Traffic Prediction API",
    description="Real-time ML inference for IoT traffic sensors (Stage 3)",
    version="1.0.0",
)

# Allow the React dev server (port 5173) and any localhost port to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Model loading (on startup)
# ---------------------------------------------------------------------------

artifact: dict = {}
prediction_buffer: Deque[dict] = deque(maxlen=PREDICTION_BUFFER_SIZE)


@app.on_event("startup")
def load_model() -> None:
    global artifact
    model_file = Path(MODEL_PATH)
    if not model_file.exists():
        print(
            f"[realtime_api] WARN: '{MODEL_PATH}' not found — "
            "run train_model.py first. Predictions will fail."
        )
        return
    artifact = joblib.load(MODEL_PATH)
    print(
        f"[realtime_api] Model loaded — "
        f"{len(artifact['feature_cols'])} features"
    )


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class TrafficReading(BaseModel):
    """Incoming IoT sensor payload (mirrors data_simulator.generate_single_row)."""
    timestamp: str = Field(..., example="2025-05-09T10:30:00Z")
    sensor_id: str = Field(..., example="SENS-001")
    intersection_name: str = Field(..., example="MG Road & Residency Road")
    vehicle_count: int = Field(..., ge=0, example=120)
    average_speed_kmh: float = Field(..., ge=0, example=35.5)
    weather_condition: str = Field(..., example="Clear")


class PredictionResponse(BaseModel):
    timestamp: str
    sensor_id: str
    intersection_name: str
    weather_condition: str
    actual_vehicle_count: int
    predicted_vehicle_count: float
    average_speed_kmh: float


# ---------------------------------------------------------------------------
# Feature engineering helper (must mirror train_model.preprocess exactly)
# ---------------------------------------------------------------------------

def _build_feature_row(reading: TrafficReading, feature_cols: list[str]) -> pd.DataFrame:
    """
    Reconstruct the exact same feature vector that the model was trained on.
    Columns that don't appear in this reading are filled with 0 (consistent
    with pd.get_dummies behaviour for unseen categories).
    """
    ts = pd.Timestamp(reading.timestamp, tz="UTC")
    hour = ts.hour
    day_of_week = ts.dayofweek
    is_peak_hour = int(hour in PEAK_HOURS)

    row: dict[str, int | float] = {
        "hour": hour,
        "day_of_week": day_of_week,
        "is_peak_hour": is_peak_hour,
    }

    # One-hot: intersection_name
    for name in INTERSECTIONS:
        col = f"intersection_name_{name}"
        row[col] = int(reading.intersection_name == name)

    # One-hot: weather_condition
    for cond in WEATHER_CONDITIONS:
        col = f"weather_condition_{cond}"
        row[col] = int(reading.weather_condition == cond)

    df = pd.DataFrame([row])

    # Align columns to the exact training schema (fill missing with 0)
    df = df.reindex(columns=feature_cols, fill_value=0)
    return df


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict:
    """Liveness probe."""
    model_ready = bool(artifact)
    return {
        "status": "ok",
        "model_loaded": model_ready,
        "buffer_size": len(prediction_buffer),
        "server_time": datetime.now(timezone.utc).isoformat(),
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(reading: TrafficReading) -> PredictionResponse:
    """
    Accept one IoT sensor reading, run ML inference, store in buffer,
    and return the predicted vehicle count.
    """
    if not artifact:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Run train_model.py first.",
        )

    model = artifact["model"]
    feature_cols: list[str] = artifact["feature_cols"]

    X = _build_feature_row(reading, feature_cols)
    predicted = float(round(model.predict(X)[0], 2))

    result = PredictionResponse(
        timestamp=reading.timestamp,
        sensor_id=reading.sensor_id,
        intersection_name=reading.intersection_name,
        weather_condition=reading.weather_condition,
        actual_vehicle_count=reading.vehicle_count,
        predicted_vehicle_count=predicted,
        average_speed_kmh=reading.average_speed_kmh,
    )

    # Store in rolling buffer for the frontend
    prediction_buffer.append(result.model_dump())

    print(
        f"[realtime_api] Predicted {predicted:6.1f} vehicles  "
        f"| actual {reading.vehicle_count:4d}  "
        f"| {reading.intersection_name}  "
        f"| {reading.weather_condition}"
    )

    return result


@app.get("/latest-traffic")
def latest_traffic() -> dict:
    """
    Return the last N predictions stored in the in-memory ring buffer.
    The React dashboard polls this endpoint every 2 seconds.
    """
    return {
        "count": len(prediction_buffer),
        "predictions": list(prediction_buffer),
    }


# ---------------------------------------------------------------------------
# Dev entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("realtime_api:app", host="0.0.0.0", port=8000, reload=True)
