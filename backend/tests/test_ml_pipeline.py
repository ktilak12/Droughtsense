import pytest
import pandas as pd
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.ml_pipeline import DroughtMLPipeline

def create_synthetic_test_df(n_per_station=24, n_stations=2):
    np.random.seed(42)
    records = []
    dates = pd.date_range("2022-01-01", periods=n_per_station, freq="MS").strftime("%Y-%m-%d")
    for s in range(n_stations):
        for dt in dates:
            rain = float(np.random.uniform(0.0, 120.0))
            records.append({
                "station_name": f"Station_{s}",
                "observation_date": dt,
                "rainfall": rain,
                "temp_avg": float(np.random.uniform(20.0, 38.0)),
                "humidity": float(np.random.uniform(25.0, 85.0)),
                "wind_speed": float(np.random.uniform(1.0, 6.0)),
                "soil_moisture": float(np.random.uniform(10.0, 65.0)),
                "streamflow": float(np.random.uniform(0.2, 8.0)),
                "evapotranspiration": float(np.random.uniform(30.0, 75.0)),
                "spi": -1.5 if rain < 20 else 0.5,
                "spei": -1.6 if rain < 20 else 0.4,
                "severity_label": "Severe" if rain < 20 else ("Moderate" if rain < 45 else "Normal")
            })
    return pd.DataFrame(records)

def test_ml_pipeline_train_and_predict():
    df = create_synthetic_test_df(n_per_station=30, n_stations=2)

    metadata, artifact_path = DroughtMLPipeline.train_model(
        df=df,
        algorithm="Random Forest",
        test_size=0.2
    )

    assert "metrics" in metadata
    assert metadata["metrics"]["accuracy"] >= 0.0
    assert metadata["metrics"]["train_samples"] > 0
    assert metadata["metrics"]["test_samples"] > 0
    assert os.path.exists(artifact_path)

    # Test prediction
    test_input = {
        "rainfall": 5.0,
        "temp_avg": 34.0,
        "humidity": 25.0,
        "wind_speed": 4.5,
        "soil_moisture": 12.0,
        "streamflow": 0.4,
        "evapotranspiration": 65.0
    }
    prob, severity, explanation = DroughtMLPipeline.predict_single(artifact_path, test_input)
    assert 0.0 <= prob <= 100.0
    assert severity in ["Normal", "Moderate", "Severe", "Extreme"]
    assert "primary_factors" in explanation

    if os.path.exists(artifact_path):
        os.remove(artifact_path)

def test_data_leakage_prevention_strips_target_and_indices():
    df = create_synthetic_test_df(n_per_station=24, n_stations=2)

    # Intentionally pass leaky features that could allow target leakage
    leaky_features = ["rainfall", "temp_avg", "spi", "spei", "severity_label", "soil_moisture"]
    metadata, artifact_path = DroughtMLPipeline.train_model(
        df=df,
        algorithm="Random Forest",
        features=leaky_features,
        test_size=0.2
    )

    # Assert that SPI, SPEI, and target label were stripped to prevent target leakage
    trained_features = metadata["features"]
    assert "spi" not in trained_features
    assert "spei" not in trained_features
    assert "severity_label" not in trained_features
    assert "rainfall" in trained_features
    assert "temp_avg" in trained_features

    if os.path.exists(artifact_path):
        os.remove(artifact_path)

def test_missing_values_and_all_nan_features():
    df = create_synthetic_test_df(n_per_station=24, n_stations=2)
    # Introduce NaNs into features, including an entirely NaN column
    df.loc[::3, "rainfall"] = np.nan
    df["evapotranspiration"] = np.nan

    metadata, artifact_path = DroughtMLPipeline.train_model(
        df=df,
        algorithm="Decision Tree",
        test_size=0.2
    )

    assert "metrics" in metadata
    assert metadata["metrics"]["accuracy"] >= 0.0

    # Test prediction with missing and non-numeric fields
    test_input = {
        "rainfall": "15.2",  # String number
        "temp_avg": None,    # None value
        "humidity": np.nan,  # NaN value
        "wind_speed": 3.0,
        "soil_moisture": None,
        "streamflow": 0.5,
        "evapotranspiration": None
    }
    prob, severity, exp = DroughtMLPipeline.predict_single(artifact_path, test_input)
    assert 0.0 <= prob <= 100.0
    assert severity in ["Normal", "Moderate", "Severe", "Extreme"]

    if os.path.exists(artifact_path):
        os.remove(artifact_path)

def test_all_supported_algorithms():
    df = create_synthetic_test_df(n_per_station=24, n_stations=2)
    algorithms = ["XGBoost", "Decision Tree", "Logistic Regression"]

    for algo in algorithms:
        metadata, artifact_path = DroughtMLPipeline.train_model(
            df=df,
            algorithm=algo,
            test_size=0.2
        )
        assert metadata["metrics"]["accuracy"] >= 0.0
        assert os.path.exists(artifact_path)

        prob, severity, exp = DroughtMLPipeline.predict_single(
            artifact_path,
            {"rainfall": 10.0, "temp_avg": 30.0, "humidity": 40.0}
        )
        assert 0.0 <= prob <= 100.0
        assert severity in ["Normal", "Moderate", "Severe", "Extreme"]

        if os.path.exists(artifact_path):
            os.remove(artifact_path)
