import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.db_models import AppSetting
from app.schemas.schemas import SettingsPayload

router = APIRouter()

DEFAULT_CONFIG = {
    "default_location": "Anantapur Station (Semi-Arid Basin)",
    "preferred_units": "Metric (mm, °C)",
    "default_date_range": "Last 12 Months",
    "severity_thresholds": {
        "moderate_spi": -1.0,
        "severe_spi": -1.5,
        "extreme_spi": -2.0,
        "moderate_prob": 40.0,
        "severe_prob": 65.0,
        "extreme_prob": 85.0
    },
    "warning_thresholds": {
        "watch_prob": 35.0,
        "warning_prob": 55.0,
        "critical_prob": 75.0
    },
    "demo_mode_enabled": True
}

@router.get("", response_model=SettingsPayload)
def get_settings(db: Session = Depends(get_db)):
    setting_row = db.query(AppSetting).filter(AppSetting.setting_key == "global_config").first()
    if not setting_row:
        # Create default
        new_row = AppSetting(
            setting_key="global_config",
            setting_value_json=json.dumps(DEFAULT_CONFIG),
            updated_timestamp=datetime.now(timezone.utc)
        )
        db.add(new_row)
        db.commit()
        return SettingsPayload(**DEFAULT_CONFIG)

    data = json.loads(setting_row.setting_value_json)
    merged_config = DEFAULT_CONFIG.copy()
    merged_config.update(data)
    return SettingsPayload(**merged_config)

@router.put("", response_model=SettingsPayload)
def update_settings(payload: SettingsPayload, db: Session = Depends(get_db)):
    setting_row = db.query(AppSetting).filter(AppSetting.setting_key == "global_config").first()
    if not setting_row:
        setting_row = AppSetting(setting_key="global_config")
        db.add(setting_row)

    setting_row.setting_value_json = json.dumps(payload.model_dump())
    setting_row.updated_timestamp = datetime.now(timezone.utc)
    db.commit()

    return payload
