"""
data_simulator_api.py
=====================
Stage 3 companion — streams simulated IoT readings to the FastAPI /predict
endpoint every 2 seconds instead of printing them to stdout.

Usage
-----
  python data_simulator_api.py              # streams to localhost:8000
  python data_simulator_api.py --url http://localhost:8000 --interval 1
"""

import argparse
import sys
import time

import requests

# Reuse the generator from Stage 1 — no code duplication
from data_simulator import generate_single_row

API_URL_DEFAULT = "http://localhost:8000/predict"
INTERVAL_DEFAULT = 2.0


def stream_to_api(api_url: str = API_URL_DEFAULT, interval: float = INTERVAL_DEFAULT) -> None:
    print(f"[simulator->api] Streaming to {api_url}  (Ctrl+C to stop)")
    print(f"[simulator->api] Interval: {interval}s\n")

    row_count = 0
    error_count = 0

    try:
        while True:
            row = generate_single_row()
            try:
                resp = requests.post(api_url, json=row, timeout=5)
                resp.raise_for_status()
                result = resp.json()
                row_count += 1
                pred = result.get("predicted_vehicle_count", "?")
                actual = result.get("actual_vehicle_count", "?")
                intersection = result.get("intersection_name", "?")
                print(
                    f"  [{row_count:04d}]  {intersection:<35}  "
                    f"actual={actual:<4}  predicted={pred:<6.1f}"
                )
            except requests.exceptions.ConnectionError:
                error_count += 1
                print(
                    f"  [ERR]  Could not connect to {api_url}. "
                    "Is realtime_api.py running?",
                    file=sys.stderr,
                )
            except requests.exceptions.HTTPError as e:
                error_count += 1
                print(f"  [ERR]  HTTP {e.response.status_code}: {e}", file=sys.stderr)

            time.sleep(interval)

    except KeyboardInterrupt:
        print(f"\n[simulator→api] Stopped after {row_count} successful rows, {error_count} errors.")
        sys.exit(0)


def main() -> None:
    parser = argparse.ArgumentParser(description="Stream simulated IoT data to the FastAPI backend.")
    parser.add_argument("--url", default=API_URL_DEFAULT, help="POST endpoint URL")
    parser.add_argument("--interval", type=float, default=INTERVAL_DEFAULT, help="Seconds between rows")
    args = parser.parse_args()
    stream_to_api(api_url=args.url, interval=args.interval)


if __name__ == "__main__":
    main()
