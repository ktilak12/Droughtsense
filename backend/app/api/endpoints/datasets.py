import os
import json
import shutil
import pandas as pd
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.config import settings
from app.models.db_models import Dataset, EnvironmentalRecord, Location
from app.schemas.schemas import DatasetResponse, DataValidationReport
from app.services.data_processor import DataProcessor
from app.services.spi_spei import DroughtIndexCalculator
from app.services.demo_data_generator import generate_synthetic_dataset

router = APIRouter()

@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    source_information: str = Form("Manual Upload"),
    db: Session = Depends(get_db)
):
    raw_filename = file.filename or "dataset.csv"
    clean_filename = os.path.basename(raw_filename).strip()
    if not clean_filename.lower().endswith(('.csv', '.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="Only CSV and Excel (.xlsx, .xls) files are supported.")

    # Safe destination path
    safe_filename = clean_filename
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Read dataframe
    try:
        if clean_filename.lower().endswith('.csv'):
            df = pd.read_csv(file_path)
        else:
            df = pd.read_excel(file_path)
    except Exception as e:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise HTTPException(status_code=400, detail=f"Unable to parse uploaded file: {str(e)}")

    # Sanitize and detect columns
    auto_mapping = DataProcessor.auto_detect_columns(df)
    is_valid, quality_report, _ = DataProcessor.validate_dataframe(df, auto_mapping)

    date_col = auto_mapping.get("date")
    start_date = None
    end_date = None
    if date_col and date_col in df.columns:
        dates = pd.to_datetime(df[date_col], errors='coerce').dropna().sort_values()
        if len(dates) > 0:
            start_date = dates.iloc[0].strftime("%Y-%m-%d")
            end_date = dates.iloc[-1].strftime("%Y-%m-%d")

    # Create dataset record
    dataset = Dataset(
        name=safe_filename,
        file_type="CSV" if clean_filename.lower().endswith('.csv') else "Excel",
        row_count=len(df),
        date_range_start=start_date,
        date_range_end=end_date,
        validation_status=quality_report["validation_status"],
        processing_status="RAW",
        source_information=source_information,
        file_path=file_path,
        quality_report_json=json.dumps(quality_report)
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    # Preview first 5 rows
    preview_rows = df.head(5).fillna("").to_dict(orient="records")

    return {
        "dataset": {
            "id": dataset.id,
            "name": dataset.name,
            "row_count": dataset.row_count,
            "validation_status": dataset.validation_status,
            "processing_status": dataset.processing_status,
            "date_range": f"{start_date} to {end_date}" if start_date else "N/A"
        },
        "preview_rows": preview_rows,
        "columns": list(df.columns),
        "detected_mapping": auto_mapping,
        "quality_report": quality_report
    }

@router.get("", response_model=List[DatasetResponse])
def list_datasets(db: Session = Depends(get_db)):
    return db.query(Dataset).order_by(Dataset.upload_timestamp.desc()).all()

@router.get("/{dataset_id}")
def get_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")
    
    report = json.loads(dataset.quality_report_json) if dataset.quality_report_json else None
    return {
        "dataset": dataset,
        "quality_report": report
    }

@router.get("/{dataset_id}/preview")
def preview_dataset(dataset_id: int, limit: int = 15, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset or not dataset.file_path or not os.path.exists(dataset.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    if dataset.file_path.endswith('.csv'):
        df = pd.read_csv(dataset.file_path, nrows=limit)
    else:
        df = pd.read_excel(dataset.file_path, nrows=limit)

    return {
        "dataset_name": dataset.name,
        "columns": list(df.columns),
        "rows": df.fillna("").to_dict(orient="records")
    }

@router.post("/{dataset_id}/process")
def process_dataset(dataset_id: int, db: Session = Depends(get_db)):
    """
    Process dataset: standardize fields, compute SPI/SPEI, and load into EnvironmentalRecord database table.
    """
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset or not dataset.file_path or not os.path.exists(dataset.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    try:
        df = pd.read_csv(dataset.file_path) if dataset.file_path.endswith('.csv') else pd.read_excel(dataset.file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read file: {str(e)}")

    mapping = DataProcessor.auto_detect_columns(df)
    is_valid, report, clean_df = DataProcessor.validate_dataframe(df, mapping)

    if not is_valid:
        raise HTTPException(status_code=400, detail="Dataset has critical validation errors and cannot be processed.")

    # Map locations
    loc_col = mapping.get("location")
    default_loc_name = "Primary Station"

    # Remove existing records for this dataset to allow re-processing
    db.query(EnvironmentalRecord).filter(EnvironmentalRecord.dataset_id == dataset.id).delete()
    db.commit()

    # Process grouped by location for accurate SPI calculation
    records_to_insert = []
    
    # If location column exists, fill missing values and group by it, otherwise treat all rows as 1 location
    if loc_col and loc_col in clean_df.columns:
        clean_df[loc_col] = clean_df[loc_col].fillna("Primary Monitoring Station").astype(str)
        groups = clean_df.groupby(clean_df[loc_col])
    else:
        groups = [("Primary Monitoring Station", clean_df)]

    for loc_name, group_df in groups:
        # Find or create location in DB
        location = db.query(Location).filter(Location.name == str(loc_name)).first()
        if not location:
            # Check if lat/long present in group
            lat_col = mapping.get("latitude")
            lon_col = mapping.get("longitude")
            
            def safe_coord(col, default_val):
                if col and col in group_df.columns:
                    val = group_df[col].iloc[0]
                    try:
                        f = float(val)
                        if not pd.isna(f):
                            return f
                    except (ValueError, TypeError):
                        pass
                return default_val

            lat = safe_coord(lat_col, 20.5937)
            lon = safe_coord(lon_col, 78.9629)
            location = Location(
                name=str(loc_name),
                latitude=lat,
                longitude=lon,
                region_metadata="Uploaded Data Region",
                is_demo=False
            )
            db.add(location)
            db.commit()
            db.refresh(location)

        # Sort group by date
        sorted_group = group_df.sort_values(by="standard_date")
        
        # Calculate SPI and SPEI if precipitation column available
        rain_col = mapping.get("rainfall")
        p_series = sorted_group[rain_col] if rain_col and rain_col in sorted_group.columns else pd.Series(dtype=float)
        
        spi_series = pd.Series(dtype=float)
        spei_series = pd.Series(dtype=float)
        spi_1_series = pd.Series(dtype=float)
        spei_1_series = pd.Series(dtype=float)

        if len(p_series) >= 12:
            spi_series, _ = DroughtIndexCalculator.calculate_spi(p_series, scale=3)
            spi_1_series, _ = DroughtIndexCalculator.calculate_spi(p_series, scale=1)
            # Check PET or temperature
            pet_col = mapping.get("evapotranspiration")
            if pet_col and pet_col in sorted_group.columns:
                pet_series = sorted_group[pet_col]
            else:
                # Estimate from temperature
                t_avg_col = mapping.get("temp_avg") or mapping.get("temp_max")
                if t_avg_col and t_avg_col in sorted_group.columns:
                    pet_series = DroughtIndexCalculator.estimate_pet_thornthwaite(sorted_group[t_avg_col], latitude=location.latitude)
                else:
                    pet_series = pd.Series([50.0] * len(sorted_group), index=sorted_group.index)
            
            spei_series, _ = DroughtIndexCalculator.calculate_spei(p_series, pet_series, scale=3)
            spei_1_series, _ = DroughtIndexCalculator.calculate_spei(p_series, pet_series, scale=1)

        def safe_val(col_name):
            if col_name and col_name in row:
                val = row[col_name]
                try:
                    f = float(val)
                    if not pd.isna(f):
                        return f
                except (ValueError, TypeError):
                    pass
            return None

        for idx, row in sorted_group.iterrows():
            s3 = spi_series.loc[idx] if idx in spi_series.index and not pd.isna(spi_series.loc[idx]) else None
            s1 = spi_1_series.loc[idx] if idx in spi_1_series.index and not pd.isna(spi_1_series.loc[idx]) else None
            spi_val = s3 if s3 is not None else s1

            se3 = spei_series.loc[idx] if idx in spei_series.index and not pd.isna(spei_series.loc[idx]) else None
            se1 = spei_1_series.loc[idx] if idx in spei_1_series.index and not pd.isna(spei_1_series.loc[idx]) else None
            spei_val = se3 if se3 is not None else se1
            
            # Severity label derived from SPI or rainfall
            if spi_val is not None:
                sev_label = DroughtIndexCalculator.classify_drought_index(spi_val)
            else:
                sev_label = "Normal"

            rec = EnvironmentalRecord(
                dataset_id=dataset.id,
                location_id=location.id,
                observation_date=row["standard_date"].strftime("%Y-%m-%d"),
                rainfall=safe_val(mapping.get("rainfall")),
                temp_min=safe_val(mapping.get("temp_min")),
                temp_max=safe_val(mapping.get("temp_max")),
                temp_avg=safe_val(mapping.get("temp_avg")),
                humidity=safe_val(mapping.get("humidity")),
                wind_speed=safe_val(mapping.get("wind_speed")),
                soil_moisture=safe_val(mapping.get("soil_moisture")),
                streamflow=safe_val(mapping.get("streamflow")),
                evapotranspiration=safe_val(mapping.get("evapotranspiration")),
                spi=spi_val,
                spei=spei_val,
                severity_label=sev_label
            )
            records_to_insert.append(rec)

    db.bulk_save_objects(records_to_insert)
    dataset.processing_status = "PROCESSED"
    db.commit()

    return {
        "status": "SUCCESS",
        "dataset_id": dataset.id,
        "processed_records_count": len(records_to_insert),
        "message": f"Successfully processed and indexed {len(records_to_insert)} environmental observations."
    }

@router.delete("/{dataset_id}")
def delete_dataset(dataset_id: int, db: Session = Depends(get_db)):
    dataset = db.query(Dataset).filter(Dataset.id == dataset_id).first()
    if not dataset:
        raise HTTPException(status_code=404, detail="Dataset not found")

    # Remove physical file
    if dataset.file_path and os.path.exists(dataset.file_path):
        try:
            os.remove(dataset.file_path)
        except Exception:
            pass

    # Explicitly cascade deletion of associated environmental records
    db.query(EnvironmentalRecord).filter(EnvironmentalRecord.dataset_id == dataset.id).delete()
    db.delete(dataset)
    db.commit()
    return {"status": "SUCCESS", "message": f"Dataset '{dataset.name}' and all associated records deleted."}

@router.post("/load-demo")
def load_demo_dataset(db: Session = Depends(get_db)):
    """
    Generate and ingest synthetic demonstration dataset with 5 regional stations and 5 years of observations.
    """
    existing_demo = db.query(Dataset).filter(Dataset.name == "Synthetic_DroughtSense_Demo_2021_2025.csv").first()
    if existing_demo:
        return {"status": "ALREADY_LOADED", "dataset_id": existing_demo.id, "message": "Demo dataset is already initialized."}

    df = generate_synthetic_dataset(start_year=2021, end_year=2025)
    demo_file_path = os.path.join(settings.DATA_DIR, "sample_drought_dataset.csv")
    df.to_csv(demo_file_path, index=False)

    # Ingest stations and records
    dataset = Dataset(
        name="Synthetic_DroughtSense_Demo_2021_2025.csv",
        file_type="CSV",
        row_count=len(df),
        date_range_start="2021-01-01",
        date_range_end="2025-12-01",
        validation_status="VALID",
        processing_status="PROCESSED",
        source_information="[SYNTHETIC DEMO] Climatologically Simulated Stations",
        file_path=demo_file_path,
        quality_report_json=json.dumps({
            "total_rows": len(df),
            "valid_rows": len(df),
            "missing_values": {},
            "duplicate_rows": 0,
            "outlier_counts": {},
            "invalid_dates": 0,
            "validation_status": "VALID",
            "warnings": ["Synthetically generated dataset for academic demonstration."],
            "errors": []
        })
    )
    db.add(dataset)
    db.commit()
    db.refresh(dataset)

    # Add locations and records
    records_to_insert = []
    station_groups = df.groupby("station_name")

    for station_name, group in station_groups:
        loc = db.query(Location).filter(Location.name == station_name).first()
        if not loc:
            loc = Location(
                name=station_name,
                latitude=float(group["latitude"].iloc[0]),
                longitude=float(group["longitude"].iloc[0]),
                region_metadata=str(group["region"].iloc[0]),
                is_demo=True
            )
            db.add(loc)
            db.commit()
            db.refresh(loc)

        for _, row in group.iterrows():
            rec = EnvironmentalRecord(
                dataset_id=dataset.id,
                location_id=loc.id,
                observation_date=str(row["observation_date"]),
                rainfall=float(row["rainfall"]),
                temp_min=float(row["temp_min"]),
                temp_max=float(row["temp_max"]),
                temp_avg=float(row["temp_avg"]),
                humidity=float(row["humidity"]),
                wind_speed=float(row["wind_speed"]),
                soil_moisture=float(row["soil_moisture"]),
                streamflow=float(row["streamflow"]),
                evapotranspiration=float(row["evapotranspiration"]),
                spi=float(row["spi"]),
                spei=float(row["spei"]),
                severity_label=str(row["severity_label"])
            )
            records_to_insert.append(rec)

    db.bulk_save_objects(records_to_insert)
    db.commit()

    return {
        "status": "SUCCESS",
        "dataset_id": dataset.id,
        "records_loaded": len(records_to_insert),
        "message": f"Successfully loaded synthetic demonstration dataset ({len(records_to_insert)} records)."
    }
