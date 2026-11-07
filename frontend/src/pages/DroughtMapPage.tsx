import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { MapPin, Filter, AlertTriangle, Layers, Droplets, Thermometer, ShieldAlert } from 'lucide-react';
import { api } from '../services/api';
import { MapStation } from '../types';

// Custom colored leaflet markers using SVG divIcons
const createMarkerIcon = (severity: string) => {
  const colorMap: Record<string, string> = {
    Normal: '#16a34a',
    Moderate: '#d97706',
    Severe: '#ea580c',
    Extreme: '#dc2626',
    Unknown: '#64748b'
  };
  const color = colorMap[severity] || '#16a34a';

  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background-color: ${color};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.35);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <div style="background-color: white; width: 6px; height: 6px; border-radius: 50%;"></div>
      </div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12]
  });
};

export const DroughtMapPage: React.FC = () => {
  const [stations, setStations] = useState<MapStation[]>([]);
  const [severityFilter, setSeverityFilter] = useState<string>('All');
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    api
      .getMapStations()
      .then(setStations)
      .catch((err) => console.error('Map stations fetch error', err))
      .finally(() => setLoading(false));
  }, []);

  const filteredStations = stations.filter((s) => {
    if (severityFilter === 'All') return true;
    return s.severity === severityFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Geographic Drought Risk Map
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Spatial visualization of monitored meteorological stations with real-time severity markers.
          </p>
        </div>

        {/* Severity Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-600 shadow-2xs"
          >
            <option value="All">All Severities</option>
            <option value="Normal">Normal Only</option>
            <option value="Moderate">Moderate Only</option>
            <option value="Severe">Severe Only</option>
            <option value="Extreme">Extreme Only</option>
          </select>
        </div>
      </div>

      {/* Synthetic Demo Label */}
      <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between text-xs text-amber-900">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
          <span>
            <strong>Synthetic Demonstration Coordinates:</strong> Displaying 5 simulated regional stations in representative semi-arid & dryland zones across India. Markers reflect computed model indices.
          </span>
        </div>
      </div>

      {/* Map Container Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden relative">
        <div className="h-[580px] w-full">
          <MapContainer
            center={[20.5937, 78.9629]}
            zoom={5}
            scrollWheelZoom={true}
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredStations.map((station) => (
              <Marker
                key={station.id}
                position={[station.latitude, station.longitude]}
                icon={createMarkerIcon(station.severity)}
              >
                <Popup className="drought-popup">
                  <div className="p-1 space-y-2 text-slate-800 min-w-[200px]">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        {station.region || 'Monitored Region'}
                      </span>
                      <h4 className="font-bold text-sm text-slate-900">{station.name}</h4>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                      <span className="text-slate-500">Drought Probability:</span>
                      <span className="font-extrabold text-emerald-800">
                        {station.drought_probability !== undefined ? `${station.drought_probability.toFixed(1)}%` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Severity Status:</span>
                      <span className="font-bold text-slate-900">{station.severity}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Warning Level:</span>
                      <span className="font-semibold text-amber-700">{station.warning_status}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                      <div>
                        Rain: <strong>{station.latest_rainfall ?? 'N/A'} mm</strong>
                      </div>
                      <div>
                        Soil: <strong>{station.latest_soil_moisture ?? 'N/A'}%</strong>
                      </div>
                      <div>
                        SPI-3: <strong>{station.latest_spi?.toFixed(2) ?? 'N/A'}</strong>
                      </div>
                      <div>
                        SPEI-3: <strong>{station.latest_spei?.toFixed(2) ?? 'N/A'}</strong>
                      </div>
                    </div>

                    <div className="text-[10px] text-slate-400 pt-1">
                      Obs Date: {station.observation_date}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Floating Map Legend */}
        <div className="absolute bottom-5 right-5 z-20 bg-white/95 backdrop-blur-xs p-4 rounded-xl border border-slate-200 shadow-md text-xs space-y-2 min-w-[170px]">
          <span className="font-bold text-slate-900 block pb-1 border-b border-slate-100 uppercase tracking-wider text-[10px]">
            Drought Severity
          </span>
          <div className="space-y-1.5 text-[11px]">
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
              <span>Normal (&ge; -0.99)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-amber-600"></span>
              <span>Moderate (-1.00 to -1.49)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-orange-600"></span>
              <span>Severe (-1.50 to -1.99)</span>
            </div>
            <div className="flex items-center space-x-2">
              <span className="w-3 h-3 rounded-full bg-red-600"></span>
              <span>Extreme (&le; -2.00)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
