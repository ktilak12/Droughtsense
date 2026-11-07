import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  Download,
  Eye,
  Calendar,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  X,
  FileSpreadsheet
} from 'lucide-react';
import { api } from '../services/api';
import { PredictionResult } from '../types';

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

export const PredictionHistoryPage: React.FC = () => {
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [pages, setPages] = useState<number>(1);
  const [search, setSearch] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('All');
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [warningFilter, setWarningFilter] = useState<string>('All');
  
  const [selectedItem, setSelectedItem] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await api.getPredictions({
        search: search || undefined,
        location: locationFilter !== 'All' ? locationFilter : undefined,
        severity: severityFilter !== 'All' ? severityFilter : undefined,
        warning: warningFilter !== 'All' ? warningFilter : undefined,
        page,
        limit: 10
      });
      setPredictions(res.items);
      setTotal(res.total);
      setPages(res.pages);
    } catch (err) {
      console.error('History fetch error', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [page, locationFilter, severityFilter, warningFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchHistory();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Prediction Audit Trail & Historical Log
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Archived record of all evaluated drought probabilities, model versions, and threshold snapshots.
          </p>
        </div>

        <a
          href={api.exportPredictionsCsvUrl}
          className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold rounded-xl text-xs shadow-2xs transition-colors cursor-pointer"
        >
          <Download className="w-3.5 h-3.5 text-emerald-700" />
          <span>Export All as CSV</span>
        </a>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          {/* Search text */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search location..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          {/* Location filter */}
          <div>
            <select
              value={locationFilter}
              onChange={(e) => {
                setLocationFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="All">All Locations</option>
              <option value="Anantapur Station (Semi-Arid Basin)">Anantapur Station</option>
              <option value="Marathwada Central (Rain Shadow)">Marathwada Central</option>
              <option value="Jodhpur Arid Zone (Thar Border)">Jodhpur Arid Zone</option>
              <option value="Vidarbha East (Cotton Belt)">Vidarbha East</option>
              <option value="Bundelkhand Uplands (Granite Terrain)">Bundelkhand Uplands</option>
            </select>
          </div>

          {/* Severity filter */}
          <div>
            <select
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="All">All Severity Levels</option>
              <option value="Normal">Normal</option>
              <option value="Moderate">Moderate</option>
              <option value="Severe">Severe</option>
              <option value="Extreme">Extreme</option>
            </select>
          </div>

          {/* Warning filter */}
          <div>
            <select
              value={warningFilter}
              onChange={(e) => {
                setWarningFilter(e.target.value);
                setPage(1);
              }}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="All">All Warning Statuses</option>
              <option value="Normal">Normal</option>
              <option value="Watch">Watch</option>
              <option value="Warning">Warning</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </form>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Showing {predictions.length} of {total} stored predictions</span>
          <span>Page {page} of {pages}</span>
        </div>

        {predictions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">ID</th>
                  <th className="py-2.5 px-3">Location</th>
                  <th className="py-2.5 px-3">Prediction Date</th>
                  <th className="py-2.5 px-3">Probability</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Warning</th>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Created</th>
                  <th className="py-2.5 px-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {predictions.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-3 font-mono text-slate-400">#{p.id}</td>
                    <td className="py-3 px-3 font-semibold text-slate-900">{p.location_name}</td>
                    <td className="py-3 px-3">{p.prediction_date}</td>
                    <td className="py-3 px-3 font-bold text-emerald-800">{p.drought_probability !== undefined ? `${p.drought_probability.toFixed(1)}%` : 'N/A'}</td>
                    <td className="py-3 px-3">
                      <span
                        className="px-2 py-0.5 rounded font-semibold text-[11px]"
                        style={{
                          backgroundColor: `${SEVERITY_COLORS[p.severity]}15`,
                          color: SEVERITY_COLORS[p.severity]
                        }}
                      >
                        {p.severity}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[11px] border ${
                          WARNING_BADGES[p.warning_status]?.bg
                        } ${WARNING_BADGES[p.warning_status]?.text} ${WARNING_BADGES[p.warning_status]?.border}`}
                      >
                        {p.warning_status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-500">{p.model_name}</td>
                    <td className="py-3 px-3 text-slate-400">
                      {new Date(p.created_timestamp).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => setSelectedItem(p)}
                        className="p-1.5 text-slate-500 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="View Full Input & Explanation Snapshot"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-xs text-slate-400">
            No prediction logs matched the selected filters.
          </div>
        )}

        {/* Pagination buttons */}
        {pages > 1 && (
          <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
            <button
              onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
              disabled={page <= 1}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="font-medium text-slate-600">
              Page {page} of {pages}
            </span>

            <button
              onClick={() => setPage((prev) => Math.min(prev + 1, pages))}
              disabled={page >= pages}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Detail Inspection Modal */}
      {selectedItem && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase">
                  Prediction Snapshot #{selectedItem.id}
                </span>
                <h3 className="font-bold text-slate-900 text-base">{selectedItem.location_name}</h3>
              </div>
              <button
                onClick={() => setSelectedItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Score & Warning */}
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Drought Probability</span>
                <span className="text-2xl font-extrabold text-slate-900">
                  {selectedItem.drought_probability !== undefined ? `${selectedItem.drought_probability.toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-slate-500 block">Severity & Warning</span>
                <div className="flex items-center space-x-2 mt-1">
                  <span className="font-bold text-slate-900">{selectedItem.severity}</span>
                  <span className="text-slate-400">/</span>
                  <span className="font-bold text-amber-700">{selectedItem.warning_status}</span>
                </div>
              </div>
            </div>

            {/* Input Snapshot Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-2">
                Input Features at Prediction Time
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {Object.entries(selectedItem.input_snapshot || {}).map(([key, val]) => (
                  <div key={key} className="p-2 rounded-lg bg-slate-50 border border-slate-100">
                    <span className="text-[10px] text-slate-400 uppercase block font-semibold">{key}</span>
                    <span className="font-medium text-slate-800">{val !== null ? String(val) : 'N/A'}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Explanation & Action Advisory */}
            {selectedItem.explanation && (
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-1">
                    Advisories & Recommended Preparedness
                  </h4>
                  <ul className="list-disc pl-5 text-xs text-slate-600 space-y-1">
                    {selectedItem.explanation.suggested_actions?.map((act, i) => (
                      <li key={i}>{act}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl text-[11px] text-slate-500 border border-slate-200">
                  <span className="font-semibold text-slate-700 block mb-0.5">Disclaimer:</span>
                  {selectedItem.explanation.limitations}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedItem(null)}
                className="px-4 py-2 bg-slate-100 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-200 cursor-pointer"
              >
                Close Snapshot
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
