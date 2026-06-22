import React, { useState, useMemo } from 'react';
import { Order } from '../types';

const TransactionsTable: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([
    { id: 'o1', reference: 'GB-482109', customerPhone: '+237612345678', status: 'DELIVERED', totalXaf: 8500, agentId: 'ag-1', agentName: 'Jean Mbala', createdAt: '2026-05-24T10:15:00Z', deliveryLocation: { lat: 3.8480, lng: 11.5021 } },
    { id: 'o2', reference: 'GB-482110', customerPhone: '+237698765432', status: 'EN_ROUTE', totalXaf: 4500, agentId: 'ag-2', agentName: 'Aminata Diallo', createdAt: '2026-05-25T08:30:00Z', deliveryLocation: { lat: 3.8700, lng: 11.5200 } },
    { id: 'o3', reference: 'GB-482111', customerPhone: '+237677112233', status: 'CASH_ACKNOWLEDGED', totalXaf: 16500, agentId: undefined, agentName: undefined, createdAt: '2026-05-25T09:45:00Z', deliveryLocation: { lat: 3.8100, lng: 11.4800 } },
  ]);

  const [filters, setFilters] = useState({
    status: '',
    reference: '',
    agent: '',
    dateFrom: '',
    dateTo: '',
  });

  const [sortConfig, setSortConfig] = useState<{ key: keyof Order; direction: 'asc' | 'desc' }>({
    key: 'createdAt',
    direction: 'desc',
  });

  const filteredAndSortedOrders = useMemo(() => {
    let result = [...orders];

    // Filters
    if (filters.status) {
      result = result.filter(o => o.status === filters.status);
    }
    if (filters.reference) {
      result = result.filter(o => o.reference.toLowerCase().includes(filters.reference.toLowerCase()));
    }
    if (filters.agent) {
      result = result.filter(o => o.agentName?.toLowerCase().includes(filters.agent.toLowerCase()));
    }
    if (filters.dateFrom) {
      result = result.filter(o => new Date(o.createdAt) >= new Date(filters.dateFrom));
    }
    if (filters.dateTo) {
      result = result.filter(o => new Date(o.createdAt) <= new Date(filters.dateTo));
    }

    // Sorting
    result.sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      if (aVal > bVal) comparison = 1;

      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });

    return result;
  }, [orders, filters, sortConfig]);

  const handleSort = (key: keyof Order) => {
    setSortConfig(current => ({
      key,
      direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const exportToCSV = () => {
    const headers = ['Reference', 'Customer', 'Status', 'Total XAF', 'Agent', 'Created At'];
    const rows = filteredAndSortedOrders.map(order => [
      order.reference,
      order.customerPhone,
      order.status,
      order.totalXaf,
      order.agentName || 'Unassigned',
      new Date(order.createdAt).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `gasbot-transactions-${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Transactions & Orders</h2>
          <p className="text-sm text-slate-400">Real-time order monitoring and export</p>
        </div>
        <button
          onClick={exportToCSV}
          className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium flex items-center gap-2 transition"
        >
          Export to CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
        >
          <option value="">All Statuses</option>
          <option value="CASH_ACKNOWLEDGED">Cash Acknowledged</option>
          <option value="AGENT_ASSIGNED">Agent Assigned</option>
          <option value="EN_ROUTE">En Route</option>
          <option value="DELIVERED">Delivered</option>
        </select>

        <input
          type="text"
          placeholder="Search reference..."
          value={filters.reference}
          onChange={(e) => setFilters({ ...filters, reference: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
        />

        <input
          type="text"
          placeholder="Agent name..."
          value={filters.agent}
          onChange={(e) => setFilters({ ...filters, agent: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
        />

        <input
          type="date"
          value={filters.dateFrom}
          onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={filters.dateTo}
          onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
          className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800 text-slate-400">
            <tr>
              {[
                { label: 'Reference', key: 'reference' as const },
                { label: 'Customer', key: 'customerPhone' as const },
                { label: 'Status', key: 'status' as const },
                { label: 'Total (XAF)', key: 'totalXaf' as const },
                { label: 'Agent', key: 'agentName' as const },
                { label: 'Created', key: 'createdAt' as const },
              ].map(({ label, key }) => (
                <th
                  key={key}
                  onClick={() => handleSort(key)}
                  className="px-4 py-3 text-left font-medium cursor-pointer hover:text-white select-none"
                >
                  {label} {sortConfig.key === key && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {filteredAndSortedOrders.length > 0 ? (
              filteredAndSortedOrders.map((order) => (
                <tr key={order.id} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-medium text-emerald-400">{order.reference}</td>
                  <td className="px-4 py-3">{order.customerPhone}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs bg-slate-700">{order.status}</span>
                  </td>
                  <td className="px-4 py-3 font-mono">{order.totalXaf.toLocaleString()}</td>
                  <td className="px-4 py-3">{order.agentName || <span className="text-slate-500">Unassigned</span>}</td>
                  <td className="px-4 py-3 text-slate-400">{new Date(order.createdAt).toLocaleString()}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">No orders match current filters</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-xs text-slate-500 text-right">
        Showing {filteredAndSortedOrders.length} of {orders.length} orders
      </div>
    </div>
  );
};

export default TransactionsTable;
