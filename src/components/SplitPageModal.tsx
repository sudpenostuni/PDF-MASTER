import React, { useState, useRef, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NormalizedRect, SplitConfig } from '@/lib/pdf-utils';

interface SplitPageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (config?: SplitConfig) => void;
  pdfBytes: Uint8Array | null;
}

interface DraggableBoxProps {
  id: number;
  rect: NormalizedRect;
  color: string;
  containerRef: React.RefObject<HTMLDivElement>;
  onChange: (rect: NormalizedRect) => void;
}

function DraggableBox({ id, rect, color, containerRef, onChange }: DraggableBoxProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const startPos = useRef({ x: 0, y: 0 });
  const startRect = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const handleMouseDown = (e: React.MouseEvent, resize: boolean = false) => {
    e.stopPropagation();
    e.preventDefault(); // Prevent text selection
    if (!containerRef.current) return;
    
    setIsDragging(!resize);
    setIsResizing(resize);
    startPos.current = { x: e.clientX, y: e.clientY };
    
    const container = containerRef.current.getBoundingClientRect();
    startRect.current = {
      x: rect.x * container.width,
      y: (1 - rect.y - rect.height) * container.height, // Convert PDF bottom-left origin to Top-Left for DOM
      w: rect.width * container.width,
      h: rect.height * container.height
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging && !isResizing) return;
      if (!containerRef.current) return;

      const container = containerRef.current.getBoundingClientRect();
      const dx = e.clientX - startPos.current.x;
      const dy = e.clientY - startPos.current.y;

      let newX = startRect.current.x;
      let newY = startRect.current.y;
      let newW = startRect.current.w;
      let newH = startRect.current.h;

      if (isDragging) {
        newX += dx;
        newY += dy;
      } else if (isResizing) {
        newW = Math.max(40, startRect.current.w + dx);
        newH = Math.max(40, startRect.current.h + dy);
      }

      // Constrain to container
      newX = Math.max(0, Math.min(newX, container.width - newW));
      newY = Math.max(0, Math.min(newY, container.height - newH));

      // Convert back to Normalized PDF Coordinates (Bottom-Left Origin)
      const normX = newX / container.width;
      const normW = newW / container.width;
      
      const normH = newH / container.height;
      const normY = 1 - (newY / container.height) - normH;

      onChange({
        x: normX,
        y: normY,
        width: normW,
        height: normH
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, containerRef, onChange]);

  const top = (1 - rect.y - rect.height) * 100;
  const left = rect.x * 100;
  const width = rect.width * 100;
  const height = rect.height * 100;

  return (
    <div
      ref={boxRef}
      onMouseDown={(e) => handleMouseDown(e, false)}
      className={cn(
        "absolute border-4 cursor-move flex items-center justify-center text-white font-bold text-3xl shadow-xl select-none transition-all",
        isDragging ? "z-20 opacity-90 scale-[1.01]" : "z-10 opacity-60 hover:opacity-80"
      )}
      style={{
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        backgroundColor: color,
        borderColor: 'white',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06), 0 0 0 1px rgba(0,0,0,0.1)'
      }}
    >
      <span className="drop-shadow-lg filter">{id}</span>
      
      {/* Resize Handle - Bottom Right */}
      <div
        onMouseDown={(e) => handleMouseDown(e, true)}
        className="absolute -bottom-4 -right-4 w-8 h-8 bg-white border-4 cursor-nwse-resize rounded-full shadow-lg flex items-center justify-center hover:scale-110 transition-transform z-30"
        style={{ borderColor: color }}
      >
        <div className="w-2 h-2 bg-slate-400 rounded-full" />
      </div>
    </div>
  );
}

export function SplitPageModal({ isOpen, onClose, onConfirm, pdfBytes }: SplitPageModalProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState<number>(0);
  const [pageIndex, setPageIndex] = useState<number>(0);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [scale, setScale] = useState<number>(1.0);
  
  const [rect1, setRect1] = useState<NormalizedRect>({ x: 0, y: 0, width: 0.5, height: 1 });
  const [rect2, setRect2] = useState<NormalizedRect>({ x: 0.5, y: 0, width: 0.5, height: 1 });

  useEffect(() => {
    if (isOpen) {
      setPageIndex(0);
      setScale(1.0);
    }
  }, [isOpen, pdfBytes]);

  useEffect(() => {
    if (pdfBytes) {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPdfUrl(null);
    }
  }, [pdfBytes]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (mode === 'auto') {
      onConfirm();
    } else {
      onConfirm({ rect1, rect2 });
    }
    onClose();
  };

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col animate-in fade-in duration-200">
      {/* Top Bar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center justify-between shadow-sm z-30 shrink-0">
        <div className="flex items-center gap-6">
          <h3 className="text-xl font-bold text-slate-900">Split Pages</h3>
          
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setMode('auto')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                mode === 'auto' 
                  ? "bg-white text-indigo-700 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Auto Split
            </button>
            <button
              onClick={() => setMode('manual')}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                mode === 'manual' 
                  ? "bg-white text-indigo-700 shadow-sm" 
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              Manual Split
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {mode === 'manual' && numPages > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
                disabled={pageIndex <= 0}
                className="p-1.5 rounded-md hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"
              >
                <ChevronLeft className="w-5 h-5 text-slate-600" />
              </button>
              <span className="text-sm font-medium text-slate-700 w-[100px] text-center font-mono">
                {pageIndex + 1} / {numPages}
              </span>
              <button
                onClick={() => setPageIndex(prev => Math.min(numPages - 1, prev + 1))}
                disabled={pageIndex >= numPages - 1}
                className="p-1.5 rounded-md hover:bg-white hover:shadow-sm disabled:opacity-30 transition-all"
              >
                <ChevronRight className="w-5 h-5 text-slate-600" />
              </button>
            </div>
          )}
          
          <div className="h-8 w-px bg-slate-200" />
          
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden relative flex flex-col">
        {/* Toolbar for Zoom (Manual Mode) */}
        {mode === 'manual' && (
          <div className="absolute top-4 right-8 z-20 flex flex-col gap-2">
            <div className="bg-white rounded-lg shadow-md border border-slate-200 p-1 flex flex-col gap-1">
              <button 
                onClick={() => setScale(s => Math.min(3, s + 0.1))}
                className="p-2 hover:bg-slate-50 rounded text-slate-600"
                title="Zoom In"
              >
                <ZoomIn className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setScale(s => Math.max(0.5, s - 0.1))}
                className="p-2 hover:bg-slate-50 rounded text-slate-600"
                title="Zoom Out"
              >
                <ZoomOut className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setScale(1.0)}
                className="p-2 hover:bg-slate-50 rounded text-slate-600"
                title="Reset Zoom"
              >
                <Maximize className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto bg-slate-100 p-8 flex justify-center">
          {mode === 'auto' ? (
            <div className="flex flex-col items-center justify-center h-full max-w-lg text-center">
              <div className="flex justify-center mb-8 space-x-2">
                <div className="w-32 h-48 bg-white border-2 border-dashed border-indigo-300 shadow-sm rounded-l-lg flex items-center justify-center">
                  <span className="text-indigo-300 font-bold text-xl">1</span>
                </div>
                <div className="w-32 h-48 bg-white border-2 border-dashed border-indigo-300 shadow-sm rounded-r-lg flex items-center justify-center">
                  <span className="text-indigo-300 font-bold text-xl">2</span>
                </div>
              </div>
              <h4 className="text-xl font-semibold text-slate-900 mb-2">Auto Split Mode</h4>
              <p className="text-slate-600 text-lg">
                Automatically splits every page into two equal vertical halves. 
                <br />
                Ideal for scanned books where two pages are on one sheet.
              </p>
            </div>
          ) : (
            <div className="relative min-h-min min-w-min">
              {pdfUrl && (
                <div className="relative shadow-2xl ring-1 ring-black/5" ref={containerRef}>
                  <Document 
                    file={pdfUrl} 
                    onLoadSuccess={onDocumentLoadSuccess}
                    loading={
                      <div className="flex items-center justify-center h-[600px] w-[400px] bg-white rounded-lg">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                      </div>
                    }
                  >
                    <Page 
                      pageIndex={pageIndex} 
                      scale={scale}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="bg-white"
                    />
                  </Document>
                  
                  {/* Overlay Layer */}
                  <div className="absolute inset-0 z-10 overflow-hidden">
                    <DraggableBox 
                      id={1} 
                      rect={rect1} 
                      color="rgba(59, 130, 246, 0.4)" // Blue
                      containerRef={containerRef}
                      onChange={setRect1}
                    />
                    <DraggableBox 
                      id={2} 
                      rect={rect2} 
                      color="rgba(16, 185, 129, 0.4)" // Green
                      containerRef={containerRef}
                      onChange={setRect2}
                    />
                  </div>
                </div>
              )}
              {!pdfUrl && <p className="text-slate-400 mt-20">No PDF loaded</p>}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="bg-white border-t border-slate-200 px-6 py-4 flex justify-between items-center shrink-0 z-30">
        <div className="text-sm text-slate-500">
          {mode === 'manual' ? 'Adjust the boxes to define the split areas.' : 'Standard center split.'}
        </div>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-sm transition-colors"
          >
            Split All Pages
          </button>
        </div>
      </div>
    </div>
  );
}
