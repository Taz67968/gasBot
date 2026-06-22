import React, { useState, useEffect } from 'react';
import { AssignmentOffer } from '../types';

interface OfferAlertModalProps {
  offer: AssignmentOffer | null;
  onAccept: (offer: AssignmentOffer) => void;
  onDecline: () => void;
}

const OfferAlertModal: React.FC<OfferAlertModalProps> = ({ offer, onAccept, onDecline }) => {
  const [timeLeft, setTimeLeft] = useState(90);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (!offer) return;

    const expiresAt = new Date(offer.expiresAt).getTime();
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
      setTimeLeft(remaining);
      setProgress(Math.max(0, (remaining / 90) * 100));

      if (remaining <= 0) {
        clearInterval(interval);
        onDecline(); // Auto decline on timeout (backend cascades)
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [offer, onDecline]);

  if (!offer) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-end md:items-center justify-center p-4">
      <div className="bg-gasbot-800 w-full max-w-[420px] rounded-t-3xl md:rounded-3xl overflow-hidden border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="bg-amber-500/10 px-5 py-4 flex items-center justify-between border-b border-amber-500/20">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-500 rounded-2xl flex items-center justify-center text-white text-xl">🚨</div>
            <div>
              <div className="font-semibold text-amber-400">New Assignment</div>
              <div className="text-xs text-amber-400/70">Incoming offer</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-mono font-semibold tabular-nums text-amber-400">{timeLeft}</div>
            <div className="text-[10px] text-amber-400/60 -mt-1">SECONDS LEFT</div>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400 mb-1">Order</div>
            <div className="text-2xl font-semibold tracking-tighter">{offer.reference}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-gasbot-700/50 rounded-2xl p-3">
              <div className="text-xs text-slate-400">Gas Cylinder</div>
              <div className="font-medium mt-0.5">{offer.gasType} • {offer.sizeKg}kg</div>
            </div>
            <div className="bg-gasbot-700/50 rounded-2xl p-3">
              <div className="text-xs text-slate-400">Cash to Collect</div>
              <div className="font-semibold text-emerald-400 mt-0.5 text-xl tracking-tighter">
                {offer.amountXaf.toLocaleString()} XAF
              </div>
            </div>
          </div>

          <div className="bg-gasbot-700/50 rounded-2xl p-3 text-sm">
            <div className="text-xs text-slate-400">Destination</div>
            <div className="font-medium">{offer.destination.address || 'Customer location'}</div>
            <div className="text-xs text-slate-400 mt-1">
              ~{(offer.estimatedDistanceMeters || 0) / 1000} km away
            </div>
          </div>

          {/* Countdown Progress Bar */}
          <div>
            <div className="flex justify-between text-xs mb-1.5 text-slate-400">
              <span>Time remaining to respond</span>
              <span className="font-mono">{timeLeft}s</span>
            </div>
            <div className="h-2.5 bg-gasbot-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-500 progress-bar"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 bg-gasbot-900/60 flex gap-3 border-t border-slate-700">
          <button
            onClick={onDecline}
            className="flex-1 py-3.5 rounded-2xl bg-slate-700 hover:bg-slate-600 active:bg-slate-500 font-medium text-sm transition"
          >
            Decline
          </button>
          <button
            onClick={() => onAccept(offer)}
            className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 font-semibold text-sm transition"
          >
            Accept Assignment
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfferAlertModal;
