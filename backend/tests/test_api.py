import pytest
from fastapi.testclient import TestClient
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.main import app

client = TestClient(app)

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert "database" in data

def test_analytics_summary():
    response = client.get("/api/analytics/summary")
    assert response.status_code == 200
    data = response.json()
    assert "monitored_stations" in data
    assert "severity_breakdown" in data

def test_manual_prediction():
    payload = {
        "location_name": "Test Station",
        "prediction_date": "2026-10-26",
        "rainfall": 5.0,
        "temp_min": 22.0,
        "temp_max": 36.0,
        "temp_avg": 29.0,
        "humidity": 30.0,
        "wind_speed": 4.0,
        "soil_moisture": 14.0,
        "streamflow": 0.5,
        "evapotranspiration": 60.0,
        "spi": -1.8,
        "spei": -1.9
    }
    response = client.post("/api/predictions", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "drought_probability" in data
    assert "severity" in data
    assert "warning_status" in data
    assert data["severity"] in ["Normal", "Moderate", "Severe", "Extreme"]
    assert data["warning_status"] in ["Normal", "Watch", "Warning", "Critical"]

def test_prediction_history_and_export():
    hist_response = client.get("/api/predictions")
    assert hist_response.status_code == 200
    hist_data = hist_response.json()
    assert "items" in hist_data
    assert hist_data["total"] >= 1

    export_response = client.get("/api/predictions/export/csv")
    assert export_response.status_code == 200
    assert "text/csv" in export_response.headers["content-type"]

def test_batch_prediction():
    # Fetch existing datasets
    ds_resp = client.get("/api/datasets")
    assert ds_resp.status_code == 200
    datasets = ds_resp.json()
    if datasets:
        ds_id = datasets[0]["id"]
        resp = client.post(f"/api/predictions/batch/{ds_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "SUCCESS"
        assert "predictions_generated" in data

def test_prediction_deletion():
    # Create a prediction to delete
    payload = {
        "location_name": "Temporary Delete Station",
        "prediction_date": "2026-11-01",
        "rainfall": 15.0,
        "temp_avg": 27.0
    }
    create_resp = client.post("/api/predictions", json=payload)
    assert create_resp.status_code == 200
    pred_id = create_resp.json()["id"]

    del_resp = client.delete(f"/api/predictions/{pred_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "SUCCESS"

    # Verify not found after delete
    get_resp = client.get(f"/api/predictions/{pred_id}")
    assert get_resp.status_code == 404

def test_settings_get_and_update():
    get_resp = client.get("/api/settings")
    assert get_resp.status_code == 200
    cfg = get_resp.json()
    assert "severity_thresholds" in cfg
    assert "warning_thresholds" in cfg

    # Update with valid payload
    put_resp = client.put("/api/settings", json=cfg)
    assert put_resp.status_code == 200
    assert put_resp.json()["default_location"] == cfg["default_location"]
