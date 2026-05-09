"""
data_simulator.py
=================
Stage 1 — ML-Enabled Smart City Traffic System
-----------------------------------------------
Generates a simulated IoT traffic dataset with the following schema:
  - timestamp           : ISO-8601 datetime string
  - sensor_id           : Unique sensor identifier (e.g. SENS-042)
  - intersection_name   : Human-readable intersection label
  - vehicle_count       : Number of vehicles detected in the interval
  - average_speed_kmh   : Average vehicle speed in km/h
  - weather_condition   : Categorical weather label

Usage
-----
  python data_simulator.py              # generates historical CSV + streams live rows
  python data_simulator.py --csv-only  # generates historical CSV only
  python data_simulator.py --stream-only # skips CSV, streams live rows only
"""

import argparse
import time
import sys
import random
from datetime import datetime, timedelta, timezone

import numpy as np
import pandas as pd


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

NUM_HISTORICAL_ROWS = 10_000
STREAM_INTERVAL_SECONDS = 2
CSV_OUTPUT_PATH = "historical_traffic.csv"

# City intersections — real Hyderabad traffic bottlenecks
INTERSECTIONS = [
    "Jubilee Hills Checkpost",
    "Gachibowli Junction",
    "Ameerpet Crossroads",
    "Madhapur IT Corridor",
    "Tank Bund",
    "Hitech City Signal",
    "Begumpet Flyover",
    "LB Nagar Crossroads",
    "Kukatpally Housing Board",
    "Secunderabad Clock Tower",
    "Mehdipatnam Bus Stand",
    "PVNR Expressway Toll",
]

# Auto-generate sensor IDs — one per intersection, zero-padded
SENSOR_IDS = [f"SENS-{str(i + 1).zfill(3)}" for i in range(len(INTERSECTIONS))]

# Sensor-to-intersection mapping (stable pairing)
SENSOR_INTERSECTION_MAP = dict(zip(SENSOR_IDS, INTERSECTIONS))

WEATHER_CONDITIONS = [
    "Clear",
    "Cloudy",
    "Light Rain",
    "Heavy Rain",
    "Fog",
    "Drizzle",
]

# Weather distribution weights (Clear is most common in Hyderabad)
WEATHER_WEIGHTS = [0.40, 0.25, 0.15, 0.08, 0.07, 0.05]

# Peak-hour ranges (hour of day, 24h) — affects vehicle count & speed
PEAK_HOURS = list(range(8, 11)) + list(range(17, 20))   # 8–10 AM, 5–7 PM


# ---------------------------------------------------------------------------
# Core data-generation helpers
# ---------------------------------------------------------------------------

def _random_sensor() -> tuple[str, str]:
    """Return a (sensor_id, intersection_name) pair at random."""
    sensor_id = random.choice(SENSOR_IDS)
    return sensor_id, SENSOR_INTERSECTION_MAP[sensor_id]


def _vehicle_count(hour: int, weather: str) -> int:
    """
    Simulate vehicle count based on time of day and weather.
    Peak hours → higher count; rain/fog → slight reduction.
    """
    if hour in PEAK_HOURS:
        base = np.random.randint(80, 200)
    elif 22 <= hour or hour < 5:          # Late night / early morning
        base = np.random.randint(5, 40)
    else:
        base = np.random.randint(30, 90)

    # Weather penalty
    penalty = {
        "Heavy Rain": 0.75,
        "Fog":        0.80,
        "Light Rain": 0.90,
        "Drizzle":    0.92,
        "Cloudy":     0.97,
        "Clear":      1.00,
    }.get(weather, 1.00)

    return max(1, int(base * penalty))


def _average_speed(hour: int, vehicle_count: int, weather: str) -> float:
    """
    Simulate average speed.  Higher traffic → lower speed; adverse weather → lower speed.
    """
    # Congestion effect: speed inversely proportional to count (capped)
    congestion_factor = max(0.3, 1 - (vehicle_count / 250))
    base_speed = np.random.uniform(20, 80) * congestion_factor

    # Weather penalty on speed
    speed_penalty = {
        "Heavy Rain": 0.70,
        "Fog":        0.65,
        "Light Rain": 0.85,
        "Drizzle":    0.88,
        "Cloudy":     0.95,
        "Clear":      1.00,
    }.get(weather, 1.00)

    return round(float(np.clip(base_speed * speed_penalty, 5.0, 120.0)), 2)


def _weather() -> str:
    """Sample a weather condition using realistic distribution weights."""
    return random.choices(WEATHER_CONDITIONS, weights=WEATHER_WEIGHTS, k=1)[0]


def generate_single_row(ts: datetime | None = None) -> dict:
    """
    Generate one row of simulated IoT traffic data.

    Parameters
    ----------
    ts : datetime, optional
        Explicit timestamp; defaults to current UTC time.

    Returns
    -------
    dict with keys: timestamp, sensor_id, intersection_name,
                    vehicle_count, average_speed_kmh, weather_condition
    """
    if ts is None:
        ts = datetime.now(timezone.utc)

    weather = _weather()
    sensor_id, intersection_name = _random_sensor()
    hour = ts.hour
    count = _vehicle_count(hour, weather)
    speed = _average_speed(hour, count, weather)

    return {
        "timestamp":          ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sensor_id":          sensor_id,
        "intersection_name":  intersection_name,
        "vehicle_count":      count,
        "average_speed_kmh":  speed,
        "weather_condition":  weather,
    }


# ---------------------------------------------------------------------------
# Historical dataset generator
# ---------------------------------------------------------------------------

def generate_historical_dataset(
    n_rows: int = NUM_HISTORICAL_ROWS,
    output_path: str = CSV_OUTPUT_PATH,
    days_back: int = 30,
) -> pd.DataFrame:
    """
    Generate a historical dataset of ``n_rows`` rows spanning ``days_back`` days
    and save it as a CSV file.

    Parameters
    ----------
    n_rows      : number of rows to generate
    output_path : CSV file path to write
    days_back   : how many days in the past to start timestamps from

    Returns
    -------
    pd.DataFrame of the generated dataset
    """
    print(f"[data_simulator] Generating {n_rows:,} historical rows ...")

    # Spread timestamps evenly across the date range for realism
    start_ts = datetime.now(timezone.utc) - timedelta(days=days_back)
    end_ts   = datetime.now(timezone.utc)
    total_seconds = int((end_ts - start_ts).total_seconds())

    # Draw random timestamps, then sort chronologically
    random_offsets = np.sort(np.random.randint(0, total_seconds, size=n_rows))
    timestamps = [start_ts + timedelta(seconds=int(s)) for s in random_offsets]

    rows = [generate_single_row(ts=ts) for ts in timestamps]
    df = pd.DataFrame(rows)

    # Enforce dtypes for downstream ML compatibility
    df["vehicle_count"]      = df["vehicle_count"].astype(np.int32)
    df["average_speed_kmh"]  = df["average_speed_kmh"].astype(np.float32)

    df.to_csv(output_path, index=False)
    print(f"[data_simulator] [OK] Historical dataset saved -> {output_path}")
    print(f"[data_simulator]   Shape        : {df.shape}")
    print(f"[data_simulator]   Date range   : {df['timestamp'].min()} -> {df['timestamp'].max()}")
    print(f"[data_simulator]   Sensors      : {df['sensor_id'].nunique()} unique")
    print(f"[data_simulator]   Weather dist :\n{df['weather_condition'].value_counts().to_string()}")
    print()

    return df


# ---------------------------------------------------------------------------
# Real-time streaming simulator
# ---------------------------------------------------------------------------

def stream_realtime_data(interval: float = STREAM_INTERVAL_SECONDS) -> None:
    """
    Continuously emit simulated IoT rows to stdout at ``interval``-second intervals,
    mimicking a live sensor feed.

    Press Ctrl+C to stop the stream.

    Parameters
    ----------
    interval : seconds between emitted rows (default: 2)
    """
    print(f"[data_simulator] Starting real-time stream  (Ctrl+C to stop) ...")
    print(f"[data_simulator] Emitting 1 row every {interval}s\n")

    header = ["timestamp", "sensor_id", "intersection_name",
              "vehicle_count", "average_speed_kmh", "weather_condition"]
    print(" | ".join(f"{h:<25}" for h in header))
    print("-" * (27 * len(header)))

    row_count = 0
    try:
        while True:
            row = generate_single_row()
            row_count += 1
            values = [
                f"{row['timestamp']:<25}",
                f"{row['sensor_id']:<25}",
                f"{row['intersection_name']:<25}",
                f"{str(row['vehicle_count']):<25}",
                f"{str(row['average_speed_kmh']):<25}",
                f"{row['weather_condition']:<25}",
            ]
            print(" | ".join(values), flush=True)
            time.sleep(interval)

    except KeyboardInterrupt:
        print(f"\n[data_simulator] Stream stopped after {row_count} rows.")
        sys.exit(0)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="IoT Traffic Data Simulator — Smart City ML Project (Stage 1)"
    )
    parser.add_argument(
        "--csv-only",
        action="store_true",
        help="Only generate the historical CSV; skip the live stream.",
    )
    parser.add_argument(
        "--stream-only",
        action="store_true",
        help="Skip CSV generation; only stream live rows.",
    )
    parser.add_argument(
        "--rows",
        type=int,
        default=NUM_HISTORICAL_ROWS,
        help=f"Number of historical rows to generate (default: {NUM_HISTORICAL_ROWS:,}).",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=STREAM_INTERVAL_SECONDS,
        help=f"Seconds between streamed rows (default: {STREAM_INTERVAL_SECONDS}).",
    )
    parser.add_argument(
        "--output",
        type=str,
        default=CSV_OUTPUT_PATH,
        help=f"Output CSV file path (default: {CSV_OUTPUT_PATH}).",
    )
    args = parser.parse_args()

    if not args.stream_only:
        generate_historical_dataset(
            n_rows=args.rows,
            output_path=args.output,
        )

    if not args.csv_only:
        stream_realtime_data(interval=args.interval)


if __name__ == "__main__":
    main()
