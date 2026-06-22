import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LiveMapDashboard from './components/LiveMapDashboard';
import ProductCatalogManager from './components/ProductCatalogManager';
import TransactionsTable from './components/TransactionsTable';

type View = 'map' | 'catalog' | 'transactions';

const AdminLayout: React.FC = () => {
  const { user, logout, isLoading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('map');
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center bg-slate-950 text-white">Loading admin console...</div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation */}
      <header className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-500 rounded-xl flex items-center justify-center text-white font-bold text-xl">G</div>
            <div>
              <div className="font-semibold text-2xl tracking-tight">GasBot</div>
              <div className="text-xs text-slate-400 -mt-1">Operations Console</div>
            </div>
          </div>
          <div className="ml-8 flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${connectionStatus === 'connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            <span className="text-slate-400">{connectionStatus.toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm">
          <div className="text-right">
            <div className="font-medium">{user.email}</div>
            <div className="text-xs text-emerald-400">{user.role}</div>
          </div>
          <button
            onClick={logout}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-sm transition"
          >
            Sign Out
          </button>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 p-4 flex flex-col">
          <nav className="space-y-1">
            {[
              { id: 'map' as const, label: 'Live Agent Tracking', icon: '🗺️' },
              { id: 'catalog' as const, label: 'Product Catalog', icon: '🛢️' },
              { id: 'transactions' as const, label: 'Transactions & Orders', icon: '📋' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left text-sm font-medium transition ${
                  currentView === item.id
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'hover:bg-slate-800 text-slate-300'
                }`}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 text-xs text-slate-500">
            v0.1.0 • Connected to backend
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 p-6 overflow-auto">
          {currentView === 'map' && <LiveMapDashboard onConnectionChange={setConnectionStatus} />}
          {currentView === 'catalog' && <ProductCatalogManager />}
          {currentView === 'transactions' && <TransactionsTable />}
        </main>
      </div>
    </div>
  );
};

// Simple login screen
const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('admin@gasbot.app');
  const [password, setPassword] = useState('demo123');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await login(email, password);
    if (!success) {
      setError('Invalid credentials. Use admin@gasbot.app / demo123');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-full max-w-md bg-slate-900 p-8 rounded-2xl border border-slate-800">
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center text-3xl mb-4">G</div>
          <h1 className="text-3xl font-semibold">GasBot Admin</h1>
          <p className="text-slate-400 mt-1">Operations Monitoring Console</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-500"
            required
          />
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-500 transition py-3 rounded-xl font-semibold"
          >
            Sign In
          </button>
        </form>
        <p className="text-center text-xs text-slate-500 mt-6">Demo credentials pre-filled</p>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AdminLayout />
    </AuthProvider>
  );
};

export default App;
