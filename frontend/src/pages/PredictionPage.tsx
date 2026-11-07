import React, { useState, useEffect } from 'react';
import {
  BrainCircuit,
  Sliders,
  CheckCircle,
  AlertTriangle,
  Download,
  Save,
  HelpCircle,
  FileSpreadsheet,
  ArrowRight,
  ShieldCheck,
  ChevronDown
} from 'lucide-react';
import { api } from '../services/api';
import { PredictionResult, DatasetItem } from '../types';

const SEVERITY_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Normal: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  Moderate: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Severe: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
  Extreme: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' }
};

const WARNING_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Normal: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  Watch: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Warning: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
  Critical: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' }
};

export const PredictionPage: React.FC = () => {
  const [method, setMethod] = useState<'manual' | 'dataset'>('manual');
  const [datasets, setDatasets] = useState<DatasetItem[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | ''>('');
  
  // Form inputs
  const [locationName, setLocationName] = useState<string>('Anantapur Station (Semi-Arid Basin)');
  const [predictionDate, setPredictionDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [rainfall, setRainfall] = useState<string>('12.5');
  const [tempMin, setTempMin] = useState<string>('24.0');
  const [tempMax, setTempMax] = useState<string>('37.5');
  const [tempAvg, setTempAvg] = useState<string>('30.5');
  const [humidity, setHumidity] = useState<string>('35.0');
  const [windSpeed, setWindSpeed] = useState<string>('4.2');
  const [soilMoisture, setSoilMoisture] = useState<string>('16.0');
  const [streamflow, setStreamflow] = useState<string>('0.6');
  const [evapotranspiration, setEvapotranspiration] = useState<string>('68.0');
  const [spi, setSpi] = useState<string>('-1.42');
  const [spei, setSpei] = useState<string>('-1.55');

  const [loading, setLoading] = useState<boolean>(false);
  const [batchLoading, setBatchLoading] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<string | null>(null);
  const [result, setResult] = useState<PredictionResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  useEffect(() => {
    api.getDatasets().then(setDatasets).catch(() => {});
  }, []);

  const handleManualPredict = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaveSuccess(false);

    const rainVal = parseFloat(rainfall);
    if (isNaN(rainVal) || rainVal < 0) {
      setErrorMsg('Please enter a valid non-negative rainfall amount (mm).');
      return;
    }

    try {
      setLoading(true);
      const payload = {
        location_name: locationName,
        prediction_date: predictionDate,
        rainfall: rainVal,
        temp_min: tempMin ? parseFloat(tempMin) : undefined,
        temp_max: tempMax ? parseFloat(tempMax) : undefined,
        temp_avg: tempAvg ? parseFloat(tempAvg) : undefined,
        humidity: humidity ? parseFloat(humidity) : undefined,
        wind_speed: windSpeed ? parseFloat(windSpeed) : undefined,
        soil_moisture: soilMoisture ? parseFloat(soilMoisture) : undefined,
        streamflow: streamflow ? parseFloat(streamflow) : undefined,
        evapotranspiration: evapotranspiration ? parseFloat(evapotranspiration) : undefined,
        spi: spi ? parseFloat(spi) : undefined,
        spei: spei ? parseFloat(spei) : undefined
      };

      const res = await api.predictManual(payload);
      setResult(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate prediction');
    } finally {
      setLoading(false);
    }
  };

  const handleExportSingleCsv = () => {
    if (!result) return;
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      'Location,Date,Probability(%),Severity,WarningStatus,ModelName,ModelVersion\n' +
      `"${result.location_name}","${result.prediction_date}",${result.drought_probability},"${result.severity}","${result.warning_status}","${result.model_name}","${result.model_version}"\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `drought_prediction_${result.location_name}_${result.prediction_date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Drought Severity & Probability Prediction
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Estimate drought probability, classify risk severity, and trigger early-warning advisories using active ML models.
        </p>
      </div>

      {/* Method Switcher Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setMethod('manual')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            method === 'manual'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Method A: Manual Parameter Input</span>
        </button>
        <button
          onClick={() => setMethod('dataset')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            method === 'dataset'
              ? 'bg-emerald-800 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          <span>Method B: Dataset Batch Prediction</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {method === 'manual' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Input Form (7 cols) */}
          <form
            onSubmit={handleManualPredict}
            className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <span>Environmental & Hydrometeorological Inputs</span>
              </h3>
              <span className="text-[11px] text-slate-500">* Rainfall is required</span>
            </div>

            {/* Row 1: Location & Date */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Location / Monitoring Station *
                </label>
                <select
                  value={locationName}
                  onChange={(e) => setLocationName(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                >
                  <option value="Anantapur Station (Semi-Arid Basin)">Anantapur Station (Semi-Arid)</option>
                  <option value="Marathwada Central (Rain Shadow)">Marathwada Central (Rain Shadow)</option>
                  <option value="Jodhpur Arid Zone (Thar Border)">Jodhpur Arid Zone (Thar Border)</option>
                  <option value="Vidarbha East (Cotton Belt)">Vidarbha East (Cotton Belt)</option>
                  <option value="Bundelkhand Uplands (Granite Terrain)">Bundelkhand Uplands</option>
                  <option value="Custom Station">Other / Custom Monitoring Station</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Observation Date *</label>
                <input
                  type="date"
                  value={predictionDate}
                  onChange={(e) => setPredictionDate(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                />
              </div>
            </div>

            {/* Row 2: Rainfall & Soil Moisture */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Precipitation / Rainfall (mm) *
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1000"
                  value={rainfall}
                  onChange={(e) => setRainfall(e.target.value)}
                  placeholder="e.g. 15.0"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                  required
                />
                <span className="text-[10px] text-slate-400">Monthly or period cumulative (0 - 1000 mm)</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Root-Zone Soil Moisture (%)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={soilMoisture}
                  onChange={(e) => setSoilMoisture(e.target.value)}
                  placeholder="e.g. 18.5"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <span className="text-[10px] text-slate-400">Volumetric root zone (0 - 100%)</span>
              </div>
            </div>

            {/* Row 3: Temperatures */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Min Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempMin}
                  onChange={(e) => setTempMin(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Max Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempMax}
                  onChange={(e) => setTempMax(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Avg Temp (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tempAvg}
                  onChange={(e) => setTempAvg(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {/* Row 4: Humidity & Wind */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Relative Humidity (%)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={humidity}
                  onChange={(e) => setHumidity(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Wind Speed (m/s)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {/* Row 5: Streamflow & Evapotranspiration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Streamflow Discharge (m³/s)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={streamflow}
                  onChange={(e) => setStreamflow(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Potential ET / PET (mm)</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={evapotranspiration}
                  onChange={(e) => setEvapotranspiration(e.target.value)}
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>
            </div>

            {/* Row 6: SPI & SPEI */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Precipitation Index (SPI value)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={spi}
                  onChange={(e) => setSpi(e.target.value)}
                  placeholder="e.g. -1.45"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <span className="text-[10px] text-slate-400">Normal: &gt; -1.0, Moderate: -1.0 to -1.5</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Water Balance Index (SPEI value)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={spei}
                  onChange={(e) => setSpei(e.target.value)}
                  placeholder="e.g. -1.60"
                  className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
                <span className="text-[10px] text-slate-400">Climatic water balance index</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold tracking-wide uppercase shadow-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <BrainCircuit className="w-4 h-4" />
              <span>{loading ? 'Evaluating Model Inference...' : 'Generate Drought Prediction'}</span>
            </button>
          </form>

          {/* Result Card (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {result ? (
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div>
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                      Prediction Result
                    </span>
                    <h3 className="font-bold text-slate-900 text-base">{result.location_name}</h3>
                  </div>
                  <span className="text-xs text-slate-400">{result.prediction_date}</span>
                </div>

                {/* Score & Badges */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Estimated Drought Probability</div>
                    <div className="text-3xl font-extrabold text-slate-900 mt-0.5">
                      {result.drought_probability !== undefined ? `${result.drought_probability.toFixed(1)}%` : 'N/A'}
                    </div>
                  </div>
                  <div className="text-right space-y-1.5">
                    <div>
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                          SEVERITY_BADGES[result.severity]?.bg
                        } ${SEVERITY_BADGES[result.severity]?.text} ${SEVERITY_BADGES[result.severity]?.border}`}
                      >
                        {result.severity} Risk
                      </span>
                    </div>
                    <div>
                      <span
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${
                          WARNING_BADGES[result.warning_status]?.bg
                        } ${WARNING_BADGES[result.warning_status]?.text} ${
                          WARNING_BADGES[result.warning_status]?.border
                        }`}
                      >
                        Warning: {result.warning_status}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Key Contributing Factors */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Primary Contributing Factors
                  </h4>
                  <div className="space-y-1.5">
                    {result.explanation.primary_factors.map((factor, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs flex items-center justify-between"
                      >
                        <span className="font-semibold text-slate-800 capitalize">{factor.feature}</span>
                        <span className="text-slate-500 text-[11px]">{factor.impact}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suggested Actions */}
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">
                    Preparedness & Advisory Measures
                  </h4>
                  <ul className="space-y-1.5 text-xs text-slate-600">
                    {result.explanation.suggested_actions.map((act, idx) => (
                      <li key={idx} className="flex items-start space-x-2">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Limitation Notice */}
                <div className="p-3 bg-slate-100/70 rounded-xl text-[11px] text-slate-500 leading-relaxed border border-slate-200">
                  <div className="font-semibold text-slate-700 flex items-center space-x-1 mb-0.5">
                    <ShieldCheck className="w-3 h-3 text-slate-500" />
                    <span>Scientific Disclaimer:</span>
                  </div>
                  {result.explanation.limitations}
                </div>

                {/* Model details footer & export */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                  <span>
                    Model: <strong className="text-slate-700">{result.model_name}</strong> ({result.model_version})
                  </span>
                  <button
                    onClick={handleExportSingleCsv}
                    className="flex items-center space-x-1 text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-xs text-center text-slate-400 space-y-3">
                <BrainCircuit className="w-12 h-12 text-slate-300 mx-auto" />
                <h3 className="font-bold text-slate-700 text-sm">Prediction Waiting</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
                  Fill in the environmental parameters and click &ldquo;Generate Drought Prediction&rdquo; to estimate probability and severity class.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Method B: Dataset Batch Prediction */
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Method B: Batch Predictions via Dataset</h3>
            <p className="text-xs text-slate-500">
              Select an uploaded hydrometeorological dataset to run inference across all observations using the active model.
            </p>
          </div>

          {batchResult && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{batchResult}</span>
            </div>
          )}

          <div className="max-w-md space-y-3">
            <label className="block text-xs font-semibold text-slate-700">Select Uploaded Dataset</label>
            <select
              value={selectedDatasetId}
              onChange={(e) => {
                setSelectedDatasetId(e.target.value ? parseInt(e.target.value) : '');
                setBatchResult(null);
                setErrorMsg(null);
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="">-- Choose Dataset --</option>
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.row_count} rows, {d.processing_status})
                </option>
              ))}
            </select>

            <button
              onClick={async () => {
                if (!selectedDatasetId) return;
                try {
                  setBatchLoading(true);
                  setErrorMsg(null);
                  setBatchResult(null);
                  const res = await api.predictBatch(selectedDatasetId as number);
                  setBatchResult(`${res.message} View all records in the Prediction History tab.`);
                } catch (err: any) {
                  setErrorMsg(err.message || 'Batch prediction failed.');
                } finally {
                  setBatchLoading(false);
                }
              }}
              disabled={!selectedDatasetId || batchLoading}
              className="px-4 py-2.5 bg-emerald-800 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-2"
            >
              <BrainCircuit className="w-3.5 h-3.5" />
              <span>{batchLoading ? 'Generating Batch Inference...' : 'Run Batch Dataset Predictions'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
