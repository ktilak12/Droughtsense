import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Filter,
  BarChart2,
  Activity,
  Layers,
  Thermometer,
  CloudRain,
  Calendar,
  Grid
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { api } from '../services/api';
import { EnvironmentalTrendPoint } from '../types';

export const AnalyticsPage: React.FC = () => {
  const [trends, setTrends] = useState<EnvironmentalTrendPoint[]>([]);
  const [correlations, setCorrelations] = useState<{ variables: string[]; matrix: Array<Record<string, any>> }>({
    variables: [],
    matrix: []
  });
  const [selectedLocation, setSelectedLocation] = useState<string>('All');
  const [limit, setLimit] = useState<number>(48);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [trendData, corrData] = await Promise.all([
          api.getTrends({ location_name: selectedLocation, limit }),
          api.getCorrelations()
        ]);
        setTrends(trendData);
        setCorrelations(corrData);
      } catch (err) {
        console.error('Analytics load error', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedLocation, limit]);

  // Aggregate seasonal rainfall patterns by month (1 - 12)
  const monthlyAgg: Record<number, { count: number; totalRain: number; avgTemp: number }> = {};
  trends.forEach((t) => {
    if (!t.date) return;
    const parts = t.date.split('-');
    if (parts.length >= 2) {
      const m = parseInt(parts[1], 10);
      if (!isNaN(m) && m >= 1 && m <= 12) {
        if (!monthlyAgg[m]) monthlyAgg[m] = { count: 0, totalRain: 0, avgTemp: 0 };
        monthlyAgg[m].count += 1;
        monthlyAgg[m].totalRain += t.rainfall || 0;
        monthlyAgg[m].avgTemp += t.temp_avg || 0;
      }
    }
  });

  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const seasonalData = Object.keys(monthlyAgg).map((key) => {
    const m = parseInt(key, 10);
    const item = monthlyAgg[m];
    return {
      month: MONTH_NAMES[m - 1] || `M${m}`,
      avgRainfall: item.count > 0 ? +(item.totalRain / item.count).toFixed(1) : 0,
      avgTemperature: item.count > 0 ? +(item.avgTemp / item.count).toFixed(1) : 0
    };
  });

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Trends & Climatological Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Multi-variable time series analysis, seasonal patterns, and environmental correlation heatmaps.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          >
            <option value="All">All Monitored Basins</option>
            <option value="Anantapur Station (Semi-Arid Basin)">Anantapur Station</option>
            <option value="Marathwada Central (Rain Shadow)">Marathwada Central</option>
            <option value="Jodhpur Arid Zone (Thar Border)">Jodhpur Arid Zone</option>
            <option value="Vidarbha East (Cotton Belt)">Vidarbha East</option>
            <option value="Bundelkhand Uplands (Granite Terrain)">Bundelkhand Uplands</option>
          </select>

          <select
            value={limit}
            onChange={(e) => setLimit(parseInt(e.target.value))}
            className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          >
            <option value={24}>Last 24 Months</option>
            <option value={36}>Last 36 Months</option>
            <option value={48}>Last 48 Months</option>
            <option value={60}>Full 5-Year Dataset</option>
          </select>
        </div>
      </div>

      {/* Grid of Analytical Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Temperature Range (Min, Avg, Max) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Temperature Dynamics (°C)</h3>
              <p className="text-xs text-slate-500">Min, Mean, and Max monthly temperature envelopes</p>
            </div>
            <Thermometer className="w-4 h-4 text-amber-600" />
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
                <Legend />
                <Line type="monotone" dataKey="temp_max" name="Max Temp (°C)" stroke="#ef4444" strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="temp_avg" name="Avg Temp (°C)" stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="temp_min" name="Min Temp (°C)" stroke="#06b6d4" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Seasonal Rainfall Cycle */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Seasonal Climatology (Monthly Averages)</h3>
              <p className="text-xs text-slate-500">Highlights monsoon peak periods vs summer moisture stress</p>
            </div>
            <CloudRain className="w-4 h-4 text-teal-600" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={seasonalData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Legend />
                <Bar dataKey="avgRainfall" name="Avg Rainfall (mm)" fill="#0f766e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 3: Climatic Water Balance (P vs PET) */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Climatic Water Balance (Precipitation vs PET)</h3>
              <p className="text-xs text-slate-500">Negative deficit (PET &gt; P) drives SPEI meteorological stress</p>
            </div>
            <Activity className="w-4 h-4 text-emerald-600" />
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
                <Legend />
                <Line type="monotone" dataKey="rainfall" name="Precipitation (mm)" stroke="#16a34a" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="evapotranspiration" name="PET (mm)" stroke="#ea580c" strokeWidth={2} dot={false} strokeDasharray="4 4" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 4: Soil Moisture vs Streamflow Depletion */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">Hydrological Depletion Curve</h3>
              <p className="text-xs text-slate-500">Root-zone tension response & river discharge lag</p>
            </div>
            <Layers className="w-4 h-4 text-teal-700" />
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="smGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#15803d" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#15803d" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="soil_moisture" name="Soil Moisture (%)" stroke="#15803d" fill="url(#smGradient)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Correlation Matrix Heatmap */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <Grid className="w-4 h-4 text-emerald-700" />
              <span>Hydrometeorological Correlation Matrix (Pearson r)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Pairwise statistical correlation between rainfall, temperatures, humidity, soil moisture, and SPI
            </p>
          </div>
        </div>

        {correlations.variables.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-center text-xs border-collapse">
              <thead>
                <tr>
                  <th className="py-2.5 px-3 text-left font-bold text-slate-500 bg-slate-50 border border-slate-200">
                    Variable
                  </th>
                  {correlations.variables.map((v) => (
                    <th key={v} className="py-2 px-3 font-semibold text-slate-700 bg-slate-50 border border-slate-200 whitespace-nowrap">
                      {v}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {correlations.matrix.map((row) => (
                  <tr key={row.variable}>
                    <td className="py-2 px-3 text-left font-bold text-slate-800 bg-slate-50 border border-slate-200 whitespace-nowrap">
                      {row.variable}
                    </td>
                    {correlations.variables.map((col) => {
                      const rawVal = row[col];
                      const val = typeof rawVal === 'number' && !isNaN(rawVal) ? rawVal : 0;
                      // Color scale: positive blue/green, negative red/orange
                      const bg =
                        val >= 0.7
                          ? '#047857' // dark emerald
                          : val >= 0.3
                          ? '#10b981' // emerald
                          : val >= 0.0
                          ? '#ecfdf5' // very light green
                          : val >= -0.3
                          ? '#fff7ed' // very light orange
                          : val >= -0.7
                          ? '#f97316' // orange
                          : '#dc2626'; // red
                      const textColor = Math.abs(val) > 0.4 ? '#ffffff' : '#0f172a';

                      return (
                        <td
                          key={col}
                          style={{ backgroundColor: bg, color: textColor }}
                          className="py-2 px-2.5 border border-slate-200 font-mono font-medium"
                        >
                          {val.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">Loading correlation matrix...</div>
        )}
      </div>
    </div>
  );
};
