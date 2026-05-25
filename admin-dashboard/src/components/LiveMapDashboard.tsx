import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Agent, AgentLocationUpdate } from '../types';

// Fix default Leaflet icons for Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

interface LiveMapDashboardProps {
  onConnectionChange?: (status: 'connected' | 'disconnected') => void;
}

const LiveMapDashboard: React.FC<LiveMapDashboardProps> = ({ onConnectionChange }) => {
  const [agents, setAgents] = useState<Agent[]>([
    // Seed data for demo
    { id: 'ag-1', fullName: 'Jean Mbala', phone: '+237612345678', status: 'ACTIVE', location: { lat: 3.8480, lng: 11.5021 } },
    { id: 'ag-2', fullName: 'Aminata Diallo', phone: '+237698765432', status: 'BUSY', location: { lat: 3.8700, lng: 11.5200 } },
    { id: 'ag-3', fullName: 'Paul Nguema', phone: '+237677112233', status: 'OFFLINE', location: { lat: 3.8100, lng: 11.4800 } },
  ]);

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  // Simulated real-time WebSocket connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: NodeJS.Timeout;

    const connectWebSocket = () => {
      // In production: ws://localhost:3000/ws/agents or use EventSource for SSE
      // For demo we simulate updates
      onConnectionChange?.('connecting');

      // Mock real-time updates every 4 seconds
      const interval = setInterval(() => {
        setAgents(prev => prev.map(agent => {
          if (agent.location && (agent.status === 'ACTIVE' || agent.status === 'BUSY')) {
            const jitter = 0.0008;
            const newLat = agent.location.lat + (Math.random() - 0.5) * jitter;
            const newLng = agent.location.lng + (Math.random() - 0.5) * jitter;

            return {
              ...agent,
              location: { lat: newLat, lng: newLng },
              lastUpdated: new Date().toISOString(),
            };
          }
          return agent;
        }));
      }, 4000);

      onConnectionChange?.('connected');

      // Cleanup
      return () => {
        clearInterval(interval);
        onConnectionChange?.('disconnected');
      };
    };

    const cleanup = connectWebSocket();

    return () => {
      if (ws) ws.close();
      cleanup?.();
    };
  }, [onConnectionChange]);

  const getMarkerColor = (status: Agent['status']) => {
    switch (status) {
      case 'ACTIVE': return '#22c55e'; // green
      case 'BUSY': return '#f59e0b';   // orange/amber
      case 'OFFLINE':
      default: return '#64748b';       // gray
    }
  };

  const createColoredIcon = (color: string) => {
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="background-color: ${color}; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 0 2px rgba(0,0,0,0.3);"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  };

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Live Agent Tracking</h2>
          <p className="text-sm text-slate-400">Real-time positions • Click markers for delivery details</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-green-500" /> ACTIVE</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-amber-500" /> BUSY</div>
            <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-full bg-slate-500" /> OFFLINE</div>
          </div>
        </div>
      </div>

      <div className="flex-1 rounded-2xl overflow-hidden border border-slate-800 bg-slate-900">
        <MapContainer
          center={[3.8480, 11.5021]}
          zoom={13}
          style={{ height: '100%', width: '100%' }}
          zoomControl={true}
        >
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {agents.map((agent) => {
            if (!agent.location) return null;
            const color = getMarkerColor(agent.status);
            return (
              <Marker
                key={agent.id}
                position={[agent.location.lat, agent.location.lng]}
                icon={createColoredIcon(color)}
                eventHandlers={{
                  click: () => setSelectedAgent(agent),
                }}
              >
                <Popup>
                  <div className="text-sm min-w-[220px]">
                    <div className="font-semibold text-base mb-1">{agent.fullName}</div>
                    <div className="text-xs text-slate-400 mb-2">{agent.phone}</div>
                    
                    <div className={`inline-block px-2 py-0.5 rounded text-xs font-medium mb-3 ${
                      agent.status === 'ACTIVE' ? 'bg-green-500/10 text-green-400' :
                      agent.status === 'BUSY' ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-500/10 text-slate-400'
                    }`}>
                      {agent.status}
                    </div>

                    <div className="space-y-1 text-xs">
                      <div><span className="text-slate-400">Last update:</span> {agent.lastUpdated ? new Date(agent.lastUpdated).toLocaleTimeString() : 'N/A'}</div>
                      <div><span className="text-slate-400">Current order:</span> {agent.status === 'BUSY' ? 'GB-482109' : 'None'}</div>
                    </div>

                    <button 
                      onClick={() => alert(`Viewing full delivery logs for ${agent.fullName}`)}
                      className="mt-3 w-full text-center py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-medium transition"
                    >
                      View Active Delivery Logs
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>

      <div className="mt-3 text-xs text-slate-500 flex justify-between">
        <div>Real-time updates via WebSocket (simulated)</div>
        <div>{agents.length} agents tracked</div>
      </div>
    </div>
  );
};

export default LiveMapDashboard;
