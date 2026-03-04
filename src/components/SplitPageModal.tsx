import React, { useState, useRef, useEffect } from 'react';
import { Document, Page } from 'react-pdf';
import { X, MousePointer2 } from 'lucide-react';
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
        newW = Math.max(20, startRect.current.w + dx);
        newH = Math.max(20, startRect.current.h + dy);
      }

      // Constrain to container
      newX = Math.max(0, Math.min(newX, container.width - newW));
      newY = Math.max(0, Math.min(newY, container.height - newH));

      // Convert back to Normalized PDF Coordinates (Bottom-Left Origin)
      // DOM: Top-Left (0,0) -> Bottom-Right (w,h)
      // PDF: Bottom-Left (0,0) -> Top-Right (1,1)
      
      // x is same (0 to 1)
      const normX = newX / container.width;
      const normW = newW / container.width;
      
      // y needs flip. 
      // DOM y=0 is PDF y=1. DOM y=h is PDF y=0.
      // The box bottom in DOM is y + h. In PDF that's the bottom edge.
      // PDF y (bottom edge) = 1 - (domY + domH) / domHeight
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

  // Render position (DOM coordinates)
  // PDF y is from bottom. We need top.
  // top = 1 - y - height
  const top = (1 - rect.y - rect.height) * 100;
  const left = rect.x * 100;
  const width = rect.width * 100;
  const height = rect.height * 100;

  return (
    <div
      ref={boxRef}
      onMouseDown={(e) => handleMouseDown(e, false)}
      className={cn(
        "absolute border-2 cursor-move flex items-center justify-center text-white font-bold text-xl shadow-sm select-none",
        isDragging ? "z-20 opacity-90" : "z-10 opacity-60 hover:opacity-80"
      )}
      style={{
        top: `${top}%`,
        left: `${left}%`,
        width: `${width}%`,
        height: `${height}%`,
        backgroundColor: color,
        borderColor: 'white',
      }}
    >
      {id}
      {/* Resize Handle */}
      <div
        onMouseDown={(e) => handleMouseDown(e, true)}
        className="absolute bottom-0 right-0 w-6 h-6 bg-white border border-slate-300 cursor-nwse-resize rounded-tl-md"
      />
    </div>
  );
}

export function SplitPageModal({ isOpen, onClose, onConfirm, pdfBytes }: SplitPageModalProps) {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Default: Left half and Right half
  const [rect1, setRect1] = useState<NormalizedRect>({ x: 0, y: 0, width: 0.5, height: 1 });
  const [rect2, setRect2] = useState<NormalizedRect>({ x: 0.5, y: 0, width: 0.5, height: 1 });

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (mode === 'auto') {
      onConfirm();
    } else {
      onConfirm({ rect1, rect2 });
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl p-6 max-w-4xl w-full mx-4 h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 shrink-0">
          <h3 className="text-lg font-semibold text-slate-900">Split Pages</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-4 mb-6 shrink-0">
          <button
            onClick={() => setMode('auto')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors border",
              mode === 'auto' 
                ? "bg-indigo-50 border-indigo-200 text-indigo-700" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            Auto Split (Half & Half)
          </button>
          <button
            onClick={() => setMode('manual')}
            className={cn(
              "flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors border",
              mode === 'manual' 
                ? "bg-indigo-50 border-indigo-200 text-indigo-700" 
                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
            )}
          >
            Manual Split
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-slate-100 rounded-xl border border-slate-200 relative flex items-center justify-center p-4">
          {mode === 'auto' ? (
            <div className="text-center max-w-md">
              <div className="flex justify-center mb-4 space-x-1">
                <div className="w-16 h-24 bg-white border border-slate-300 shadow-sm"></div>
                <div className="w-16 h-24 bg-white border border-slate-300 shadow-sm"></div>
              </div>
              <p className="text-slate-600">
                Automatically splits every page into two equal vertical halves. 
                Ideal for scanned books where two pages are on one sheet.
              </p>
            </div>
          ) : (
            <div className="relative h-full w-full flex items-center justify-center">
              {pdfBytes && (
                <div className="relative shadow-lg inline-block max-h-full max-w-full" ref={containerRef}>
                  <Document file={pdfBytes} loading={<div className="animate-pulse w-64 h-96 bg-slate-200" />}>
                    <Page 
                      pageIndex={0} 
                      height={600}
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                      className="max-h-full max-w-full object-contain"
                    />
                  </Document>
                  
                  {/* Overlay Layer */}
                  <div className="absolute inset-0 z-10">
                    <DraggableBox 
                      id={1} 
                      rect={rect1} 
                      color="rgba(59, 130, 246, 0.5)" // Blue
                      containerRef={containerRef}
                      onChange={setRect1}
                    />
                    <DraggableBox 
                      id={2} 
                      rect={rect2} 
                      color="rgba(16, 185, 129, 0.5)" // Green
                      containerRef={containerRef}
                      onChange={setRect2}
                    />
                  </div>
                </div>
              )}
              {!pdfBytes && <p className="text-slate-400">No PDF loaded</p>}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Split Pages
          </button>
        </div>
      </div>
    </div>
  );
}
