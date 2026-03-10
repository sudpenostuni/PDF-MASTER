import React, { useState } from 'react';
import { X, FileDown, Image as ImageIcon, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export type CompressionMode = 'original' | 'compress' | 'grayscale' | 'bw';

interface CompressionModalProps {
  isOpen: boolean;
  fileName: string;
  fileSize: number;
  onConfirm: (mode: CompressionMode) => void;
  onCancel: () => void;
}

export function CompressionModal({ isOpen, fileName, fileSize, onConfirm, onCancel }: CompressionModalProps) {
  const [selectedMode, setSelectedMode] = useState<CompressionMode>('compress');

  if (!isOpen) return null;

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-semibold text-slate-800">File di grandi dimensioni</h3>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6">
          <p className="text-sm text-slate-600 mb-4">
            Il file <strong>{fileName}</strong> ({formatSize(fileSize)}) supera i 10 MB. 
            L'elaborazione potrebbe essere lenta. Scegli un'opzione di compressione prima del caricamento:
          </p>

          <div className="space-y-3">
            <label className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              selectedMode === 'compress' ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
            )}>
              <input 
                type="radio" 
                name="compression" 
                value="compress" 
                checked={selectedMode === 'compress'}
                onChange={() => setSelectedMode('compress')}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-800 flex items-center gap-2">
                  <FileDown className="w-4 h-4 text-indigo-600" />
                  Comprimi PDF
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Riduci la risoluzione per alleggerire il file mantenendo i colori.</div>
              </div>
            </label>

            <label className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              selectedMode === 'grayscale' ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
            )}>
              <input 
                type="radio" 
                name="compression" 
                value="grayscale" 
                checked={selectedMode === 'grayscale'}
                onChange={() => setSelectedMode('grayscale')}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-800 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-slate-600" />
                  Scala di grigi
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Converti il documento in scala di grigi.</div>
              </div>
            </label>

            <label className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              selectedMode === 'bw' ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
            )}>
              <input 
                type="radio" 
                name="compression" 
                value="bw" 
                checked={selectedMode === 'bw'}
                onChange={() => setSelectedMode('bw')}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-800 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-800" />
                  Bianco e nero
                </div>
                <div className="text-xs text-slate-500 mt-0.5">Massima compressione, ideale per documenti di solo testo.</div>
              </div>
            </label>

            <label className={cn(
              "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all",
              selectedMode === 'original' ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300"
            )}>
              <input 
                type="radio" 
                name="compression" 
                value="original" 
                checked={selectedMode === 'original'}
                onChange={() => setSelectedMode('original')}
                className="mt-1"
              />
              <div>
                <div className="font-medium text-slate-800">Carica originale</div>
                <div className="text-xs text-slate-500 mt-0.5">Nessuna compressione (potrebbe rallentare l'app).</div>
              </div>
            </label>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={() => onConfirm(selectedMode)}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
          >
            Continua
          </button>
        </div>
      </div>
    </div>
  );
}
