import React, { useState, useEffect } from 'react';
import { AssignmentOffer, ActiveAssignment, ConnectionStatus } from './types';
import OfferAlertModal from './components/OfferAlertModal';
import ActiveRouteView from './components/ActiveRouteView';
import HandPaymentVerification from './components/HandPaymentVerification';
import { useOfflineSync } from './hooks/useOfflineSync';

const AgentDashboard: React.FC = () => {
  const [status, setStatus] = useState<'available' | 'on-delivery'>('available');
  const [currentOffer, setCurrentOffer] = useState<AssignmentOffer | null>(null);
  const [activeAssignment, setActiveAssignment] = useState<ActiveAssignment | null>(null);
  const [showPaymentPanel, setShowPaymentPanel] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('online');

  const { queuePaymentConfirmation, flushQueue } = useOfflineSync();

  // Register Service Worker for PWA + offline capabilities
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then((registration) => {
          console.log('[PWA] Service Worker registered:', registration.scope);

          // Listen for messages from SW (e.g. background sync trigger)
          navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_PAYMENTS') {
              flushQueue();
            }
          });
        })
        .catch((err) => console.error('[PWA] SW registration failed:', err));
    }
  }, [flushQueue]);

  // Simulate WebSocket connection for incoming offers (in production: real WS to backend)
  useEffect(() => {
    const simulateIncomingOffer = () => {
      if (status === 'available' && !currentOffer && !activeAssignment) {
        const mockOffer: AssignmentOffer = {
          orderId: 'ord_' + Date.now(),
          reference: 'GB-' + Math.floor(100000 + Math.random() * 900000),
          gasType: 'Standard Cylinder',
          sizeKg: 12,
          amountXaf: 8500,
          destination: {
            lat: 3.8480,
            lng: 11.5021,
            address: 'Biyem-Assi, Yaoundé'
          },
          estimatedDistanceMeters: 4200,
          expiresAt: new Date(Date.now() + 90 * 1000).toISOString(),
        };
        setCurrentOffer(mockOffer);
      }
    };

    // Simulate random offer every 25s in demo mode (remove in prod)
    const interval = setInterval(simulateIncomingOffer, 25000);

    // Real connection status
    const updateOnlineStatus = () => setConnectionStatus(navigator.onLine ? 'online' : 'offline');
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [status, currentOffer, activeAssignment]);

  // Handle Accept from modal
  const handleAcceptOffer = (offer: AssignmentOffer) => {
    const assignment: ActiveAssignment = {
      orderId: offer.orderId,
      reference: offer.reference,
      gasType: offer.gasType,
      amountXaf: offer.amountXaf,
      destination: offer.destination,
      acceptedAt: new Date().toISOString(),
    };

    setActiveAssignment(assignment);
    setCurrentOffer(null);
    setStatus('on-delivery');
    setShowPaymentPanel(false);

    // In real app: call backend to confirm acceptance via /matching or dedicated endpoint
    console.log('Assignment accepted:', assignment);
  };

  const handleDeclineOffer = () => {
    setCurrentOffer(null);
    // Backend will auto-cascade after timeout
  };

  // Called from HandPaymentVerification when user confirms
  const handleCashConfirmation = async (orderId: string, amount: number) => {
    const payload = {
      orderId,
      amountXaf: amount,
      confirmedAt: new Date().toISOString(),
    };

    if (connectionStatus === 'online') {
      try {
        // Real call to backend (from earlier implementation)
        const res = await fetch('http://localhost:3000/api/v1/payments/agent-confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + (localStorage.getItem('agentToken') || 'demo-token'),
          },
          body: JSON.stringify({ orderId }),
        });

        if (res.ok) {
          alert('Cash confirmed! Delivery completed.');
          resetToAvailable();
        } else {
          throw new Error('Server error');
        }
      } catch (err) {
        console.error('Failed to confirm online, queuing...', err);
        await queuePaymentConfirmation(payload);
      }
    } else {
      // Offline - queue for background sync
      await queuePaymentConfirmation(payload);
      alert('Confirmation saved offline. Will sync when connection returns.');
      resetToAvailable();
    }
  };

  const resetToAvailable = () => {
    setActiveAssignment(null);
    setShowPaymentPanel(false);
    setStatus('available');
  };

  // Simulate button to open payment panel (in real flow triggered when near destination)
  const openPaymentPanel = () => {
    if (activeAssignment) {
      setShowPaymentPanel(true);
    }
  };

  return (
    <div className="mobile-container mx-auto min-h-screen bg-gasbot-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-gasbot-800 px-4 py-3 flex items-center justify-between border-b border-slate-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center text-white font-bold text-sm">GA</div>
          <div>
            <div className="font-semibold text-lg tracking-tight">GasBot Agent</div>
            <div className="text-xs text-slate-400">Yaoundé • Agent #AG-4821</div>
          </div>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 ${
          connectionStatus === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
        }`}>
          <div className={`w-2 h-2 rounded-full ${connectionStatus === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          {connectionStatus.toUpperCase()}
        </div>
      </header>

      {/* Status Bar */}
      <div className="px-4 py-3 bg-gasbot-800 border-b border-slate-700 flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${status === 'available' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="font-medium">
            {status === 'available' ? 'Available for assignments' : 'On active delivery'}
          </span>
        </div>
        <button
          onClick={() => setStatus(status === 'available' ? 'on-delivery' : 'available')}
          className="text-xs px-3 py-1 bg-slate-700 hover:bg-slate-600 rounded transition"
        >
          Toggle Status (Demo)
        </button>
      </div>

      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Active Route Panel */}
        {activeAssignment && (
          <ActiveRouteView
            assignment={activeAssignment}
            onOpenPayment={openPaymentPanel}
            onCompleteDelivery={() => setShowPaymentPanel(true)}
          />
        )}

        {/* Payment Verification Panel */}
        {showPaymentPanel && activeAssignment && (
          <HandPaymentVerification
            assignment={activeAssignment}
            onConfirm={handleCashConfirmation}
            onCancel={() => setShowPaymentPanel(false)}
          />
        )}

        {/* No active assignment state */}
        {!activeAssignment && status === 'available' && (
          <div className="bg-gasbot-800 rounded-2xl p-6 text-center border border-slate-700">
            <div className="text-6xl mb-4">🚚</div>
            <h2 className="text-xl font-semibold mb-2">Ready for deliveries</h2>
            <p className="text-slate-400 text-sm mb-4">You will receive assignment offers here when new orders are available in your zone.</p>
            <button
              onClick={() => {
                // Force a demo offer
                const demo: AssignmentOffer = {
                  orderId: 'demo-' + Date.now(),
                  reference: 'GB-DEMO-' + Math.floor(Math.random() * 100000),
                  gasType: 'Standard Cylinder',
                  sizeKg: 12,
                  amountXaf: 8500,
                  destination: { lat: 3.8480, lng: 11.5021, address: 'Biyem-Assi' },
                  estimatedDistanceMeters: 3100,
                  expiresAt: new Date(Date.now() + 90 * 1000).toISOString(),
                };
                setCurrentOffer(demo);
              }}
              className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 rounded-xl text-sm font-medium transition"
            >
              Simulate Incoming Offer
            </button>
          </div>
        )}
      </main>

      {/* Bottom Navigation */}
      <nav className="bg-gasbot-800 border-t border-slate-700 px-2 py-2 flex justify-around text-xs">
        <button className="flex flex-col items-center px-4 py-1 text-emerald-400">
          <span>📍</span>
          <span className="mt-0.5">Map</span>
        </button>
        <button className="flex flex-col items-center px-4 py-1">
          <span>📋</span>
          <span className="mt-0.5">History</span>
        </button>
        <button className="flex flex-col items-center px-4 py-1">
          <span>👤</span>
          <span className="mt-0.5">Profile</span>
        </button>
      </nav>

      {/* Offer Modal */}
      <OfferAlertModal
        offer={currentOffer}
        onAccept={handleAcceptOffer}
        onDecline={handleDeclineOffer}
      />
    </div>
  );
};

export default AgentDashboard;
