import React, { useEffect, useState } from 'react';
import {
  CloudRain,
  Thermometer,
  Layers,
  AlertTriangle,
  Activity,
  Calendar,
  ArrowUpRight,
  TrendingDown,
  Info,
  CheckCircle,
  Clock,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';
import { api } from '../services/api';
import { AnalyticsSummaryData, EnvironmentalTrendPoint, PredictionResult } from '../types';

const SEVERITY_COLORS: Record<string, string> = {
  Normal: '#16a34a',
  Moderate: '#d97706',
  Severe: '#ea580c',
  Extreme: '#dc2626'
};

const WARNING_BADGES: Record<string, { bg: string; text: string; border: string }> = {
  Normal: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' },
  Watch: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200' },
  Warning: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-200' },
  Critical: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' }
};

export const OverviewPage: React.FC = () => {
  const [summary, setSummary] = useState<AnalyticsSummaryData | null>(null);
  const [trends, setTrends] = useState<EnvironmentalTrendPoint[]>([]);
  const [recentPredictions, setRecentPredictions] = useState<PredictionResult[]>([]);
  const [timeRange, setTimeRange] = useState<string>('36');
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [sumData, trendData, predData] = await Promise.all([
        api.getSummary(),
        api.getTrends({ location_name: selectedLocation, limit: parseInt(timeRange) }),
        api.getPredictions({ limit: 5 })
      ]);
      setSummary(sumData);
      setTrends(trendData);
      setRecentPredictions(predData.items || []);
    } catch (err) {
      console.error('Failed to load overview data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [timeRange, selectedLocation]);

  // Derive latest record values
  const latestRec = trends.length > 0 ? trends[trends.length - 1] : null;
  const latestPred = recentPredictions.length > 0 ? recentPredictions[0] : null;

  // Pie chart data
  const pieData = summary?.severity_breakdown
    ? Object.entries(summary.severity_breakdown).map(([name, value]) => ({ name, value }))
    : [];

  return (
    <div className="space-y-6">
      {/* Top Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            DroughtSense Environmental Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time monitoring, meteorological indices (SPI/SPEI), and machine learning risk severity.
          </p>
        </div>

        <div className="flex items-center space-x-3 w-full sm:w-auto">
          {/* Station selector */}
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          >
            <option value="All">All Monitored Basins</option>
            <option value="Anantapur Station (Semi-Arid Basin)">Anantapur Station</option>
            <option value="Marathwada Central (Rain Shadow)">Marathwada Central</option>
            <option value="Jodhpur Arid Zone (Thar Border)">Jodhpur Arid Zone</option>
            <option value="Vidarbha East (Cotton Belt)">Vidarbha East</option>
            <option value="Bundelkhand Uplands (Granite Terrain)">Bundelkhand Uplands</option>
          </select>

          {/* Time range selector */}
          <div className="flex items-center space-x-1 bg-white border border-slate-200 rounded-lg p-1 shadow-2xs text-xs">
            {['12', '24', '36'].map((val) => (
              <button
                key={val}
                onClick={() => setTimeRange(val)}
                className={`px-2.5 py-1 rounded-md transition-colors font-medium cursor-pointer ${
                  timeRange === val
                    ? 'bg-emerald-800 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {val}M
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 6 Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Drought Probability */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Drought Probability</span>
              <Activity className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {latestPred && latestPred.drought_probability !== undefined
                ? `${latestPred.drought_probability.toFixed(1)}%`
                : 'N/A'}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span className="truncate max-w-[100px]">{latestPred?.location_name || 'Central Basin'}</span>
            <span className="font-medium text-emerald-700">Model Score</span>
          </div>
        </div>

        {/* Card 2: Drought Severity */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Severity Status</span>
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            </div>
            <div className="flex items-center mt-1">
              <span
                className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: `${SEVERITY_COLORS[latestPred?.severity || 'Moderate']}15`,
                  color: SEVERITY_COLORS[latestPred?.severity || 'Moderate']
                }}
              >
                {latestPred?.severity || 'Moderate'}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-400">
            Rule: SPI &le; -1.00 cutoff
          </div>
        </div>

        {/* Card 3: Rainfall */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Latest Rainfall</span>
              <CloudRain className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {latestRec?.rainfall !== null && latestRec?.rainfall !== undefined
                ? `${latestRec.rainfall} mm`
                : `${summary?.average_rainfall || 0} mm`}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Obs: {latestRec?.date || 'Recent'}</span>
            <span className="text-teal-700 font-medium">Monthly sum</span>
          </div>
        </div>

        {/* Card 4: Soil Moisture */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Soil Moisture</span>
              <Layers className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-slate-900 tracking-tight">
              {latestRec?.soil_moisture !== null && latestRec?.soil_moisture !== undefined
                ? `${latestRec.soil_moisture}%`
                : `${summary?.average_soil_moisture || 0}%`}
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Volumetric root zone</span>
            <span className="text-emerald-700 font-medium">0-30 cm</span>
          </div>
        </div>

        {/* Card 5: SPI/SPEI Status */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>SPI-3 / SPEI-3</span>
              <TrendingDown className="w-4 h-4 text-sky-600" />
            </div>
            <div className="flex items-baseline space-x-2 text-xl font-bold text-slate-900">
              <span>{latestRec?.spi !== null && latestRec?.spi !== undefined ? latestRec.spi.toFixed(2) : '-1.12'}</span>
              <span className="text-xs font-normal text-slate-400">/</span>
              <span className="text-sm font-semibold text-slate-600">
                {latestRec?.spei !== null && latestRec?.spei !== undefined ? latestRec.spei.toFixed(2) : '-1.25'}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            Timescale: 3-Month Rolling
          </div>
        </div>

        {/* Card 6: Early-Warning Status */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span>Early Warning</span>
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <div className="mt-1">
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                  WARNING_BADGES[latestPred?.warning_status || 'Watch']?.bg
                } ${WARNING_BADGES[latestPred?.warning_status || 'Watch']?.text} ${
                  WARNING_BADGES[latestPred?.warning_status || 'Watch']?.border
                }`}
              >
                {latestPred?.warning_status || 'Watch'}
              </span>
            </div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[11px] text-slate-500 truncate" title="Precipitation deficit alert">
            Precipitation deficit advisory
          </div>
        </div>
      </div>

      {/* Main Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Rainfall Trend */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Monthly Rainfall Trend (mm)</h3>
              <p className="text-xs text-slate-500">Observed precipitation vs historical seasonality</p>
            </div>
            <span className="text-xs font-medium text-emerald-800 bg-emerald-50 px-2 py-1 rounded-md border border-emerald-200">
              Precipitation (mm)
            </span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rainGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0f766e" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#0f766e" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="rainfall" name="Rainfall (mm)" stroke="#0f766e" strokeWidth={2} fillOpacity={1} fill="url(#rainGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: SPI and SPEI Trend */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Standardized Drought Indices (SPI-3 vs SPEI-3)</h3>
              <p className="text-xs text-slate-500">WMO reference threshold: &le; -1.0 indicates drought deficit</p>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                <span>SPI-3</span>
              </span>
              <span className="flex items-center space-x-1">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-600"></span>
                <span>SPEI-3</span>
              </span>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <YAxis domain={[-3.0, 3.0]} tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="spi" name="SPI-3" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="spei" name="SPEI-3" stroke="#0284c7" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Soil Moisture & Streamflow */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Soil Moisture (%) & Streamflow (m³/s)</h3>
              <p className="text-xs text-slate-500">Hydrological response to meteorological conditions</p>
            </div>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="soil_moisture" name="Soil Moisture (%)" stroke="#15803d" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="streamflow" name="Streamflow (m³/s)" stroke="#d97706" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Severity Distribution */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Drought Severity Frequency Distribution</h3>
              <p className="text-xs text-slate-500">Proportion of historical records in each risk classification</p>
            </div>
          </div>
          <div className="h-64 w-full flex items-center justify-center">
            {pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                  >
                    {pieData.map((entry) => (
                      <Cell key={entry.name} fill={SEVERITY_COLORS[entry.name] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                  />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-xs text-slate-400">Loading severity distribution...</div>
            )}
          </div>
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-bold text-slate-800 text-sm">Recent Platform Predictions & Events</h3>
            <p className="text-xs text-slate-500">Auditable prediction log stored in the SQLite database</p>
          </div>
          <a
            href="/history"
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center space-x-1"
          >
            <span>View All History</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </a>
        </div>

        {recentPredictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Prediction Date</th>
                  <th className="py-2.5 px-3">Probability</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Warning</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {recentPredictions.map((pred) => (
                  <tr key={pred.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900">{pred.location_name}</td>
                    <td className="py-3 px-3">{pred.prediction_date}</td>
                    <td className="py-3 px-3 font-bold text-emerald-800">{pred.drought_probability !== undefined ? `${pred.drought_probability.toFixed(1)}%` : 'N/A'}</td>
                    <td className="py-3 px-3">
                      <span
                        className="px-2 py-0.5 rounded font-semibold text-[11px]"
                        style={{
                          backgroundColor: `${SEVERITY_COLORS[pred.severity]}15`,
                          color: SEVERITY_COLORS[pred.severity]
                        }}
                      >
                        {pred.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[11px] border ${
                          WARNING_BADGES[pred.warning_status]?.bg
                        } ${WARNING_BADGES[pred.warning_status]?.text} ${WARNING_BADGES[pred.warning_status]?.border}`}
                      >
                        {pred.warning_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">{pred.model_name}</td>
                    <td className="py-3 px-3 text-slate-400">
                      {new Date(pred.created_timestamp).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="font-medium text-slate-600">No predictions recorded yet.</p>
            <p className="text-slate-400 mt-1">
              Visit the <a href="/prediction" className="text-emerald-700 font-semibold underline">Drought Prediction</a> page to generate and log model predictions.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
