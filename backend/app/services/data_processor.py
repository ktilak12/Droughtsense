"""
Data Processor and Validator Module for DroughtSense
====================================================
Handles dataset ingestion, column auto-detection, type checking, outlier screening,
missing value auditing, duplicate removal, formula injection sanitization, and data quality reporting.
"""

import os
import re
import pandas as pd
import numpy as np
from typing import Dict, Any, Tuple, List, Optional


class DataProcessor:
    EXPECTED_FIELDS = [
        "date", "rainfall", "temp_min", "temp_max", "temp_avg",
        "humidity", "wind_speed", "soil_moisture", "streamflow", "evapotranspiration", "location",
        "latitude", "longitude"
    ]

    FIELD_SYNONYMS = {
        "date": ["date", "time", "timestamp", "observation_date", "day", "record_date"],
        "rainfall": ["rainfall", "precip", "precipitation", "rain", "rain_mm", "prcp"],
        "temp_min": ["temp_min", "min_temp", "tmin", "temperature_min", "minimum_temp"],
        "temp_max": ["temp_max", "max_temp", "tmax", "temperature_max", "maximum_temp"],
        "temp_avg": ["temp_avg", "avg_temp", "tavg", "temperature", "temp", "mean_temp"],
        "humidity": ["humidity", "relative_humidity", "rh", "humid", "humidity_pct"],
        "wind_speed": ["wind_speed", "wind", "windspeed", "wind_mps", "ws"],
        "soil_moisture": ["soil_moisture", "sm", "soil_moist", "moisture", "volumetric_soil_water"],
        "streamflow": ["streamflow", "discharge", "flow", "river_discharge", "runoff"],
        "evapotranspiration": ["evapotranspiration", "pet", "et0", "et", "potential_et"],
        "location": ["location", "station", "station_name", "region", "site", "city"],
        "latitude": ["latitude", "lat", "y_coord", "y"],
        "longitude": ["longitude", "lon", "long", "x_coord", "x"]
    }

    @classmethod
    def sanitize_cell(cls, val: Any) -> Any:
        """Protect against spreadsheet formula injection (=, +, -, @, \t, \r)"""
        if isinstance(val, str) and len(val) > 0:
            if val[0] in ['=', '+', '-', '@', '\t', '\r']:
                return "'" + val
        return val

    @classmethod
    def auto_detect_columns(cls, df: pd.DataFrame) -> Dict[str, Optional[str]]:
        """Intelligently map columns in uploaded dataframe to standardized fields"""
        mapping = {}
        df_cols_lower = {col: str(col).strip().lower().replace(" ", "_").replace("-", "_") for col in df.columns}
        claimed_cols = set()

        # Phase 1: Exact match prioritization
        for std_field, synonyms in cls.FIELD_SYNONYMS.items():
            for orig_col, norm_col in df_cols_lower.items():
                if orig_col not in claimed_cols and norm_col in synonyms:
                    mapping[std_field] = orig_col
                    claimed_cols.add(orig_col)
                    break

        # Phase 2: Partial match fallback for unmapped fields (preventing short abbreviation collisions)
        for std_field, synonyms in cls.FIELD_SYNONYMS.items():
            if std_field not in mapping or mapping[std_field] is None:
                matched_col = None
                for orig_col, norm_col in df_cols_lower.items():
                    if orig_col not in claimed_cols:
                        descriptive_syns = [syn for syn in synonyms if len(syn) >= 4 and syn not in ["temp"]]
                        if any(syn in norm_col for syn in descriptive_syns):
                            matched_col = orig_col
                            claimed_cols.add(orig_col)
                            break
                mapping[std_field] = matched_col

        return mapping

    @classmethod
    def validate_dataframe(cls, df: pd.DataFrame, column_mapping: Optional[Dict[str, str]] = None) -> Tuple[bool, Dict[str, Any], pd.DataFrame]:
        """
        Validate dataframe types, missing values, duplicates, date formats, and outliers.
        Returns: (is_valid, quality_report, processed_df)
        """
        total_rows = len(df)
        if total_rows == 0:
            return False, {
                "total_rows": 0,
                "valid_rows": 0,
                "missing_values": {},
                "duplicate_rows": 0,
                "outlier_counts": {},
                "invalid_dates": 0,
                "validation_status": "INVALID",
                "warnings": [],
                "errors": ["Uploaded file is empty."]
            }, df

        # Auto-detect if mapping not provided
        if not column_mapping:
            column_mapping = cls.auto_detect_columns(df)

        warnings = []
        errors = []

        # Check critical fields: date and rainfall
        date_col = column_mapping.get("date")
        rainfall_col = column_mapping.get("rainfall")

        if not date_col or date_col not in df.columns:
            errors.append("Missing required date column. Please specify which column contains dates.")
        if not rainfall_col or rainfall_col not in df.columns:
            errors.append("Missing required precipitation/rainfall column.")

        if errors:
            return False, {
                "total_rows": total_rows,
                "valid_rows": 0,
                "missing_values": {str(k): int(v) for k, v in df.isnull().sum().to_dict().items()},
                "duplicate_rows": int(df.duplicated().sum()),
                "outlier_counts": {},
                "invalid_dates": 0,
                "validation_status": "INVALID",
                "warnings": warnings,
                "errors": errors
            }, df

        clean_df = df.copy()

        # Check date parsing
        invalid_dates_count = 0
        try:
            parsed_dates = pd.to_datetime(clean_df[date_col], errors='coerce')
            invalid_dates_count = int(parsed_dates.isna().sum())
            if invalid_dates_count > 0:
                warnings.append(f"{invalid_dates_count} rows have invalid or unparseable dates and will be dropped.")
            clean_df['standard_date'] = parsed_dates
        except Exception as e:
            errors.append(f"Failed to parse dates in column '{date_col}': {str(e)}")

        # Check duplicates
        duplicate_count = int(clean_df.duplicated().sum())
        if duplicate_count > 0:
            warnings.append(f"Detected {duplicate_count} duplicate rows.")

        # Numeric fields validation and outlier detection
        numeric_fields = ["rainfall", "temp_min", "temp_max", "temp_avg", "humidity", "wind_speed", "soil_moisture", "streamflow", "evapotranspiration"]
        outlier_counts = {}
        missing_values = {}

        for field in numeric_fields:
            col_name = column_mapping.get(field)
            if col_name and col_name in clean_df.columns:
                # Force numeric conversion
                clean_df[col_name] = pd.to_numeric(clean_df[col_name], errors='coerce')
                missing_values[field] = int(clean_df[col_name].isna().sum())
                
                # Check negative values for rainfall/humidity/soil_moisture
                if field in ["rainfall", "humidity", "soil_moisture", "wind_speed", "streamflow"]:
                    neg_count = int((clean_df[col_name] < 0).sum())
                    if neg_count > 0:
                        warnings.append(f"Found {neg_count} negative values in '{field}'. Clamped to zero.")
                        clean_df[col_name] = clean_df[col_name].clip(lower=0.0)

                # Outlier detection using IQR (3 * IQR)
                valid_num = clean_df[col_name].dropna()
                if len(valid_num) > 10:
                    q25, q75 = np.percentile(valid_num, [25, 75])
                    iqr = q75 - q25
                    lower_bound = q25 - (3.0 * iqr)
                    upper_bound = q75 + (3.0 * iqr)
                    outliers = int(((valid_num < lower_bound) | (valid_num > upper_bound)).sum())
                    outlier_counts[field] = outliers
                    if outliers > 0:
                        warnings.append(f"Detected {outliers} extreme statistical outliers in '{field}'.")
                else:
                    outlier_counts[field] = 0
            else:
                missing_values[field] = total_rows
                outlier_counts[field] = 0

        # Check temperature inversion (temp_max < temp_min)
        t_min_col = column_mapping.get("temp_min")
        t_max_col = column_mapping.get("temp_max")
        if t_min_col and t_max_col and t_min_col in clean_df.columns and t_max_col in clean_df.columns:
            inversion_mask = clean_df[t_max_col] < clean_df[t_min_col]
            inversions = int(inversion_mask.sum())
            if inversions > 0:
                warnings.append(f"Found {inversions} records where max temperature < min temperature. Values swapped.")
                temp_swap = clean_df.loc[inversion_mask, t_min_col].copy()
                clean_df.loc[inversion_mask, t_min_col] = clean_df.loc[inversion_mask, t_max_col]
                clean_df.loc[inversion_mask, t_max_col] = temp_swap

        # Auto-impute missing temp_avg from min/max if available
        t_avg_col = column_mapping.get("temp_avg")
        if (not t_avg_col or t_avg_col not in clean_df.columns) and t_min_col and t_max_col and t_min_col in clean_df.columns and t_max_col in clean_df.columns:
            clean_df["temp_avg"] = (clean_df[t_min_col] + clean_df[t_max_col]) / 2.0
            column_mapping["temp_avg"] = "temp_avg"
            missing_values["temp_avg"] = int(clean_df["temp_avg"].isna().sum())

        # Drop invalid dates and duplicates for processed dataset
        clean_df = clean_df.dropna(subset=['standard_date'])
        clean_df = clean_df.drop_duplicates()

        # Sort chronologically
        clean_df = clean_df.sort_values(by='standard_date')

        valid_rows = len(clean_df)
        if valid_rows == 0:
            errors.append("No valid records remain after parsing dates.")
        
        validation_status = "INVALID" if len(errors) > 0 else ("WARNING" if len(warnings) > 0 else "VALID")

        report = {
            "total_rows": total_rows,
            "valid_rows": valid_rows,
            "missing_values": missing_values,
            "duplicate_rows": duplicate_count,
            "outlier_counts": outlier_counts,
            "invalid_dates": invalid_dates_count,
            "validation_status": validation_status,
            "warnings": warnings,
            "errors": errors,
            "detected_mapping": column_mapping
        }

        return (len(errors) == 0), report, clean_df
