import json
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
import pandas as pd

from app.core.database import get_db
from app.models.db_models import MLModel, TrainingRun, EnvironmentalRecord, Dataset
from app.schemas.schemas import ModelTrainRequest, ModelResponse
from app.services.ml_pipeline import DroughtMLPipeline

router = APIRouter()

@router.post("/train")
def train_model(
    payload: ModelTrainRequest,
    db: Session = Depends(get_db)
):
    """
    Train a machine learning model on environmental records with chronological split and proper data validation.
    """
    # Query records
    query = db.query(EnvironmentalRecord)
    if payload.dataset_id:
        query = query.filter(EnvironmentalRecord.dataset_id == payload.dataset_id)
    
    records = query.all()
    if len(records) < 20:
        raise HTTPException(
            status_code=400,
            detail=f"Only {len(records)} records available. Please upload or load a dataset with at least 20 records before training."
        )

    # Convert to DataFrame
    data_list = []
    for r in records:
        data_list.append({
            "observation_date": r.observation_date,
            "rainfall": r.rainfall,
            "temp_min": r.temp_min,
            "temp_max": r.temp_max,
            "temp_avg": r.temp_avg,
            "humidity": r.humidity,
            "wind_speed": r.wind_speed,
            "soil_moisture": r.soil_moisture,
            "streamflow": r.streamflow,
            "evapotranspiration": r.evapotranspiration,
            "severity_label": r.severity_label
        })
    df = pd.DataFrame(data_list)

    # Run ML training pipeline
    try:
        metadata, artifact_path = DroughtMLPipeline.train_model(
            df=df,
            algorithm=payload.algorithm,
            features=payload.features,
            target_col="severity_label",
            test_size=payload.test_size
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model training error: {str(e)}")

    # Deactivate existing active models if this is the first or explicitly requested
    has_active = db.query(MLModel).filter(MLModel.is_active == True).first()
    is_active = True if not has_active else False

    # Persist model record
    model_record = MLModel(
        model_name=f"{payload.algorithm} Classifier",
        algorithm=payload.algorithm,
        version=metadata["version"],
        features_json=json.dumps(metadata["features"]),
        target_definition="Drought Severity (Normal, Moderate, Severe, Extreme) derived from SPI-3",
        training_dataset_name=f"Dataset #{payload.dataset_id}" if payload.dataset_id else "All Active Datasets",
        training_timestamp=datetime.now(timezone.utc),
        evaluation_metrics_json=json.dumps(metadata["metrics"]),
        feature_importance_json=json.dumps(metadata["feature_importance"]),
        artifact_path=artifact_path,
        is_active=is_active
    )
    db.add(model_record)
    db.commit()
    db.refresh(model_record)

    # Record training run
    now_utc = datetime.now(timezone.utc)
    run = TrainingRun(
        model_id=model_record.id,
        status="COMPLETED",
        started_timestamp=now_utc,
        completed_timestamp=now_utc,
        evaluation_summary_json=json.dumps(metadata["metrics"])
    )
    db.add(run)
    db.commit()

    return {
        "status": "SUCCESS",
        "model_id": model_record.id,
        "model_name": model_record.model_name,
        "algorithm": model_record.algorithm,
        "version": model_record.version,
        "metrics": metadata["metrics"],
        "feature_importance": metadata["feature_importance"],
        "is_active": model_record.is_active
    }

@router.get("")
def list_models(db: Session = Depends(get_db)):
    models = db.query(MLModel).order_by(MLModel.training_timestamp.desc()).all()
    results = []
    for m in models:
        metrics = json.loads(m.evaluation_metrics_json) if m.evaluation_metrics_json else {}
        feat_imp = json.loads(m.feature_importance_json) if m.feature_importance_json else {}
        results.append({
            "id": m.id,
            "model_name": m.model_name,
            "algorithm": m.algorithm,
            "version": m.version,
            "features": json.loads(m.features_json) if m.features_json else [],
            "target_definition": m.target_definition,
            "training_dataset_name": m.training_dataset_name,
            "training_timestamp": m.training_timestamp.isoformat(),
            "accuracy": metrics.get("accuracy"),
            "f1_score": metrics.get("f1_score"),
            "precision": metrics.get("precision"),
            "recall": metrics.get("recall"),
            "auc_roc": metrics.get("auc_roc"),
            "is_active": m.is_active
        })
    return results

@router.get("/{model_id}")
def get_model_details(model_id: int, db: Session = Depends(get_db)):
    m = db.query(MLModel).filter(MLModel.id == model_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Model not found")

    metrics = json.loads(m.evaluation_metrics_json) if m.evaluation_metrics_json else {}
    feat_imp = json.loads(m.feature_importance_json) if m.feature_importance_json else {}

    return {
        "id": m.id,
        "model_name": m.model_name,
        "algorithm": m.algorithm,
        "version": m.version,
        "features": json.loads(m.features_json) if m.features_json else [],
        "target_definition": m.target_definition,
        "training_dataset_name": m.training_dataset_name,
        "training_timestamp": m.training_timestamp.isoformat(),
        "metrics": metrics,
        "feature_importance": feat_imp,
        "is_active": m.is_active
    }

@router.post("/{model_id}/activate")
def activate_model(model_id: int, db: Session = Depends(get_db)):
    target_model = db.query(MLModel).filter(MLModel.id == model_id).first()
    if not target_model:
        raise HTTPException(status_code=404, detail="Model not found")

    # Set all other models to false
    db.query(MLModel).update({MLModel.is_active: False})
    target_model.is_active = True
    db.commit()

    return {
        "status": "SUCCESS",
        "message": f"Activated '{target_model.model_name}' ({target_model.version}) as primary prediction model."
    }

@router.delete("/{model_id}")
def delete_model(model_id: int, db: Session = Depends(get_db)):
    """
    Delete a trained machine learning model and remove its serialized artifact file.
    """
    import os
    target_model = db.query(MLModel).filter(MLModel.id == model_id).first()
    if not target_model:
        raise HTTPException(status_code=404, detail="Model not found")

    if target_model.artifact_path and os.path.exists(target_model.artifact_path):
        try:
            os.remove(target_model.artifact_path)
        except Exception:
            pass

    # Explicitly cascade deletion of associated training runs
    db.query(TrainingRun).filter(TrainingRun.model_id == model_id).delete()
    db.delete(target_model)
    db.commit()
    return {"status": "SUCCESS", "message": f"Model '{target_model.model_name}' deleted."}
