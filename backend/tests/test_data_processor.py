import pytest
import pandas as pd
import numpy as np
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.services.data_processor import DataProcessor

def test_formula_injection_sanitization():
    unsafe_val = "=SUM(A1:A10)"
    sanitized = DataProcessor.sanitize_cell(unsafe_val)
    assert sanitized.startswith("'")

def test_auto_detect_columns():
    df = pd.DataFrame({
        "Observation_Date": ["2023-01-01"],
        "Precipitation": [12.4],
        "Mean_Temp": [28.2],
        "Relative_Humidity": [65.0]
    })
    mapping = DataProcessor.auto_detect_columns(df)
    assert mapping["date"] == "Observation_Date"
    assert mapping["rainfall"] == "Precipitation"
    assert mapping["temp_avg"] == "Mean_Temp"
    assert mapping["humidity"] == "Relative_Humidity"

def test_data_validation_report():
    df = pd.DataFrame({
        "date": ["2023-01-01", "2023-02-01", "invalid-date", "2023-01-01"],
        "rainfall": [10.0, -5.0, 30.0, 10.0],
        "temp_avg": [25.0, 26.0, 27.0, 25.0]
    })
    is_valid, report, clean_df = DataProcessor.validate_dataframe(df)
    assert is_valid is True
    assert report["duplicate_rows"] == 1
    assert report["invalid_dates"] == 1
    # Check that negative rainfall was clamped to zero
    assert (clean_df["rainfall"] >= 0).all()

def test_temperature_inversion_and_missing_values():
    df = pd.DataFrame({
        "date": ["2023-01-01", "2023-02-01"],
        "rainfall": [20.0, 45.0],
        "temp_min": [35.0, 20.0],  # First row inverted (min > max)
        "temp_max": [25.0, 32.0]
    })
    is_valid, report, clean_df = DataProcessor.validate_dataframe(df)
    assert is_valid is True
    # After inversion correction, temp_max should be >= temp_min
    assert (clean_df["temp_max"] >= clean_df["temp_min"]).all()
    # temp_avg should be auto-derived
    assert "temp_avg" in clean_df.columns
    assert not clean_df["temp_avg"].isna().any()
