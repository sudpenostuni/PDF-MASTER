import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface InsertPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (position: number) => void;
  maxPages: number;
}

export function InsertPageModal({ isOpen, onClose, onConfirm, maxPages }: InsertPageModalProps) {
  const [position, setPosition] = useState<number>(1);

  useEffect(() => {
    if (isOpen) {
      setPosition(maxPages + 1);
    }
  }, [isOpen, maxPages]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(position);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4 transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Add Blank Page</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label htmlFor="page-number" className="block text-sm font-medium text-slate-700 mb-2">
              Insert at Page Number
            </label>
            <input
              type="number"
              id="page-number"
              min={1}
              max={maxPages + 1}
              value={position}
              onChange={(e) => setPosition(Math.max(1, Math.min(maxPages + 1, parseInt(e.target.value) || 1)))}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-slate-500 mt-2">
              Enter a number between 1 and {maxPages + 1}
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
            >
              Add Page
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
