"""
train_model.py
==============
Stage 2 -- ML-Enabled Smart City Traffic System
------------------------------------------------
Trains a RandomForestRegressor on the historical IoT traffic dataset
produced by Stage 1 (historical_traffic.csv) and saves the trained
model artifact to traffic_model.pkl for use by Stage 3's real-time
prediction pipeline.

Pipeline summary
----------------
  1. Load  historical_traffic.csv
  2. Feature engineering  (hour, day_of_week, one-hot encoding)
  3. Train / test split
  4. Train RandomForestRegressor
  5. Evaluate  (MAE + R-squared)
  6. Persist  model + feature column list -> traffic_model.pkl

Usage
-----
  python train_model.py
  python train_model.py --input custom_traffic.csv --output my_model.pkl
  python train_model.py --n-estimators 200 --test-size 0.25
"""

import argparse
import sys
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split


# ---------------------------------------------------------------------------
# Defaults
# ---------------------------------------------------------------------------

DEFAULT_INPUT  = "historical_traffic.csv"
DEFAULT_OUTPUT = "traffic_model.pkl"
DEFAULT_N_ESTIMATORS = 150
DEFAULT_TEST_SIZE    = 0.20
RANDOM_STATE         = 42


# ---------------------------------------------------------------------------
# Step 1 -- Data loading
# ---------------------------------------------------------------------------

def load_data(path: str) -> pd.DataFrame:
    """Load the historical traffic CSV and validate required columns."""
    p = Path(path)
    if not p.exists():
        print(f"[train_model] ERROR: Input file not found -> {path}")
        print("[train_model]        Run data_simulator.py first to generate it.")
        sys.exit(1)

    df = pd.read_csv(path)

    required = {
        "timestamp", "sensor_id", "intersection_name",
        "vehicle_count", "average_speed_kmh", "weather_condition",
    }
    missing = required - set(df.columns)
    if missing:
        print(f"[train_model] ERROR: CSV is missing columns: {missing}")
        sys.exit(1)

    print(f"[train_model] Loaded '{path}'  ->  {len(df):,} rows x {df.shape[1]} columns")
    return df


# ---------------------------------------------------------------------------
# Step 2 -- Feature engineering & preprocessing
# ---------------------------------------------------------------------------

def preprocess(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series, list[str]]:
    """
    Build the feature matrix X and target vector y.

    Engineered features
    -------------------
    - hour          : int  (0-23)  extracted from timestamp
    - day_of_week   : int  (0=Mon .. 6=Sun)  extracted from timestamp
    - is_peak_hour  : int  binary flag  (peak = 8-10 AM, 5-7 PM)
    - one-hot cols  : intersection_name  x  weather_condition

    Target
    ------
    - vehicle_count (int)
    """
    df = df.copy()

    # --- Parse timestamp -------------------------------------------------
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    df["hour"]         = df["timestamp"].dt.hour.astype(np.int8)
    df["day_of_week"]  = df["timestamp"].dt.dayofweek.astype(np.int8)

    # Peak-hour binary feature (morning + evening rush)
    peak_hours = set(range(8, 11)) | set(range(17, 20))
    df["is_peak_hour"] = df["hour"].isin(peak_hours).astype(np.int8)

    # --- One-hot encode categoricals ------------------------------------
    df_encoded = pd.get_dummies(
        df,
        columns=["intersection_name", "weather_condition"],
        drop_first=False,   # keep all levels -- Stage 3 must match exactly
        dtype=np.int8,
    )

    # --- Build feature list --------------------------------------------
    # Include time signals + all one-hot columns; exclude raw & target cols
    drop_cols = {
        "timestamp", "sensor_id",
        "vehicle_count", "average_speed_kmh",  # would be data leakage
    }
    feature_cols = [c for c in df_encoded.columns if c not in drop_cols]

    X = df_encoded[feature_cols]
    y = df_encoded["vehicle_count"]

    print(f"[train_model] Feature engineering complete.")
    print(f"[train_model]   Features  : {len(feature_cols)}")
    print(f"[train_model]   Feature list: {feature_cols}")
    print(f"[train_model]   Target    : vehicle_count")
    print(f"[train_model]   X shape   : {X.shape}  |  y shape: {y.shape}")

    return X, y, feature_cols


# ---------------------------------------------------------------------------
# Step 3 -- Train / test split
# ---------------------------------------------------------------------------

def split_data(
    X: pd.DataFrame,
    y: pd.Series,
    test_size: float = DEFAULT_TEST_SIZE,
) -> tuple:
    X_train, X_test, y_train, y_test = train_test_split(
        X, y,
        test_size=test_size,
        random_state=RANDOM_STATE,
    )
    print(f"\n[train_model] Train/test split  (test_size={test_size:.0%})")
    print(f"[train_model]   Training rows : {len(X_train):,}")
    print(f"[train_model]   Testing rows  : {len(X_test):,}")
    return X_train, X_test, y_train, y_test


# ---------------------------------------------------------------------------
# Step 4 -- Model training
# ---------------------------------------------------------------------------

def train(
    X_train: pd.DataFrame,
    y_train: pd.Series,
    n_estimators: int = DEFAULT_N_ESTIMATORS,
) -> RandomForestRegressor:
    """Fit a RandomForestRegressor and return the trained model."""
    print(f"\n[train_model] Training RandomForestRegressor ...")
    print(f"[train_model]   n_estimators = {n_estimators}")
    print(f"[train_model]   random_state = {RANDOM_STATE}")

    t0 = time.perf_counter()
    model = RandomForestRegressor(
        n_estimators=n_estimators,
        max_depth=None,          # fully grown trees -- forest diversity handles overfitting
        min_samples_split=5,
        min_samples_leaf=2,
        n_jobs=-1,               # use all available CPU cores
        random_state=RANDOM_STATE,
    )
    model.fit(X_train, y_train)
    elapsed = time.perf_counter() - t0

    print(f"[train_model] Training complete in {elapsed:.2f}s")
    return model


# ---------------------------------------------------------------------------
# Step 5 -- Evaluation
# ---------------------------------------------------------------------------

def evaluate(
    model: RandomForestRegressor,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    """Compute and print MAE and R-squared on the held-out test set."""
    y_pred = model.predict(X_test)

    mae = mean_absolute_error(y_test, y_pred)
    r2  = r2_score(y_test, y_pred)

    # Feature importance (top 10)
    importances = pd.Series(
        model.feature_importances_,
        index=X_test.columns,
    ).sort_values(ascending=False).head(10)

    print("\n" + "=" * 55)
    print("  MODEL EVALUATION RESULTS")
    print("=" * 55)
    print(f"  Mean Absolute Error (MAE)  : {mae:.4f} vehicles")
    print(f"  R-squared (R2) score       : {r2:.4f}")
    print("-" * 55)
    print("  Top-10 Feature Importances:")
    for feat, imp in importances.items():
        bar = "#" * int(imp * 50)
        print(f"    {feat:<35}  {imp:.4f}  {bar}")
    print("=" * 55 + "\n")

    return {"mae": mae, "r2": r2}


# ---------------------------------------------------------------------------
# Step 6 -- Persist model artifact
# ---------------------------------------------------------------------------

def save_artifact(
    model: RandomForestRegressor,
    feature_cols: list[str],
    output_path: str = DEFAULT_OUTPUT,
) -> None:
    """
    Save the model AND its exact feature column list as a single dict.

    Stage 3 must rebuild the feature vector with identical column names
    and order before calling model.predict().  Bundling feature_cols
    inside the same artifact guarantees they stay in sync.

    Artifact structure
    ------------------
    {
        "model"        : RandomForestRegressor (fitted),
        "feature_cols" : list[str],
    }
    """
    artifact = {
        "model":        model,
        "feature_cols": feature_cols,
    }
    joblib.dump(artifact, output_path, compress=3)
    size_kb = Path(output_path).stat().st_size / 1024
    print(f"[train_model] [OK] Model artifact saved -> {output_path}  ({size_kb:.1f} KB)")
    print(f"[train_model]      Contains: trained RandomForestRegressor + {len(feature_cols)} feature column names")
    print(f"[train_model]      Load in Stage 3 with: joblib.load('{output_path}')")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Stage 2: Train RandomForest traffic volume predictor"
    )
    parser.add_argument(
        "--input", type=str, default=DEFAULT_INPUT,
        help=f"Path to historical CSV (default: {DEFAULT_INPUT})",
    )
    parser.add_argument(
        "--output", type=str, default=DEFAULT_OUTPUT,
        help=f"Path to save the model artifact (default: {DEFAULT_OUTPUT})",
    )
    parser.add_argument(
        "--n-estimators", type=int, default=DEFAULT_N_ESTIMATORS,
        help=f"Number of trees in the forest (default: {DEFAULT_N_ESTIMATORS})",
    )
    parser.add_argument(
        "--test-size", type=float, default=DEFAULT_TEST_SIZE,
        help=f"Fraction of data used for testing (default: {DEFAULT_TEST_SIZE})",
    )
    args = parser.parse_args()

    print("\n[train_model] ===== Stage 2: Model Training =====\n")

    # 1. Load
    df = load_data(args.input)

    # 2. Preprocess
    X, y, feature_cols = preprocess(df)

    # 3. Split
    X_train, X_test, y_train, y_test = split_data(X, y, test_size=args.test_size)

    # 4. Train
    model = train(X_train, y_train, n_estimators=args.n_estimators)

    # 5. Evaluate
    evaluate(model, X_test, y_test)

    # 6. Save
    save_artifact(model, feature_cols, output_path=args.output)

    print("[train_model] Stage 2 complete. Ready for Stage 3 (real-time inference).\n")


if __name__ == "__main__":
    main()
