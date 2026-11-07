import React, { useState, useEffect } from 'react';
import {
  Cpu,
  Play,
  CheckCircle2,
  AlertCircle,
  BarChart2,
  Table as TableIcon,
  ShieldAlert,
  Award,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip
} from 'recharts';
import { api } from '../services/api';
import { MLModelItem, MLModelDetail } from '../types';

export const ModelPerformancePage: React.FC = () => {
  const [models, setModels] = useState<MLModelItem[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null);
  const [modelDetail, setModelDetail] = useState<MLModelDetail | null>(null);
  
  // Training controls
  const [trainAlgo, setTrainAlgo] = useState<string>('Random Forest');
  const [testSize, setTestSize] = useState<number>(0.2);
  const [training, setTraining] = useState<boolean>(false);
  const [trainStatusMsg, setTrainStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchModels = async () => {
    try {
      const data = await api.getModels();
      setModels(data);
      if (data.length > 0) {
        // Select active model or first model by default
        const active = data.find((m) => m.is_active) || data[0];
        setSelectedModelId(active.id);
      }
    } catch (e) {
      console.error('Failed to list models', e);
    }
  };

  useEffect(() => {
    fetchModels();
  }, []);

  useEffect(() => {
    if (selectedModelId) {
      api
        .getModelDetail(selectedModelId)
        .then(setModelDetail)
        .catch(console.error);
    }
  }, [selectedModelId]);

  const handleTrain = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setTraining(true);
      setTrainStatusMsg(null);
      const res = await api.trainModel({
        algorithm: trainAlgo,
        target_type: 'drought_severity',
        test_size: testSize
      });
      setTrainStatusMsg({
        type: 'success',
        text: `Successfully trained ${res.model_name} (${res.version})! Accuracy: ${(res.metrics.accuracy * 100).toFixed(1)}%`
      });
      await fetchModels();
      setSelectedModelId(res.model_id);
    } catch (err: any) {
      setTrainStatusMsg({
        type: 'error',
        text: err.message || 'Model training failed.'
      });
    } finally {
      setTraining(false);
    }
  };

  const handleActivate = async (id: number) => {
    try {
      const res = await api.activateModel(id);
      setTrainStatusMsg({ type: 'success', text: res.message });
      fetchModels();
    } catch (err: any) {
      setTrainStatusMsg({ type: 'error', text: err.message || 'Activation failed.' });
    }
  };

  // Convert feature importance to array for chart
  const featData = modelDetail?.feature_importance
    ? Object.entries(modelDetail.feature_importance).map(([feature, importance]) => ({
        feature,
        importance: +(importance * 100).toFixed(1)
      }))
    : [];

  const cm = modelDetail?.metrics?.confusion_matrix;
  const classes = modelDetail?.metrics?.classes || ['Normal', 'Moderate', 'Severe', 'Extreme'];

  return (
    <div className="space-y-6">
      <div className="pb-2 border-b border-slate-200">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          Machine Learning Model Performance & Benchmark Evaluation
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Train, evaluate, and benchmark Random Forest, XGBoost, Decision Tree, and Logistic Regression models.
        </p>
      </div>

      {trainStatusMsg && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 border ${
            trainStatusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {trainStatusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          )}
          <span>{trainStatusMsg.text}</span>
        </div>
      )}

      {/* Training Controls Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
              <Cpu className="w-4 h-4 text-emerald-700" />
              <span>Train & Evaluate New Model Run</span>
            </h3>
            <p className="text-xs text-slate-500">
              Uses chronological train/test split to prevent temporal data leakage.
            </p>
          </div>
        </div>

        <form onSubmit={handleTrain} className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Algorithm</label>
            <select
              value={trainAlgo}
              onChange={(e) => setTrainAlgo(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value="Random Forest">Random Forest (Primary Proposed)</option>
              <option value="XGBoost">XGBoost Classifier</option>
              <option value="Decision Tree">Decision Tree Classifier</option>
              <option value="Logistic Regression">Logistic Regression Baseline</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target Definition</label>
            <input
              type="text"
              readOnly
              value="Drought Severity (SPI-3 Class)"
              className="w-full text-xs bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-slate-600 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Test Split (Chronological)</label>
            <select
              value={testSize}
              onChange={(e) => setTestSize(parseFloat(e.target.value))}
              className="w-full text-xs bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
            >
              <option value={0.15}>15% Test Split (Latest Records)</option>
              <option value={0.2}>20% Test Split (Recommended)</option>
              <option value={0.25}>25% Test Split</option>
              <option value={0.3}>30% Test Split</option>
            </select>
          </div>

          <div>
            <button
              type="submit"
              disabled={training}
              className="w-full py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{training ? 'Training Pipeline...' : 'Execute Model Training'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Model Comparison Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-sm">Model Comparison & Benchmark Matrix</h3>
          <span className="text-xs text-slate-400">Click any row to inspect deep metrics below</span>
        </div>

        {models.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Model</th>
                  <th className="py-2.5 px-3">Algorithm</th>
                  <th className="py-2.5 px-3">Accuracy</th>
                  <th className="py-2.5 px-3">F1-Score</th>
                  <th className="py-2.5 px-3">Precision</th>
                  <th className="py-2.5 px-3">Recall</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {models.map((m) => {
                  const isSelected = selectedModelId === m.id;
                  return (
                    <tr
                      key={m.id}
                      onClick={() => setSelectedModelId(m.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected ? 'bg-emerald-50/70 font-medium' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-3 font-semibold text-slate-900 flex items-center space-x-2">
                        {m.is_active && <Award className="w-4 h-4 text-emerald-700 shrink-0" />}
                        <span>{m.model_name}</span>
                      </td>
                      <td className="py-3 px-3 text-slate-500">{m.algorithm}</td>
                      <td className="py-3 px-3 font-bold text-slate-900">
                        {m.accuracy !== undefined ? `${(m.accuracy * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="py-3 px-3 font-bold text-emerald-800">
                        {m.f1_score !== undefined ? `${(m.f1_score * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="py-3 px-3">
                        {m.precision !== undefined ? `${(m.precision * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="py-3 px-3">
                        {m.recall !== undefined ? `${(m.recall * 100).toFixed(1)}%` : 'N/A'}
                      </td>
                      <td className="py-3 px-3">
                        {m.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            Active Primary
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-500">
                            Standby
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {!m.is_active && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleActivate(m.id);
                            }}
                            className="px-2.5 py-1 bg-white border border-slate-300 hover:border-emerald-600 hover:text-emerald-800 text-slate-700 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
                          >
                            Set Active
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-slate-400">
            No models trained yet. Click &ldquo;Execute Model Training&rdquo; to train the first model.
          </div>
        )}
      </div>

      {/* Selected Model Deep Dive Inspection */}
      {modelDetail && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Metrics & Confusion Matrix (6 cols) */}
          <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                  Model Evaluation Detail
                </span>
                <h3 className="font-bold text-slate-900 text-base">{modelDetail.model_name}</h3>
              </div>
              <span className="text-xs font-mono text-slate-500">{modelDetail.version}</span>
            </div>

            {/* Quick 4 Metrics Cards */}
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-semibold">ACCURACY</span>
                <span className="text-base font-extrabold text-slate-900">
                  {modelDetail.metrics?.accuracy !== undefined ? `${(modelDetail.metrics.accuracy * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-semibold">F1-SCORE</span>
                <span className="text-base font-extrabold text-emerald-800">
                  {modelDetail.metrics?.f1_score !== undefined ? `${(modelDetail.metrics.f1_score * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-semibold">PRECISION</span>
                <span className="text-base font-extrabold text-slate-900">
                  {modelDetail.metrics?.precision !== undefined ? `${(modelDetail.metrics.precision * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-semibold">RECALL</span>
                <span className="text-base font-extrabold text-slate-900">
                  {modelDetail.metrics?.recall !== undefined ? `${(modelDetail.metrics.recall * 100).toFixed(1)}%` : 'N/A'}
                </span>
              </div>
            </div>

            {/* Confusion Matrix Table */}
            {cm && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-800 uppercase tracking-wide block">
                  Confusion Matrix (Test Evaluation Split)
                </span>
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-center text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="py-2 px-2 text-left">Actual \ Pred</th>
                        {classes.map((c) => (
                          <th key={c} className="py-2 px-2">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {classes.map((cActual, i) => (
                        <tr key={cActual}>
                          <td className="py-2 px-2 text-left font-semibold text-slate-700 bg-slate-50/60">
                            {cActual}
                          </td>
                          {classes.map((cPred, j) => {
                            const val = cm[i] ? cm[i][j] : 0;
                            const isDiagonal = i === j;
                            return (
                              <td
                                key={cPred}
                                className={`py-2 px-2 font-mono ${
                                  isDiagonal && val > 0 ? 'bg-emerald-100 text-emerald-950 font-bold' : 'text-slate-600'
                                }`}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span>Train Set: {modelDetail.metrics.train_samples} samples</span>
                  <span>Test Set: {modelDetail.metrics.test_samples} samples</span>
                </div>
              </div>
            )}
          </div>

          {/* Feature Importance (6 cols) */}
          <div className="lg:col-span-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Relative Feature Importance (%)</h3>
              <p className="text-xs text-slate-500">
                Influence of environmental variables in model decision boundaries
              </p>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featData} layout="vertical" margin={{ top: 10, right: 20, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="feature" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', color: '#fff', fontSize: '12px' }}
                    formatter={(val) => [`${val}%`, 'Relative Weight']}
                  />
                  <Bar dataKey="importance" fill="#0f766e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Scientific disclaimer regarding causation */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-500 leading-relaxed">
              <span className="font-semibold text-slate-700 block mb-0.5">Methodological Note:</span>
              Feature importance denotes statistical association and Gini impurity reduction across tree ensembles. It reflects model decision reliance rather than direct biophysical causation.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
