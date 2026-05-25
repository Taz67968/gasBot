import React, { useState } from 'react';
import { ActiveAssignment } from '../types';

interface HandPaymentVerificationProps {
  assignment: ActiveAssignment;
  onConfirm: (orderId: string, amountXaf: number) => void;
  onCancel: () => void;
}

const HandPaymentVerification: React.FC<HandPaymentVerificationProps> = ({
  assignment,
  onConfirm,
  onCancel,
}) => {
  const [confirmedByHand, setConfirmedByHand] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleConfirm = async () => {
    if (!confirmedByHand) return;

    setIsSubmitting(true);
    try {
      await onConfirm(assignment.orderId, assignment.amountXaf);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-gasbot-800 rounded-3xl border border-slate-700 p-5 space-y-6">
      <div>
        <div className="uppercase text-xs tracking-widest text-emerald-400 mb-1">CASH ON DELIVERY</div>
        <div className="text-4xl font-semibold tabular-nums tracking-tighter text-white">
          {assignment.amountXaf.toLocaleString()} <span className="text-2xl font-medium text-slate-400">XAF</span>
        </div>
        <div className="text-sm text-slate-400 mt-1">Order {assignment.reference} • {assignment.gasType}</div>
      </div>

      {/* Security Confirmation Toggle - Critical for audit trail */}
      <div className="bg-gasbot-700/60 border border-slate-600 rounded-2xl p-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={confirmedByHand}
            onChange={(e) => setConfirmedByHand(e.target.checked)}
            className="mt-1 w-5 h-5 accent-emerald-500 flex-shrink-0"
          />
          <div className="text-sm leading-snug">
            I confirm physical collection of <span className="font-semibold text-emerald-400">XAF {assignment.amountXaf.toLocaleString()}</span> by hand from the customer.
            <div className="text-[10px] text-slate-400 mt-1">This action is logged and cannot be undone.</div>
          </div>
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="flex-1 py-3.5 rounded-2xl bg-slate-700 hover:bg-slate-600 text-sm font-medium disabled:opacity-50"
        >
          Cancel
        </button>

        <button
          onClick={handleConfirm}
          disabled={!confirmedByHand || isSubmitting}
          className="flex-1 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:bg-slate-700 disabled:text-slate-400 text-sm font-semibold transition disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Syncing...' : 'Confirm Cash & Complete Delivery'}
        </button>
      </div>

      <p className="text-center text-[10px] text-slate-500">
        You must physically receive the cash before confirming.
      </p>
    </div>
  );
};

export default HandPaymentVerification;
