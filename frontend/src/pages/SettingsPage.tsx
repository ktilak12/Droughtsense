import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  CheckCircle,
  AlertTriangle,
  RotateCcw,
  Sliders,
  ShieldCheck,
  Info
} from 'lucide-react';
import { api } from '../services/api';
import { AppSettingsConfig } from '../types';

export const SettingsPage: React.FC = () => {
  const [config, setConfig] = useState<AppSettingsConfig>({
    default_location: 'Anantapur Station (Semi-Arid Basin)',
    preferred_units: 'Metric (mm, °C)',
    default_date_range: 'Last 12 Months',
    severity_thresholds: {
      moderate_spi: -1.0,
      severe_spi: -1.5,
      extreme_spi: -2.0,
      moderate_prob: 40.0,
      severe_prob: 65.0,
      extreme_prob: 85.0
    },
    warning_thresholds: {
      watch_prob: 35.0,
      warning_prob: 55.0,
      critical_prob: 75.0
    },
    demo_mode_enabled: true
  });

  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api
      .getSettings()
      .then(setConfig)
      .catch((e) => console.error('Failed to load settings', e));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setFeedback(null);
      const updated = await api.updateSettings(config);
      setConfig(updated);
      setFeedback({ type: 'success', text: 'Settings updated successfully. New rules will apply to future predictions.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setConfig({
      default_location: 'Anantapur Station (Semi-Arid Basin)',
      preferred_units: 'Metric (mm, °C)',
      default_date_range: 'Last 12 Months',
      severity_thresholds: {
        moderate_spi: -1.0,
        severe_spi: -1.5,
        extreme_spi: -2.0,
        moderate_prob: 40.0,
        severe_prob: 65.0,
        extreme_prob: 85.0
      },
      warning_thresholds: {
        watch_prob: 35.0,
        warning_prob: 55.0,
        critical_prob: 75.0
      },
      demo_mode_enabled: true
    });
    setFeedback({
      type: 'success',
      text: 'Reset to scientific recommended defaults. Click "Save Configuration" to apply permanently.'
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Platform & Threshold Configuration
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Configure default observation baselines, unit preferences, and custom classification thresholds.
        </p>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* General Application Preferences */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="font-bold text-slate-900 text-sm pb-2 border-b border-slate-100 flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-emerald-700" />
            <span>General Preferences</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Default Station / Basin</label>
              <select
                value={config.default_location}
                onChange={(e) => setConfig({ ...config, default_location: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="Anantapur Station (Semi-Arid Basin)">Anantapur Station (Semi-Arid Basin)</option>
                <option value="Marathwada Central (Rain Shadow)">Marathwada Central (Rain Shadow)</option>
                <option value="Jodhpur Arid Zone (Thar Border)">Jodhpur Arid Zone (Thar Border)</option>
                <option value="Vidarbha East (Cotton Belt)">Vidarbha East (Cotton Belt)</option>
                <option value="Bundelkhand Uplands (Granite Terrain)">Bundelkhand Uplands (Granite Terrain)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Measurement Units</label>
              <select
                value={config.preferred_units}
                onChange={(e) => setConfig({ ...config, preferred_units: e.target.value })}
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                <option value="Metric (mm, °C)">Metric (Precipitation in mm, Temperature in °C)</option>
                <option value="Imperial (inches, °F)">Imperial (Precipitation in inches, Temperature in °F)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Drought Severity Cutoff Thresholds */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-emerald-700" />
              <span>Drought Severity Cutoff Thresholds (SPI & Probability)</span>
            </h3>
            <span className="text-[11px] text-slate-400">WMO Standard Reference</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Moderate Drought SPI Cutoff</label>
              <input
                type="number"
                step="0.05"
                value={config.severity_thresholds.moderate_spi}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    severity_thresholds: {
                      ...config.severity_thresholds,
                      moderate_spi: parseFloat(e.target.value)
                    }
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[10px] text-slate-400">Default: -1.00</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Severe Drought SPI Cutoff</label>
              <input
                type="number"
                step="0.05"
                value={config.severity_thresholds.severe_spi}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    severity_thresholds: {
                      ...config.severity_thresholds,
                      severe_spi: parseFloat(e.target.value)
                    }
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[10px] text-slate-400">Default: -1.50</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Extreme Drought SPI Cutoff</label>
              <input
                type="number"
                step="0.05"
                value={config.severity_thresholds.extreme_spi}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    severity_thresholds: {
                      ...config.severity_thresholds,
                      extreme_spi: parseFloat(e.target.value)
                    }
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[10px] text-slate-400">Default: -2.00</span>
            </div>
          </div>
        </div>

        {/* Early-Warning Engine Cutoffs */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Early-Warning Trigger Probabilities (%)</span>
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Watch Trigger (%)</label>
              <input
                type="number"
                step="1"
                min="10"
                max="90"
                value={config.warning_thresholds.watch_prob}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    warning_thresholds: {
                      ...config.warning_thresholds,
                      watch_prob: parseFloat(e.target.value)
                    }
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[10px] text-slate-400">Default: 35%</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Warning Trigger (%)</label>
              <input
                type="number"
                step="1"
                min="20"
                max="95"
                value={config.warning_thresholds.warning_prob}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    warning_thresholds: {
                      ...config.warning_thresholds,
                      warning_prob: parseFloat(e.target.value)
                    }
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[10px] text-slate-400">Default: 55%</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Critical Alert Trigger (%)</label>
              <input
                type="number"
                step="1"
                min="30"
                max="100"
                value={config.warning_thresholds.critical_prob}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    warning_thresholds: {
                      ...config.warning_thresholds,
                      critical_prob: parseFloat(e.target.value)
                    }
                  })
                }
                className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
              />
              <span className="text-[10px] text-slate-400">Default: 75%</span>
            </div>
          </div>
        </div>

        {/* Persistence Notice */}
        <div className="p-4 bg-slate-100 rounded-xl text-xs text-slate-500 leading-relaxed flex items-start space-x-2 border border-slate-200">
          <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <span>
            <strong>Historical Integrity Guarantee:</strong> Threshold adjustments saved here will only apply to new predictions. Each archived record preserves the exact threshold snapshot active at the time it was computed.
          </span>
        </div>

        <div className="flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-all flex items-center space-x-2 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Defaults</span>
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving Preferences...' : 'Save Configuration'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
