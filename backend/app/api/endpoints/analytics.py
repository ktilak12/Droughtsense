import numpy as np
import pandas as pd
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.database import get_db
from app.models.db_models import EnvironmentalRecord, Location, PredictionRecord, MLModel
from app.services.early_warning import EarlyWarningEngine
from app.services.spi_spei import DroughtIndexCalculator

router = APIRouter()

@router.get("/summary")
def get_analytics_summary(db: Session = Depends(get_db)):
    """
    Overview summary card statistics.
    """
    total_locations = db.query(Location).count()
    total_records = db.query(EnvironmentalRecord).count()

    # Calculate average rainfall and soil moisture
    avg_rainfall = db.query(func.avg(EnvironmentalRecord.rainfall)).scalar() or 0.0
    avg_soil = db.query(func.avg(EnvironmentalRecord.soil_moisture)).scalar() or 0.0

    # Severity breakdown
    severity_counts = (
        db.query(EnvironmentalRecord.severity_label, func.count(EnvironmentalRecord.id))
        .group_by(EnvironmentalRecord.severity_label)
        .all()
    )
    breakdown = {"Normal": 0, "Moderate": 0, "Severe": 0, "Extreme": 0}
    for label, count in severity_counts:
        if label in breakdown:
            breakdown[label] = count

    # Active predictions / warnings
    recent_predictions = db.query(PredictionRecord).order_by(PredictionRecord.created_timestamp.desc()).limit(10).all()
    warning_count = sum(1 for p in recent_predictions if p.warning_status in ["Warning", "Critical"])

    # Latest system-wide status
    if warning_count >= 3:
        status_code = "Critical Alert"
    elif warning_count >= 1:
        status_code = "Watch Advisory"
    else:
        status_code = "Normal Operations"

    return {
        "monitored_stations": total_locations,
        "total_records": total_records,
        "average_rainfall": round(float(avg_rainfall), 1),
        "average_soil_moisture": round(float(avg_soil), 1),
        "severity_breakdown": breakdown,
        "active_warnings_count": warning_count,
        "current_system_status": status_code
    }

@router.get("/trends")
def get_environmental_trends(
    location_id: Optional[int] = Query(None),
    location_name: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    limit: int = Query(60, ge=1, le=500),
    db: Session = Depends(get_db)
):
    if not location_id and (not location_name or location_name == "All"):
        # Aggregate across all stations by date to provide a clean non-duplicated temporal trend
        agg_query = (
            db.query(
                EnvironmentalRecord.observation_date.label("date"),
                func.avg(EnvironmentalRecord.rainfall).label("rainfall"),
                func.avg(EnvironmentalRecord.temp_avg).label("temp_avg"),
                func.avg(EnvironmentalRecord.temp_min).label("temp_min"),
                func.avg(EnvironmentalRecord.temp_max).label("temp_max"),
                func.avg(EnvironmentalRecord.humidity).label("humidity"),
                func.avg(EnvironmentalRecord.wind_speed).label("wind_speed"),
                func.avg(EnvironmentalRecord.soil_moisture).label("soil_moisture"),
                func.avg(EnvironmentalRecord.streamflow).label("streamflow"),
                func.avg(EnvironmentalRecord.evapotranspiration).label("evapotranspiration"),
                func.avg(EnvironmentalRecord.spi).label("spi"),
                func.avg(EnvironmentalRecord.spei).label("spei")
            )
            .group_by(EnvironmentalRecord.observation_date)
        )
        if start_date:
            agg_query = agg_query.filter(EnvironmentalRecord.observation_date >= start_date)
        if end_date:
            agg_query = agg_query.filter(EnvironmentalRecord.observation_date <= end_date)

        records = agg_query.order_by(EnvironmentalRecord.observation_date.asc()).limit(limit).all()

        trends = []
        for r in records:
            spi_val = round(float(r.spi), 2) if r.spi is not None else None
            trends.append({
                "date": r.date,
                "rainfall": round(float(r.rainfall), 1) if r.rainfall is not None else None,
                "temp_avg": round(float(r.temp_avg), 1) if r.temp_avg is not None else None,
                "temp_min": round(float(r.temp_min), 1) if r.temp_min is not None else None,
                "temp_max": round(float(r.temp_max), 1) if r.temp_max is not None else None,
                "humidity": round(float(r.humidity), 1) if r.humidity is not None else None,
                "wind_speed": round(float(r.wind_speed), 1) if r.wind_speed is not None else None,
                "soil_moisture": round(float(r.soil_moisture), 1) if r.soil_moisture is not None else None,
                "streamflow": round(float(r.streamflow), 1) if r.streamflow is not None else None,
                "evapotranspiration": round(float(r.evapotranspiration), 1) if r.evapotranspiration is not None else None,
                "spi": spi_val,
                "spei": round(float(r.spei), 2) if r.spei is not None else None,
                "severity": DroughtIndexCalculator.classify_drought_index(spi_val) if spi_val is not None else "Normal"
            })
        return trends
    else:
        query = db.query(EnvironmentalRecord).join(Location)

        if location_id:
            query = query.filter(EnvironmentalRecord.location_id == location_id)
        elif location_name and location_name != "All":
            query = query.filter(Location.name == location_name)

        if start_date:
            query = query.filter(EnvironmentalRecord.observation_date >= start_date)
        if end_date:
            query = query.filter(EnvironmentalRecord.observation_date <= end_date)

        records = query.order_by(EnvironmentalRecord.observation_date.asc()).limit(limit).all()

        trends = []
        for r in records:
            trends.append({
                "date": r.observation_date,
                "rainfall": r.rainfall,
                "temp_avg": r.temp_avg,
                "temp_min": r.temp_min,
                "temp_max": r.temp_max,
                "humidity": r.humidity,
                "wind_speed": r.wind_speed,
                "soil_moisture": r.soil_moisture,
                "streamflow": r.streamflow,
                "evapotranspiration": r.evapotranspiration,
                "spi": r.spi,
                "spei": r.spei,
                "severity": r.severity_label
            })

        return trends

@router.get("/correlations")
def get_correlation_matrix(db: Session = Depends(get_db)):
    """
    Compute pairwise Pearson correlation matrix across numerical hydrometeorological features.
    """
    records = db.query(
        EnvironmentalRecord.rainfall,
        EnvironmentalRecord.temp_avg,
        EnvironmentalRecord.humidity,
        EnvironmentalRecord.wind_speed,
        EnvironmentalRecord.soil_moisture,
        EnvironmentalRecord.streamflow,
        EnvironmentalRecord.evapotranspiration,
        EnvironmentalRecord.spi,
        EnvironmentalRecord.spei
    ).all()

    if len(records) < 5:
        return {"variables": [], "matrix": []}

    cols = [
        "Rainfall", "Temperature", "Humidity", "Wind Speed",
        "Soil Moisture", "Streamflow", "PET", "SPI", "SPEI"
    ]
    df = pd.DataFrame(records, columns=cols).apply(pd.to_numeric, errors='coerce')
    corr = df.corr(numeric_only=True).round(2).fillna(0.0)

    matrix = []
    for row_idx, row in corr.iterrows():
        row_dict = {"variable": row_idx}
        for col in corr.columns:
            row_dict[col] = float(row[col])
        matrix.append(row_dict)

    return {
        "variables": list(corr.columns),
        "matrix": matrix
    }

@router.get("/severity-distribution")
def get_severity_distribution(db: Session = Depends(get_db)):
    counts = (
        db.query(EnvironmentalRecord.severity_label, func.count(EnvironmentalRecord.id))
        .group_by(EnvironmentalRecord.severity_label)
        .all()
    )
    result = []
    total = sum(c[1] for c in counts) or 1
    for label, count in counts:
        if label:
            result.append({
                "severity": label,
                "count": count,
                "percentage": round(float(count / total * 100.0), 1)
            })
    return result

@router.get("/map")
def get_map_stations(db: Session = Depends(get_db)):
    """
    Provide station coordinates, latest observations, computed drought probability, and early-warning level.
    """
    locations = db.query(Location).all()
    results = []

    for loc in locations:
        latest_rec = (
            db.query(EnvironmentalRecord)
            .filter(EnvironmentalRecord.location_id == loc.id)
            .order_by(EnvironmentalRecord.observation_date.desc())
            .first()
        )

        if latest_rec:
            # Approximate probability from SPI or soil moisture if record exists
            if latest_rec.spi is not None:
                if latest_rec.spi <= -2.0:
                    prob = 88.0
                elif latest_rec.spi <= -1.5:
                    prob = 68.0
                elif latest_rec.spi <= -1.0:
                    prob = 45.0
                else:
                    prob = 15.0
            else:
                prob = 20.0

            warning, _, _ = EarlyWarningEngine.evaluate(
                drought_prob=prob,
                spi=latest_rec.spi,
                spei=latest_rec.spei,
                soil_moisture=latest_rec.soil_moisture,
                rainfall=latest_rec.rainfall
            )

            results.append({
                "id": loc.id,
                "name": loc.name,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "region": loc.region_metadata,
                "is_demo": loc.is_demo,
                "latest_rainfall": latest_rec.rainfall,
                "latest_temp": latest_rec.temp_avg,
                "latest_soil_moisture": latest_rec.soil_moisture,
                "latest_spi": latest_rec.spi,
                "latest_spei": latest_rec.spei,
                "drought_probability": prob,
                "severity": latest_rec.severity_label or "Normal",
                "warning_status": warning,
                "observation_date": latest_rec.observation_date
            })
        else:
            results.append({
                "id": loc.id,
                "name": loc.name,
                "latitude": loc.latitude,
                "longitude": loc.longitude,
                "region": loc.region_metadata,
                "is_demo": loc.is_demo,
                "latest_rainfall": None,
                "latest_temp": None,
                "latest_soil_moisture": None,
                "latest_spi": None,
                "latest_spei": None,
                "drought_probability": 0.0,
                "severity": "Unknown",
                "warning_status": "Normal",
                "observation_date": "No Records"
            })

    return results
