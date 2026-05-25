import React, { useState } from 'react';
import { GasCylinderType, Zone } from '../types';

const ProductCatalogManager: React.FC = () => {
  const [cylinders, setCylinders] = useState<GasCylinderType[]>([
    { id: 'gc-1', name: 'Standard 6kg', sizeKg: 6, basePriceXaf: 4500 },
    { id: 'gc-2', name: 'Standard 12kg', sizeKg: 12, basePriceXaf: 8500 },
    { id: 'gc-3', name: 'Commercial 25kg', sizeKg: 25, basePriceXaf: 16500 },
  ]);

  const [zones, setZones] = useState<Zone[]>([
    {
      id: 'zone-1',
      name: 'Yaoundé Central',
      polygon: [
        { lat: 3.86, lng: 11.50 },
        { lat: 3.84, lng: 11.52 },
        { lat: 3.82, lng: 11.49 },
      ],
    },
  ]);

  const [newCylinder, setNewCylinder] = useState({ name: '', sizeKg: 12, basePriceXaf: 8500 });
  const [newZoneName, setNewZoneName] = useState('');

  const addCylinder = () => {
    if (!newCylinder.name) return;
    const cylinder: GasCylinderType = {
      id: 'gc-' + Date.now(),
      ...newCylinder,
    };
    setCylinders([...cylinders, cylinder]);
    setNewCylinder({ name: '', sizeKg: 12, basePriceXaf: 8500 });
  };

  const deleteCylinder = (id: string) => {
    setCylinders(cylinders.filter(c => c.id !== id));
  };

  const updatePrice = (id: string, newPrice: number) => {
    setCylinders(cylinders.map(c => c.id === id ? { ...c, basePriceXaf: newPrice } : c));
  };

  const addZone = () => {
    if (!newZoneName) return;
    const zone: Zone = {
      id: 'zone-' + Date.now(),
      name: newZoneName,
      polygon: [
        { lat: 3.85, lng: 11.51 },
        { lat: 3.83, lng: 11.53 },
        { lat: 3.81, lng: 11.50 },
      ],
    };
    setZones([...zones, zone]);
    setNewZoneName('');
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Product Catalog</h2>
        <p className="text-slate-400 text-sm">Manage gas cylinder SKUs, pricing, and delivery zones</p>
      </div>

      {/* Gas Cylinders */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="font-semibold mb-4 flex items-center gap-2">Gas Cylinder Types</h3>
        
        <div className="grid gap-3 mb-6">
          {cylinders.map((cyl) => (
            <div key={cyl.id} className="flex items-center justify-between bg-slate-800 px-4 py-3 rounded-xl">
              <div>
                <div className="font-medium">{cyl.name}</div>
                <div className="text-xs text-slate-400">{cyl.sizeKg}kg cylinder</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm">
                  <input
                    type="number"
                    value={cyl.basePriceXaf}
                    onChange={(e) => updatePrice(cyl.id, parseInt(e.target.value) || 0)}
                    className="w-24 bg-slate-700 border border-slate-600 rounded px-3 py-1 text-right font-mono"
                  />
                  <span className="text-slate-400">XAF</span>
                </div>
                <button onClick={() => deleteCylinder(cyl.id)} className="text-red-400 hover:text-red-500 text-sm px-2">Remove</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Cylinder name (e.g. 6kg Standard)"
            value={newCylinder.name}
            onChange={(e) => setNewCylinder({ ...newCylinder, name: e.target.value })}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
          />
          <input
            type="number"
            value={newCylinder.sizeKg}
            onChange={(e) => setNewCylinder({ ...newCylinder, sizeKg: parseInt(e.target.value) || 0 })}
            className="w-20 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={newCylinder.basePriceXaf}
            onChange={(e) => setNewCylinder({ ...newCylinder, basePriceXaf: parseInt(e.target.value) || 0 })}
            className="w-28 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm"
          />
          <button onClick={addCylinder} className="px-6 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium">Add</button>
        </div>
      </div>

      {/* Zones */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h3 className="font-semibold mb-4">Delivery Zones</h3>
        
        <div className="space-y-3 mb-6">
          {zones.map((zone) => (
            <div key={zone.id} className="bg-slate-800 p-4 rounded-xl">
              <div className="font-medium">{zone.name}</div>
              <div className="text-xs text-slate-400 mt-1">
                Polygon: {zone.polygon.length} points
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Zone name (e.g. Yaoundé East)"
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm"
          />
          <button onClick={addZone} className="px-6 bg-emerald-600 hover:bg-emerald-500 rounded-xl text-sm font-medium">Add Zone</button>
        </div>
        <p className="text-xs text-slate-500 mt-2">In production: Use a map drawing tool to define precise polygon coordinates.</p>
      </div>
    </div>
  );
};

export default ProductCatalogManager;
