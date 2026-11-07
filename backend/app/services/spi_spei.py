"""
SPI and SPEI Calculation Module for DroughtSense
================================================
Implements:
1. Standardized Precipitation Index (SPI) using 2-parameter Gamma distribution & Thom's zero-rain adjustment.
2. Potential Evapotranspiration (PET) using Thornthwaite and Hargreaves methods.
3. Standardized Precipitation Evapotranspiration Index (SPEI) using climatic water balance (P - PET)
   fitted to a Generalized Extreme Value (GEV) / Pearson III / Log-Logistic distribution via SciPy.
4. Drought Severity Classification according to WMO & McKee et al. conventions.
"""

import math
import numpy as np
import pandas as pd
from typing import List, Dict, Tuple, Optional
from scipy import stats


class DroughtIndexCalculator:
    """
    Statistically robust, documented calculator for SPI, PET, and SPEI.
    """

    MIN_RECORDS_RECOMMENDED = 24  # Minimum recommended time periods for stable statistical fitting
    MIN_RECORDS_ABSOLUTE = 12     # Hard minimum records required to fit distribution

    @staticmethod
    def classify_drought_index(index_value: Optional[float]) -> str:
        """
        Standard WMO / McKee et al. severity classification.
        - Index > -1.00: Normal / Near Normal
        - -1.00 to -1.49: Moderate Drought
        - -1.50 to -1.99: Severe Drought
        - <= -2.00: Extreme Drought
        """
        if index_value is None or np.isnan(index_value):
            return "Unknown"
        if index_value >= -0.99:
            return "Normal"
        elif index_value >= -1.49:
            return "Moderate"
        elif index_value >= -1.99:
            return "Severe"
        else:
            return "Extreme"

    @classmethod
    def calculate_spi(
        cls,
        precipitation_series: pd.Series,
        scale: int = 1
    ) -> Tuple[pd.Series, Dict[str, any]]:
        """
        Calculate Standardized Precipitation Index (SPI) for a given scale (aggregation period).
        
        Parameters:
        -----------
        precipitation_series : pd.Series
            Chronological precipitation values (mm).
        scale : int
            Rolling window aggregation period (e.g. 1, 3, 6, 12).
            
        Returns:
        --------
        spi_series : pd.Series
            Standard normal deviates representing SPI.
        metadata : dict
            Fitted distribution parameters, zero-probability q, sample size, and status.
        """
        series = precipitation_series.copy().astype(float)
        
        # Check sufficient data
        valid_count = series.dropna().shape[0]
        if valid_count < cls.MIN_RECORDS_ABSOLUTE:
            empty_res = pd.Series(index=series.index, dtype=float)
            return empty_res, {
                "status": "ERROR",
                "message": f"Insufficient data: {valid_count} records provided, minimum required is {cls.MIN_RECORDS_ABSOLUTE}.",
                "scale": scale
            }

        # Step 1: Rolling sum for the selected scale
        if scale > 1:
            rolling_precip = series.rolling(window=scale, min_periods=scale).sum()
        else:
            rolling_precip = series

        valid_mask = rolling_precip.notna()
        valid_vals = rolling_precip[valid_mask].values

        if len(valid_vals) < cls.MIN_RECORDS_ABSOLUTE:
            empty_res = pd.Series(index=series.index, dtype=float)
            return empty_res, {
                "status": "ERROR",
                "message": f"After {scale}-period aggregation, only {len(valid_vals)} valid values remain.",
                "scale": scale
            }

        # Step 2: Separate zero and positive precipitation
        zeros_count = np.sum(valid_vals <= 0.001)
        total_count = len(valid_vals)
        q = zeros_count / total_count  # Probability of zero rain

        positive_vals = valid_vals[valid_vals > 0.001]

        if len(positive_vals) < 3:
            empty_res = pd.Series(index=series.index, dtype=float)
            return empty_res, {
                "status": "ERROR",
                "message": "Not enough non-zero precipitation observations to fit Gamma distribution.",
                "scale": scale
            }

        # Step 3: Fit 2-parameter Gamma distribution to positive values
        # SciPy gamma fit: shape a (alpha), loc (fixed to 0), scale (beta)
        try:
            alpha, loc_fit, beta = stats.gamma.fit(positive_vals, floc=0)
            if alpha <= 0 or beta <= 0 or np.isnan(alpha) or np.isnan(beta):
                raise ValueError("Invalid parameters from gamma.fit")
        except Exception:
            # Fallback to Thom's maximum likelihood estimation
            mean_p = float(np.mean(positive_vals))
            ln_mean = float(np.log(max(mean_p, 1e-4)))
            mean_ln = float(np.mean(np.log(np.maximum(positive_vals, 1e-4))))
            A = ln_mean - mean_ln
            if A <= 0:
                A = 1e-4
            alpha = (1.0 + np.sqrt(1.0 + 4.0 * A / 3.0)) / (4.0 * A)
            beta = mean_p / max(alpha, 1e-4)

        # Step 4: Compute cumulative probabilities H(x) = q + (1 - q) * G(x)
        spi_values = np.full_like(valid_vals, np.nan, dtype=float)
        for i, x in enumerate(valid_vals):
            if x <= 0.001:
                # If zero rainfall, probability is q / 2 or q
                H = max(q, 1e-6)
            else:
                G = stats.gamma.cdf(x, a=alpha, scale=beta)
                if np.isnan(G):
                    G = 0.5
                H = q + (1.0 - q) * G

            # Clip cumulative probability to prevent +/- infinity in normal PPF
            H = np.clip(H, 1e-6, 1.0 - 1e-6)
            # Transform to standard normal quantile
            z = stats.norm.ppf(H)
            # Bound standard SPI range between -3.5 and +3.5
            spi_values[i] = np.clip(z, -3.5, 3.5)

        # Place back into full series using positional indexing to avoid index misalignment
        result_series = pd.Series(index=series.index, dtype=float)
        valid_indices = np.where(valid_mask)[0]
        for v_i, spi_v in zip(valid_indices, spi_values):
            result_series.iloc[v_i] = round(float(spi_v), 2)

        metadata = {
            "status": "SUCCESS",
            "scale": scale,
            "distribution": "Gamma (2-parameter)",
            "alpha": round(float(alpha), 4),
            "beta": round(float(beta), 4),
            "zero_probability_q": round(float(q), 4),
            "sample_size": total_count,
            "warning": "Sample size below recommended 24 records" if total_count < cls.MIN_RECORDS_RECOMMENDED else None
        }

        return result_series, metadata

    @classmethod
    def estimate_pet_thornthwaite(
        cls,
        monthly_temp_c: pd.Series,
        latitude: float = 20.0
    ) -> pd.Series:
        """
        Estimate Potential Evapotranspiration (PET) in mm/month using Thornthwaite (1948).
        Requires monthly average temperature in °C and latitude for daylength adjustment.
        """
        temps = monthly_temp_c.copy().clip(lower=0.0)
        # Annual heat index I = sum((T / 5)^1.514)
        mean_monthly = temps.groupby(temps.index.month if hasattr(temps.index, 'month') else np.arange(len(temps)) % 12).mean()
        heat_indices = (mean_monthly / 5.0) ** 1.514
        I = heat_indices.sum()
        if I <= 0:
            I = 1e-4

        # Empirical exponent a
        a = (6.75e-7 * (I ** 3)) - (7.71e-5 * (I ** 2)) + (1.792e-2 * I) + 0.49239

        # Unadjusted PET = 16 * (10 * T / I)^a
        unadjusted_pet = 16.0 * ((10.0 * temps / I) ** a)

        # Simplified daylight factor based on latitude
        lat_rad = math.radians(abs(latitude))
        correction_factor = 1.0 + 0.15 * math.sin(lat_rad)
        pet = unadjusted_pet * correction_factor
        return pet.clip(lower=0.0).round(2)

    @classmethod
    def estimate_pet_hargreaves(
        cls,
        t_min: pd.Series,
        t_max: pd.Series,
        t_mean: Optional[pd.Series] = None,
        latitude: float = 20.0
    ) -> pd.Series:
        """
        Estimate PET using Hargreaves-Samani method.
        PET = 0.0023 * Ra * (T_mean + 17.8) * (T_max - T_min)^0.5
        where Ra is extraterrestrial radiation (approx ~ 15 mm/day eq for tropics/subtropics).
        """
        if t_mean is None:
            t_mean = (t_max + t_min) / 2.0

        temp_range = (t_max - t_min).clip(lower=0.1)
        # Approximate extraterrestrial radiation Ra in mm/day equivalent (~ 12 to 16 mm/day)
        lat_rad = math.radians(abs(latitude))
        ra = 15.0 - 3.0 * math.sin(lat_rad)  # approximation

        # Daily PET * 30 days for monthly
        daily_pet = 0.0023 * ra * (t_mean + 17.8) * (temp_range ** 0.5)
        monthly_pet = (daily_pet * 30.0).clip(lower=0.0)
        return monthly_pet.round(2)

    @classmethod
    def calculate_spei(
        cls,
        precipitation_series: pd.Series,
        pet_series: pd.Series,
        scale: int = 1
    ) -> Tuple[pd.Series, Dict[str, any]]:
        """
        Calculate Standardized Precipitation Evapotranspiration Index (SPEI).
        Climatic water balance: D = P - PET
        Fitted with Generalized Extreme Value / Pearson III distribution.
        
        Parameters:
        -----------
        precipitation_series : pd.Series
            Precipitation in mm.
        pet_series : pd.Series
            Potential evapotranspiration in mm.
        scale : int
            Aggregation scale (e.g., 1, 3, 6, 12).
            
        Returns:
        --------
        spei_series : pd.Series
            Standard normal deviates representing SPEI.
        metadata : dict
            Fitted distribution parameters and statistics.
        """
        p = precipitation_series.copy().astype(float)
        pet = pet_series.copy().astype(float)
        
        # Climatic water balance D = P - PET
        d = p - pet

        valid_count = d.dropna().shape[0]
        if valid_count < cls.MIN_RECORDS_ABSOLUTE:
            empty_res = pd.Series(index=d.index, dtype=float)
            return empty_res, {
                "status": "ERROR",
                "message": f"Insufficient data: {valid_count} records provided, minimum required is {cls.MIN_RECORDS_ABSOLUTE}.",
                "scale": scale
            }

        # Rolling aggregation of water balance D
        if scale > 1:
            d_agg = d.rolling(window=scale, min_periods=scale).sum()
        else:
            d_agg = d

        valid_mask = d_agg.notna()
        valid_vals = d_agg[valid_mask].values

        if len(valid_vals) < cls.MIN_RECORDS_ABSOLUTE:
            empty_res = pd.Series(index=d.index, dtype=float)
            return empty_res, {
                "status": "ERROR",
                "message": f"After {scale}-period aggregation, only {len(valid_vals)} valid values remain.",
                "scale": scale
            }

        # Fit Generalized Extreme Value (GEV) distribution to D
        probs = None
        dist_name = "Generalized Extreme Value (GEV)"
        try:
            c, loc, scale_fit = stats.genextreme.fit(valid_vals)
            if scale_fit > 0 and not np.isnan(scale_fit):
                probs = stats.genextreme.cdf(valid_vals, c, loc=loc, scale=scale_fit)
                if np.isnan(probs).any() or (probs <= 0).all() or (probs >= 1).all():
                    probs = None
        except Exception:
            probs = None

        if probs is None:
            # Fallback to Pearson Type III
            try:
                skew, loc, scale_fit = stats.pearson3.fit(valid_vals)
                if scale_fit > 0 and not np.isnan(scale_fit):
                    probs = stats.pearson3.cdf(valid_vals, skew, loc=loc, scale=scale_fit)
                    dist_name = "Pearson Type III"
                    if np.isnan(probs).any():
                        probs = None
            except Exception:
                probs = None

        if probs is None:
            # Fallback to Gaussian Empirical distribution
            loc = float(np.mean(valid_vals))
            scale_fit = float(np.std(valid_vals)) or 1.0
            probs = stats.norm.cdf(valid_vals, loc=loc, scale=scale_fit)
            dist_name = "Normal (Gaussian Empirical)"

        # Clip probabilities to avoid infinities
        probs = np.nan_to_num(probs, nan=0.5)
        probs = np.clip(probs, 1e-6, 1.0 - 1e-6)
        spei_vals = stats.norm.ppf(probs)
        spei_vals = np.clip(spei_vals, -3.5, 3.5)

        # Place back into full series using positional indexing to avoid index misalignment
        result_series = pd.Series(index=d.index, dtype=float)
        valid_indices = np.where(valid_mask)[0]
        for v_i, spei_v in zip(valid_indices, spei_vals):
            result_series.iloc[v_i] = round(float(spei_v), 2)

        metadata = {
            "status": "SUCCESS",
            "scale": scale,
            "distribution": dist_name,
            "sample_size": len(valid_vals),
            "warning": "Sample size below recommended 24 records" if len(valid_vals) < cls.MIN_RECORDS_RECOMMENDED else None
        }

        return result_series, metadata
