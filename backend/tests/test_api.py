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
    # Fetch existing datasets with processed records or load demo
    ds_resp = client.get("/api/datasets")
    assert ds_resp.status_code == 200
    datasets = ds_resp.json()
    processed_ds = [d for d in datasets if d.get("processing_status") == "PROCESSED"]
    if not processed_ds:
        load_resp = client.post("/api/datasets/load-demo")
        ds_id = load_resp.json().get("dataset_id")
    else:
        ds_id = processed_ds[0]["id"]

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

def test_environmental_trends_aggregation():
    resp_all = client.get("/api/analytics/trends?location_name=All&limit=30")
    assert resp_all.status_code == 200
    data = resp_all.json()
    assert isinstance(data, list)
    if data:
        dates = [item["date"] for item in data]
        # In aggregated "All" mode, each date must be unique (no duplicate dates across stations)
        assert len(dates) == len(set(dates))
        assert "rainfall" in data[0]
        assert "temp_avg" in data[0]
        assert "severity" in data[0]

def test_dataset_upload_case_insensitive_and_cascade_delete():
    import io
    csv_content = (
        "date,rainfall,temp_min,temp_max,temp_avg,humidity,wind_speed,soil_moisture,streamflow,evapotranspiration,location\n"
        "2026-01-01,10.0,15.0,25.0,20.0,60.0,3.0,30.0,5.0,25.0,StationAlpha\n"
        "2026-01-02,0.0,14.0,26.0,20.0,55.0,4.0,28.0,4.5,26.0,StationAlpha\n"
    )
    file_tuple = ("test_data.CSV", io.BytesIO(csv_content.encode("utf-8")), "text/csv")
    upload_resp = client.post("/api/datasets/upload", files={"file": file_tuple})
    assert upload_resp.status_code == 200
    res_data = upload_resp.json()
    assert "dataset" in res_data
    ds_data = res_data["dataset"]
    assert ds_data["validation_status"] in ["VALID", "WARNING"]
    ds_id = ds_data["id"]

    # Delete dataset and confirm cascade
    del_resp = client.delete(f"/api/datasets/{ds_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "SUCCESS"

    # Confirm 404 on get
    get_resp = client.get(f"/api/datasets/{ds_id}")
    assert get_resp.status_code == 404
