import React from 'react';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface ProcessingPopupProps {
  isOpen: boolean;
  status: 'processing' | 'success' | 'error';
  message: string;
  onClose?: () => void;
}

export function ProcessingPopup({ isOpen, status, message, onClose }: ProcessingPopupProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-sm w-full mx-4 transform transition-all animate-in fade-in zoom-in duration-200">
        <div className="flex flex-col items-center text-center space-y-4">
          {status === 'processing' && (
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-100 rounded-full animate-ping opacity-25"></div>
              <div className="relative bg-indigo-50 p-4 rounded-full">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              </div>
            </div>
          )}
          
          {status === 'success' && (
            <div className="bg-emerald-50 p-4 rounded-full">
              <svg className="w-8 h-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-50 p-4 rounded-full">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          )}

          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {status === 'processing' ? 'Elaborazione...' : status === 'success' ? 'Completato!' : 'Errore'}
            </h3>
            <p className="text-sm text-slate-500 mt-1">{message}</p>
          </div>

          {status !== 'processing' && onClose && (
            <button
              onClick={onClose}
              className="mt-2 px-6 py-2 bg-slate-900 text-white text-sm font-medium rounded-full hover:bg-slate-800 transition-colors"
            >
              Chiudi
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
