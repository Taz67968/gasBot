import React from 'react';
import { ActiveAssignment } from '../types';

interface ActiveRouteViewProps {
  assignment: ActiveAssignment;
  onOpenPayment: () => void;
  onCompleteDelivery: () => void;
}

const ActiveRouteView: React.FC<ActiveRouteViewProps> = ({ assignment, onOpenPayment, onCompleteDelivery }) => {
  const { destination, reference, gasType, amountXaf } = assignment;

  const openInMaps = () => {
    const { lat, lng } = destination;
    // Optimized Google Maps directions link (works great on mobile)
    const mapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(mapsUrl, '_blank');
  };

  return (
    <div className="bg-gasbot-800 rounded-3xl border border-slate-700 overflow-hidden">
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="uppercase text-emerald-400 text-xs tracking-[1.5px] font-medium">ACTIVE DELIVERY</div>
            <div className="text-2xl font-semibold tracking-tighter mt-0.5">{reference}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400">Cash due</div>
            <div className="text-emerald-400 font-semibold text-xl tabular-nums">{amountXaf.toLocaleString()} XAF</div>
          </div>
        </div>

        <div className="mt-4 text-sm">
          <div className="text-slate-400 text-xs">Gas</div>
          <div className="font-medium">{gasType}</div>
        </div>

        <div className="mt-3">
          <div className="text-xs text-slate-400">Destination</div>
          <div className="font-medium leading-tight">{destination.address || 'Customer location'}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 tabular-nums">
            {destination.lat.toFixed(4)}, {destination.lng.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-slate-700 bg-gasbot-900/50 p-4 flex flex-col gap-2.5">
        <button
          onClick={openInMaps}
          className="w-full py-3 bg-white text-gasbot-900 rounded-2xl font-semibold text-sm active:bg-slate-200 flex items-center justify-center gap-2 transition"
        >
          <span>🗺️</span>
          <span>Open in Google Maps / Waze</span>
        </button>

        <button
          onClick={onCompleteDelivery}
          className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-2xl font-medium text-sm transition"
        >
          Arrived — Verify Cash Payment
        </button>
      </div>
    </div>
  );
};

export default ActiveRouteView;
