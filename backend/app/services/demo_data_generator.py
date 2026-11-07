"""
Synthetic Demo Data Generator for DroughtSense
==============================================
Generates a realistic hydrometeorological dataset across 5 regional monitoring stations
with realistic climatology (monsoon seasons, dry spells, seasonal heat, soil tension, and streamflow).
Computes SPI, SPEI, and severity labels via rigorous mathematical formulation.
Clearly flagged as synthetic demo data to ensure academic transparency.
"""

import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from app.services.spi_spei import DroughtIndexCalculator

DEMO_STATIONS = [
    {"name": "Anantapur Station (Semi-Arid Basin)", "lat": 14.68, "lon": 77.60, "region": "Rayalaseema / South Peninsular", "base_rain": 45.0, "base_temp": 29.0},
    {"name": "Marathwada Central (Rain Shadow)", "lat": 19.87, "lon": 75.34, "region": "Western Plateau & Hills", "base_rain": 58.0, "base_temp": 28.5},
    {"name": "Jodhpur Arid Zone (Thar Border)", "lat": 26.29, "lon": 73.02, "region": "Western Dry Region", "base_rain": 28.0, "base_temp": 30.5},
    {"name": "Vidarbha East (Cotton Belt)", "lat": 21.14, "lon": 79.08, "region": "Central Plains", "base_rain": 85.0, "base_temp": 27.5},
    {"name": "Bundelkhand Uplands (Granite Terrain)", "lat": 25.44, "lon": 78.56, "region": "Central Highlands", "base_rain": 72.0, "base_temp": 26.8}
]

def generate_synthetic_dataset(start_year: int = 2021, end_year: int = 2025) -> pd.DataFrame:
    """
    Generate synthetic monthly hydrometeorological records for demo stations.
    """
    records = []
    np.random.seed(42)

    date_range = pd.date_range(start=f"{start_year}-01-01", end=f"{end_year}-12-31", freq='MS')

    for station in DEMO_STATIONS:
        # Keep track of cumulative precipitation for SPI
        precip_list = []
        pet_list = []
        station_rows = []

        for dt in date_range:
            month = dt.month
            year = dt.year

            # Seasonality for Indian subcontinent:
            # Months 6, 7, 8, 9 = Southwest Monsoon (high rain)
            # Months 3, 4, 5 = Pre-monsoon Summer (high temp, high PET, low rain)
            # Months 10, 11, 12, 1, 2 = Post-monsoon & Winter
            if month in [6, 7, 8, 9]:
                # Monsoon months
                rain_mult = np.random.uniform(2.5, 4.5)
                temp_adj = -2.0
                humidity = np.random.uniform(65.0, 92.0)
                wind = np.random.uniform(3.5, 7.5)
            elif month in [3, 4, 5]:
                # Hot pre-monsoon
                rain_mult = np.random.uniform(0.05, 0.4)
                temp_adj = 5.5
                humidity = np.random.uniform(20.0, 45.0)
                wind = np.random.uniform(2.0, 5.0)
            else:
                # Dry winter / post-monsoon
                rain_mult = np.random.uniform(0.1, 0.8)
                temp_adj = -4.0
                humidity = np.random.uniform(35.0, 60.0)
                wind = np.random.uniform(1.5, 4.0)

            # Introduce simulated multi-month drought events in specific years (e.g. 2023 dry spell)
            is_drought_spell = (year == 2023 and month in [6, 7, 8, 9]) or (year == 2024 and month in [4, 5, 6])
            if is_drought_spell:
                rain_mult *= 0.25
                humidity *= 0.65
                temp_adj += 3.0

            rainfall = max(0.0, round(float(station["base_rain"] * rain_mult * np.random.uniform(0.8, 1.2)), 1))
            temp_avg = round(float(station["base_temp"] + temp_adj + np.random.uniform(-1.5, 1.5)), 1)
            temp_min = round(float(temp_avg - np.random.uniform(5.0, 9.0)), 1)
            temp_max = round(float(temp_avg + np.random.uniform(6.0, 10.0)), 1)
            
            # Soil moisture correlates with rainfall with lag and temp evaporation
            base_sm = 15.0 if is_drought_spell else 30.0
            soil_moisture = round(float(np.clip(base_sm + (rainfall * 0.15) - (temp_avg * 0.3) + np.random.uniform(-3, 3), 5.0, 85.0)), 1)
            streamflow = round(float(max(0.2, (rainfall * 0.08) - (temp_avg * 0.05) + np.random.uniform(0, 1.5))), 2)

            precip_list.append(rainfall)
            # Approximate Hargreaves PET
            pet_val = round(float(max(10.0, 0.0023 * 15.0 * (temp_avg + 17.8) * math_sqrt(max(0.1, temp_max - temp_min)) * 30.0)), 1)
            pet_list.append(pet_val)

            row = {
                "station_name": station["name"],
                "latitude": station["lat"],
                "longitude": station["lon"],
                "region": station["region"],
                "observation_date": dt.strftime("%Y-%m-%d"),
                "rainfall": rainfall,
                "temp_min": temp_min,
                "temp_max": temp_max,
                "temp_avg": temp_avg,
                "humidity": round(float(humidity), 1),
                "wind_speed": round(float(wind), 1),
                "soil_moisture": soil_moisture,
                "streamflow": streamflow,
                "evapotranspiration": pet_val,
                "data_source": "SYNTHETIC_DEMO"
            }
            station_rows.append(row)

        # Calculate SPI-3 and SPEI-3 for the station with scale-1 fallback for initial warmup records
        p_series = pd.Series(precip_list)
        pet_series = pd.Series(pet_list)
        spi_series, _ = DroughtIndexCalculator.calculate_spi(p_series, scale=3)
        spei_series, _ = DroughtIndexCalculator.calculate_spei(p_series, pet_series, scale=3)
        spi_1_series, _ = DroughtIndexCalculator.calculate_spi(p_series, scale=1)
        spei_1_series, _ = DroughtIndexCalculator.calculate_spei(p_series, pet_series, scale=1)

        for i in range(len(station_rows)):
            s3 = spi_series.iloc[i] if i < len(spi_series) else np.nan
            s1 = spi_1_series.iloc[i] if i < len(spi_1_series) else np.nan
            spi_val = float(s3) if not pd.isna(s3) else (float(s1) if not pd.isna(s1) else 0.0)

            se3 = spei_series.iloc[i] if i < len(spei_series) else np.nan
            se1 = spei_1_series.iloc[i] if i < len(spei_1_series) else np.nan
            spei_val = float(se3) if not pd.isna(se3) else (float(se1) if not pd.isna(se1) else 0.0)

            station_rows[i]["spi"] = round(spi_val, 2)
            station_rows[i]["spei"] = round(spei_val, 2)
            # Target severity classification based on SPI standard McKee thresholds
            station_rows[i]["severity_label"] = DroughtIndexCalculator.classify_drought_index(spi_val)

        records.extend(station_rows)

    df = pd.DataFrame(records)
    return df

def math_sqrt(val):
    import math
    return math.sqrt(val)
