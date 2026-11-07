import os
import json
import csv
import io
import numpy as np
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.db_models import PredictionRecord, MLModel, Location, EnvironmentalRecord, Dataset
from app.schemas.schemas import ManualPredictionRequest, PredictionResponse, PredictionExplanation
from app.services.ml_pipeline import DroughtMLPipeline
from app.services.early_warning import EarlyWarningEngine
from app.services.spi_spei import DroughtIndexCalculator

router = APIRouter()

@router.post("", response_model=PredictionResponse)
def create_prediction(payload: ManualPredictionRequest, db: Session = Depends(get_db)):
    """
    Generate drought probability, severity, warning level, and explanation for an environmental observation snapshot.
    Uses the active machine learning model or validated rule-based fallback.
    """
    input_dict = {
        "rainfall": payload.rainfall,
        "temp_min": payload.temp_min,
        "temp_max": payload.temp_max,
        "temp_avg": payload.temp_avg or ((payload.temp_min + payload.temp_max) / 2.0 if payload.temp_min and payload.temp_max else 28.0),
        "humidity": payload.humidity,
        "wind_speed": payload.wind_speed,
        "soil_moisture": payload.soil_moisture,
        "streamflow": payload.streamflow,
        "evapotranspiration": payload.evapotranspiration,
        "spi": payload.spi,
        "spei": payload.spei
    }

    # Find active model
    active_model = db.query(MLModel).filter(MLModel.is_active == True).first()
    
    if active_model and active_model.artifact_path and os.path.exists(active_model.artifact_path):
        try:
            drought_prob, severity, ml_explanation = DroughtMLPipeline.predict_single(
                active_model.artifact_path, input_dict
            )
            model_name = active_model.model_name
            model_ver = active_model.version
            primary_factors = ml_explanation.get("primary_factors", [])
        except Exception as e:
            # Fallback if artifact fails
            drought_prob = None
            primary_factors = []
    else:
        drought_prob = None
        primary_factors = []

    # If no model active or error, use scientifically documented empirical rule-based formula
    if drought_prob is None:
        model_name = "WMO/McKee Empirical Index Engine"
        model_ver = "v1.0-RuleFallback"

        # Base probability calculation based on SPI / rainfall deficit / soil moisture
        p_score = 0.0
        factors = []

        if payload.spi is not None:
            if payload.spi <= -2.0:
                p_score += 85.0
                factors.append({"feature": "spi", "observed_value": payload.spi, "impact": "Extreme drought index (SPI ≤ -2.0)"})
            elif payload.spi <= -1.5:
                p_score += 65.0
                factors.append({"feature": "spi", "observed_value": payload.spi, "impact": "Severe drought index (SPI ≤ -1.5)"})
            elif payload.spi <= -1.0:
                p_score += 45.0
                factors.append({"feature": "spi", "observed_value": payload.spi, "impact": "Moderate moisture deficit (SPI ≤ -1.0)"})
            else:
                p_score += 15.0
        elif payload.rainfall is not None:
            if payload.rainfall < 15.0:
                p_score += 70.0
                factors.append({"feature": "rainfall", "observed_value": payload.rainfall, "impact": "Critical precipitation deficit (<15 mm)"})
            elif payload.rainfall < 40.0:
                p_score += 45.0
                factors.append({"feature": "rainfall", "observed_value": payload.rainfall, "impact": "Sub-normal rainfall (<40 mm)"})
            else:
                p_score += 10.0

        if payload.soil_moisture is not None:
            if payload.soil_moisture < 15.0:
                p_score = max(p_score, 75.0)
                factors.append({"feature": "soil_moisture", "observed_value": payload.soil_moisture, "impact": "Severe root-zone moisture exhaustion (<15%)"})
            elif payload.soil_moisture < 25.0:
                p_score = max(p_score, 50.0)
                factors.append({"feature": "soil_moisture", "observed_value": payload.soil_moisture, "impact": "Depleted soil moisture (<25%)"})

        drought_prob = round(float(np.clip(p_score or 20.0, 5.0, 95.0)), 1)
        
        # Severity from probability
        if drought_prob >= 75.0:
            severity = "Severe" if drought_prob < 90.0 else "Extreme"
        elif drought_prob >= 40.0:
            severity = "Moderate"
        else:
            severity = "Normal"
        primary_factors = factors

    # Evaluate Early-Warning Engine
    warning_status, reasons, advisories = EarlyWarningEngine.evaluate(
        drought_prob=drought_prob,
        spi=payload.spi,
        spei=payload.spei,
        soil_moisture=payload.soil_moisture,
        rainfall=payload.rainfall
    )

    limitations_text = (
        "Academic & Research Demonstration Notice: Predictions represent statistical probability "
        "conditioned upon supplied hydrometeorological parameters. This is not an official government "
        "meteorological warning. Forecast validity depends on input data accuracy and spatial homogeneity."
    )

    explanation = PredictionExplanation(
        primary_factors=primary_factors,
        suggested_actions=advisories,
        limitations=limitations_text
    )

    # Resolve or create location
    loc = db.query(Location).filter(Location.name == payload.location_name).first()
    loc_id = loc.id if loc else None

    # Persist in database
    prediction_record = PredictionRecord(
        location_id=loc_id,
        location_name=payload.location_name,
        prediction_date=payload.prediction_date,
        drought_probability=drought_prob,
        severity=severity,
        warning_status=warning_status,
        model_name=model_name,
        model_version=model_ver,
        input_snapshot_json=json.dumps(input_dict),
        explanation_json=json.dumps(explanation.model_dump()),
        threshold_config_json=json.dumps(EarlyWarningEngine.DEFAULT_THRESHOLDS),
        created_timestamp=datetime.now(timezone.utc)
    )
    db.add(prediction_record)
    db.commit()
    db.refresh(prediction_record)

    return PredictionResponse(
        id=prediction_record.id,
        location_name=prediction_record.location_name,
        prediction_date=prediction_record.prediction_date,
        drought_probability=prediction_record.drought_probability,
        severity=prediction_record.severity,
        warning_status=prediction_record.warning_status,
        model_name=prediction_record.model_name,
        model_version=prediction_record.model_version,
        input_snapshot=input_dict,
        explanation=explanation,
        created_timestamp=prediction_record.created_timestamp.isoformat()
    )

@router.get("")
def list_predictions(
    search: Optional[str] = Query(None),
    location: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    warning: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    query = db.query(PredictionRecord)

    if search:
        query = query.filter(PredictionRecord.location_name.ilike(f"%{search}%"))
    if location and location != "All":
        query = query.filter(PredictionRecord.location_name == location)
    if severity and severity != "All":
        query = query.filter(PredictionRecord.severity == severity)
    if warning and warning != "All":
        query = query.filter(PredictionRecord.warning_status == warning)

    total_count = query.count()
    offset = (page - 1) * limit
    records = query.order_by(PredictionRecord.created_timestamp.desc()).offset(offset).limit(limit).all()

    items = []
    for r in records:
        items.append({
            "id": r.id,
            "location_name": r.location_name,
            "prediction_date": r.prediction_date,
            "drought_probability": r.drought_probability,
            "severity": r.severity,
            "warning_status": r.warning_status,
            "model_name": r.model_name,
            "model_version": r.model_version,
            "input_snapshot": json.loads(r.input_snapshot_json) if r.input_snapshot_json else {},
            "explanation": json.loads(r.explanation_json) if r.explanation_json else None,
            "created_timestamp": r.created_timestamp.isoformat()
        })

    return {
        "items": items,
        "total": total_count,
        "page": page,
        "pages": (total_count + limit - 1) // limit if limit else 1
    }

@router.get("/{prediction_id}")
def get_prediction_detail(prediction_id: int, db: Session = Depends(get_db)):
    r = db.query(PredictionRecord).filter(PredictionRecord.id == prediction_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Prediction record not found")

    return {
        "id": r.id,
        "location_name": r.location_name,
        "prediction_date": r.prediction_date,
        "drought_probability": r.drought_probability,
        "severity": r.severity,
        "warning_status": r.warning_status,
        "model_name": r.model_name,
        "model_version": r.model_version,
        "input_snapshot": json.loads(r.input_snapshot_json) if r.input_snapshot_json else {},
        "explanation": json.loads(r.explanation_json) if r.explanation_json else None,
        "threshold_config": json.loads(r.threshold_config_json) if r.threshold_config_json else None,
        "created_timestamp": r.created_timestamp.isoformat()
    }

@router.get("/export/csv")
def export_predictions_csv(db: Session = Depends(get_db)):
    """
    Export all stored predictions as safe CSV with protection against formula injection.
    """
    records = db.query(PredictionRecord).order_by(PredictionRecord.created_timestamp.desc()).all()
    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow([
        "Prediction ID", "Location", "Prediction Date", "Drought Probability (%)",
        "Severity", "Warning Status", "Model Name", "Model Version", "Created Timestamp"
    ])

    for r in records:
        # Sanitize location against formula injection
        loc = r.location_name
        if loc and loc[0] in ['=', '+', '-', '@', '\t', '\r']:
            loc = "'" + loc
        writer.writerow([
            r.id, loc, r.prediction_date, r.drought_probability,
            r.severity, r.warning_status, r.model_name, r.model_version, r.created_timestamp.isoformat()
        ])

    csv_data = output.getvalue()
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=droughtsense_predictions_{datetime.now(timezone.utc).strftime('%Y%m%d')}.csv"}
    )

@router.post("/batch/{dataset_id}")
def batch_predict_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """
    Generate batch drought predictions across all environmental observations in an uploaded dataset.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    records = db.query(EnvironmentalRecord).filter(EnvironmentalRecord.dataset_id == dataset_id).all()
    if not records:
        raise HTTPException(status_code=400, detail="Dataset has no processed environmental records. Please process the dataset first.")

    active_model = db.query(MLModel).filter(MLModel.is_active == True).first()
    model_artifact = active_model.artifact_path if (active_model and active_model.artifact_path and os.path.exists(active_model.artifact_path)) else None

    predictions_created = []
    now = datetime.now(timezone.utc)
    locations_dict = {loc.id: loc.name for loc in db.query(Location).all()}

    for r in records:
        loc_name = locations_dict.get(r.location_id, "Station")

        input_dict = {
            "rainfall": r.rainfall,
            "temp_min": r.temp_min,
            "temp_max": r.temp_max,
            "temp_avg": r.temp_avg,
            "humidity": r.humidity,
            "wind_speed": r.wind_speed,
            "soil_moisture": r.soil_moisture,
            "streamflow": r.streamflow,
            "evapotranspiration": r.evapotranspiration,
            "spi": r.spi,
            "spei": r.spei
        }

        drought_prob = None
        primary_factors = []
        if model_artifact:
            try:
                drought_prob, severity, ml_exp = DroughtMLPipeline.predict_single(model_artifact, input_dict)
                model_name = active_model.model_name
                model_ver = active_model.version
                primary_factors = ml_exp.get("primary_factors", [])
            except Exception:
                drought_prob = None

        if drought_prob is None:
            model_name = "WMO/McKee Empirical Index Engine"
            model_ver = "v1.0-RuleFallback"
            p_score = 15.0
            if r.spi is not None:
                if r.spi <= -2.0:
                    p_score = 88.0
                elif r.spi <= -1.5:
                    p_score = 68.0
                elif r.spi <= -1.0:
                    p_score = 45.0
            elif r.rainfall is not None and r.rainfall < 20.0:
                p_score = 60.0
            drought_prob = p_score
            severity = r.severity_label or "Normal"

        warning_status, _, advisories = EarlyWarningEngine.evaluate(
            drought_prob=drought_prob,
            spi=r.spi,
            spei=r.spei,
            soil_moisture=r.soil_moisture,
            rainfall=r.rainfall
        )

        explanation = {
            "primary_factors": primary_factors,
            "suggested_actions": advisories,
            "limitations": "Academic batch prediction evaluation."
        }

        pred_rec = PredictionRecord(
            location_id=r.location_id,
            location_name=loc_name,
            prediction_date=r.observation_date,
            drought_probability=drought_prob,
            severity=severity,
            warning_status=warning_status,
            model_name=model_name,
            model_version=model_ver,
            input_snapshot_json=json.dumps(input_dict),
            explanation_json=json.dumps(explanation),
            threshold_config_json=json.dumps(EarlyWarningEngine.DEFAULT_THRESHOLDS),
            created_timestamp=now
        )
        predictions_created.append(pred_rec)

    db.bulk_save_objects(predictions_created)
    db.commit()

    return {
        "status": "SUCCESS",
        "dataset_id": dataset_id,
        "dataset_name": dataset.name,
        "predictions_generated": len(predictions_created),
        "message": f"Successfully generated {len(predictions_created)} batch predictions using {model_name}."
    }
