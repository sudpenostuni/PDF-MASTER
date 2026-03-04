import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  arrayMove, 
  SortableContext, 
  sortableKeyboardCoordinates, 
  rectSortingStrategy 
} from '@dnd-kit/sortable';
import { pdfjs } from 'react-pdf';
import { v4 as uuidv4 } from 'uuid';
import { Plus, FileUp, Download, FilePlus, Trash, Scissors } from 'lucide-react';

import { loadPDF, loadPDFFromBytes, generateMergedPDF, splitPDFPages, type PageItem, type PDFFile } from '@/lib/pdf-utils';
import { SortablePage } from '@/components/SortablePage';
import { PageThumbnail } from '@/components/PageThumbnail';
import { ProcessingPopup } from '@/components/ProcessingPopup';
import { InsertPageModal } from '@/components/InsertPageModal';
import { SplitPageModal } from '@/components/SplitPageModal';
import { cn } from '@/lib/utils';
import { SplitConfig } from '@/lib/pdf-utils';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export default function PDFEditor() {
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [mergedPdfForSplit, setMergedPdfForSplit] = useState<Uint8Array | null>(null);
  
  // Popup State
  const [popupState, setPopupState] = useState<{
    isOpen: boolean;
    status: 'processing' | 'success' | 'error';
    message: string;
  }>({
    isOpen: false,
    status: 'processing',
    message: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: `Loading ${acceptedFiles.length} file(s)...`,
    });

    try {
      const newFiles: PDFFile[] = [];
      const newPages: PageItem[] = [];

      for (const file of acceptedFiles) {
        const pdfFile = await loadPDF(file);
        newFiles.push(pdfFile);
        
        // Create page items for this file
        for (let i = 0; i < pdfFile.pageCount; i++) {
          newPages.push({
            id: uuidv4(),
            fileId: pdfFile.id,
            pageIndex: i,
            rotation: 0,
          });
        }
      }

      setFiles(prev => [...prev, ...newFiles]);
      setPages(prev => [...prev, ...newPages]);
      
      setPopupState(prev => ({ ...prev, isOpen: false }));
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Failed to load PDF files. Please try again.',
      });
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] } as any, // Cast to any to avoid strict type check issues with DropzoneOptions
  });

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setPages((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }

    setActiveId(null);
  };

  const handleRotate = (id: string) => {
    setPages(items => items.map(item => {
      if (item.id === id) {
        return { ...item, rotation: (item.rotation + 90) % 360 };
      }
      return item;
    }));
  };

  const handleRemove = (id: string) => {
    setPages(items => items.filter(item => item.id !== id));
  };

  const handleDuplicate = (id: string) => {
    const index = pages.findIndex(p => p.id === id);
    if (index === -1) return;

    const pageToDuplicate = pages[index];
    const newPage: PageItem = {
      ...pageToDuplicate,
      id: uuidv4(),
    };

    setPages(items => [
      ...items.slice(0, index + 1),
      newPage,
      ...items.slice(index + 1)
    ]);
  };

  const handleAddBlankPage = () => {
    setIsInsertModalOpen(true);
  };

  const confirmAddBlankPage = (position: number) => {
    const newPage: PageItem = {
      id: uuidv4(),
      fileId: 'blank',
      pageIndex: -1,
      rotation: 0,
      isBlank: true,
    };

    // Position is 1-based, so subtract 1 for index
    const insertIndex = Math.max(0, Math.min(pages.length, position - 1));

    setPages(items => [
      ...items.slice(0, insertIndex),
      newPage,
      ...items.slice(insertIndex)
    ]);
  };

  const handleClearAll = () => {
    if (confirm('Are you sure you want to clear all pages?')) {
      setFiles([]);
      setPages([]);
    }
  };

  const handleDownload = async () => {
    if (pages.length === 0) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Generating your new PDF...',
    });

    try {
      const mergedPdfBytes = await generateMergedPDF(files, pages);
      
      // Create blob and download
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `merged-document-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'PDF downloaded successfully!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Failed to generate PDF.',
      });
    }
  };

  const handleSplitPages = async () => {
    if (pages.length === 0) return;
    
    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Preparing preview...',
    });

    try {
      // Generate current state as a PDF for the preview
      const currentPdfBytes = await generateMergedPDF(files, pages);
      setMergedPdfForSplit(currentPdfBytes);
      setPopupState(prev => ({ ...prev, isOpen: false }));
      setIsSplitModalOpen(true);
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Failed to prepare split preview.',
      });
    }
  };

  const confirmSplitPages = async (config?: SplitConfig) => {
    if (!mergedPdfForSplit) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Splitting pages...',
    });

    try {
      // Split the pages using the generated PDF and config
      const splitPdfBytes = await splitPDFPages(mergedPdfForSplit, config);
      
      // Load as new file
      const newFile = await loadPDFFromBytes(splitPdfBytes.buffer, 'Split_Document.pdf');
      
      // Reset workspace with new file
      const newPages: PageItem[] = [];
      for (let i = 0; i < newFile.pageCount; i++) {
        newPages.push({
          id: uuidv4(),
          fileId: newFile.id,
          pageIndex: i,
          rotation: 0,
        });
      }

      setFiles([newFile]);
      setPages(newPages);
      setMergedPdfForSplit(null);

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'Pages split successfully!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Failed to split pages.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <FileUp className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">PDF Master</h1>
          </div>
          
          <div className="flex items-center gap-3">
             <button
              onClick={handleClearAll}
              disabled={pages.length === 0}
              className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash className="w-4 h-4" />
              <span className="hidden sm:inline">Clear All</span>
            </button>
            <div className="h-6 w-px bg-slate-200 mx-1" />
            <button
              onClick={handleSplitPages}
              disabled={pages.length === 0}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title="Split all pages into two vertical halves"
            >
              <Scissors className="w-4 h-4" />
              <span className="hidden sm:inline">Split Pages</span>
            </button>
            <button
              onClick={handleAddBlankPage}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-2 shadow-sm"
            >
              <FilePlus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Blank Page</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={pages.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export PDF</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* Empty State / Dropzone */}
        {pages.length === 0 ? (
          <div 
            {...getRootProps()} 
            className={cn(
              "h-[60vh] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-12 transition-all cursor-pointer",
              isDragActive 
                ? "border-indigo-500 bg-indigo-50/50" 
                : "border-slate-300 hover:border-indigo-400 hover:bg-slate-50"
            )}
          >
            <input {...getInputProps()} />
            <div className="w-20 h-20 bg-indigo-100 rounded-full flex items-center justify-center mb-6">
              <FileUp className="w-10 h-10 text-indigo-600" />
            </div>
            <h3 className="text-2xl font-semibold text-slate-900 mb-2">
              Drop your PDF files here
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Upload multiple files to merge, reorder, rotate, or add blank pages.
              Everything happens in your browser.
            </p>
            <button className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl shadow-md hover:bg-indigo-700 transition-colors">
              Select PDF Files
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Toolbar / Dropzone Mini */}
            <div 
              {...getRootProps()} 
              className={cn(
                "border-2 border-dashed rounded-xl p-6 flex items-center justify-center gap-4 cursor-pointer transition-colors",
                isDragActive ? "border-indigo-500 bg-indigo-50" : "border-slate-200 hover:border-indigo-300 bg-white"
              )}
            >
              <input {...getInputProps()} />
              <Plus className="w-5 h-5 text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                Drag more files here or click to add
              </span>
            </div>

            {/* Grid */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
                  {pages.map((page) => (
                    <SortablePage
                      key={page.id}
                      page={page}
                      file={files.find(f => f.id === page.fileId)}
                      onRotate={handleRotate}
                      onRemove={handleRemove}
                      onDuplicate={handleDuplicate}
                    />
                  ))}
                </div>
              </SortableContext>
              
              <DragOverlay>
                {activeId ? (
                  <div className="opacity-80">
                    <PageThumbnail
                      page={pages.find(p => p.id === activeId)!}
                      file={files.find(f => f.id === pages.find(p => p.id === activeId)!.fileId)}
                      isDragging
                    />
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}
      </main>

      <ProcessingPopup 
        isOpen={popupState.isOpen}
        status={popupState.status}
        message={popupState.message}
        onClose={() => setPopupState(prev => ({ ...prev, isOpen: false }))}
      />

      <InsertPageModal
        isOpen={isInsertModalOpen}
        onClose={() => setIsInsertModalOpen(false)}
        onConfirm={confirmAddBlankPage}
        maxPages={pages.length}
      />

      <SplitPageModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        onConfirm={confirmSplitPages}
        pdfBytes={mergedPdfForSplit}
      />
    </div>
  );
}
