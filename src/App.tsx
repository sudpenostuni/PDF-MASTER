import React, { useState, useCallback, useRef } from 'react';
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
import { Plus, FileUp, Download, FilePlus, Trash, Columns, Book, LayoutGrid, BookOpen, SunMedium, CheckSquare, Square, Copy, Trash2 } from 'lucide-react';

import { loadPDF, loadPDFFromBytes, generateMergedPDF, splitPDFPages, reorderPagesForBooklet, lightenPages, compressPDF, processPages, createTwoUpPDF, type PageItem, type PDFFile } from '@/lib/pdf-utils';
import { SortablePage } from '@/components/SortablePage';
import { PageThumbnail } from '@/components/PageThumbnail';
import { ProcessingPopup } from '@/components/ProcessingPopup';
import { SplitPageModal } from '@/components/SplitPageModal';
import { CompressionModal, type CompressionMode } from '@/components/CompressionModal';
import { cn } from '@/lib/utils';
import { SplitConfig } from '@/lib/pdf-utils';
import { FileDown, Image as ImageIcon, FileText } from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type MenuItem = {
  label: string;
  icon?: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  divider?: boolean;
  shortcut?: string;
};

type Menu = {
  title: string;
  items: MenuItem[];
};

const MenuDropdown = ({ title, items, isOpen, onToggle, onMouseEnter, closeMenu }: { title: string, items: MenuItem[], isOpen: boolean, onToggle: () => void, onMouseEnter: () => void, closeMenu: () => void }) => {
  return (
    <div className="relative" onMouseEnter={onMouseEnter}>
      <button
        onClick={onToggle}
        className={cn(
          "px-3 py-1 text-sm rounded-md transition-colors",
          isOpen ? "bg-slate-200 text-slate-900" : "text-slate-700 hover:bg-slate-200"
        )}
      >
        {title}
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-0.5 w-64 bg-white border border-slate-200 rounded-md shadow-lg py-1 z-50">
          {items.map((item, idx) => {
            if (item.divider) {
              return <div key={idx} className="h-px bg-slate-200 my-1" />;
            }
            return (
              <button
                key={idx}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!item.disabled && item.onClick) {
                    item.onClick();
                    closeMenu();
                  }
                }}
                disabled={item.disabled}
                className={cn(
                  "w-full text-left px-4 py-1.5 text-sm flex items-center justify-between",
                  item.disabled ? "text-slate-400 cursor-not-allowed" : "text-slate-700 hover:bg-indigo-50 hover:text-indigo-700"
                )}
              >
                <div className="flex items-center gap-2">
                  {item.icon ? <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span> : <span className="w-4 h-4" />}
                  <span>{item.label}</span>
                </div>
                {item.shortcut && <span className="text-xs text-slate-400">{item.shortcut}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MenuBar = ({ menus }: { menus: Menu[] }) => {
  const [openMenuIndex, setOpenMenuIndex] = React.useState<number | null>(null);
  const barRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenuIndex(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="flex items-center gap-1" ref={barRef}>
      {menus.map((menu, idx) => (
        <MenuDropdown
          key={idx}
          title={menu.title}
          items={menu.items}
          isOpen={openMenuIndex === idx}
          onToggle={() => setOpenMenuIndex(openMenuIndex === idx ? null : idx)}
          onMouseEnter={() => {
            if (openMenuIndex !== null && openMenuIndex !== idx) {
              setOpenMenuIndex(idx);
            }
          }}
          closeMenu={() => setOpenMenuIndex(null)}
        />
      ))}
    </div>
  );
};

export default function PDFEditor() {
  const [viewMode, setViewMode] = useState<'grid' | 'double'>('grid');
  const [showCover, setShowCover] = useState(true);
  const [files, setFiles] = useState<PDFFile[]>([]);
  const [pages, setPages] = useState<PageItem[]>([]);
  const [selectedPages, setSelectedPages] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [mergedPdfForSplit, setMergedPdfForSplit] = useState<Uint8Array | null>(null);
  const [insertAfterId, setInsertAfterId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [compressionModalState, setCompressionModalState] = useState<{
    isOpen: boolean;
    files: File[];
    largeFileDetails: { name: string; size: number } | null;
  }>({ isOpen: false, files: [], largeFileDetails: null });

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

  const processFiles = async (filesToProcess: File[], compressionMode?: CompressionMode) => {
    setPopupState({
      isOpen: true,
      status: 'processing',
      message: `Caricamento di ${filesToProcess.length} file...`,
    });

    try {
      const newFiles: PDFFile[] = [];
      const newPages: PageItem[] = [];

      for (let i = 0; i < filesToProcess.length; i++) {
        let file = filesToProcess[i];
        
        if (file.size > 10 * 1024 * 1024 && compressionMode && compressionMode !== 'original') {
          setPopupState({
            isOpen: true,
            status: 'processing',
            message: `Compressione ${file.name} in corso... (0%)`,
          });
          
          file = await compressPDF(file, compressionMode, (progress) => {
            setPopupState({
              isOpen: true,
              status: 'processing',
              message: `Compressione ${file.name} in corso... (${progress}%)`,
            });
          });
        }

        const pdfFile = await loadPDF(file);
        newFiles.push(pdfFile);
        
        // Create page items for this file
        for (let j = 0; j < pdfFile.pageCount; j++) {
          newPages.push({
            id: uuidv4(),
            fileId: pdfFile.id,
            pageIndex: j,
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
        message: 'Impossibile caricare i file PDF. Riprova.',
      });
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;

    const largeFiles = acceptedFiles.filter(f => f.size > 10 * 1024 * 1024);
    
    if (largeFiles.length > 0) {
      setCompressionModalState({
        isOpen: true,
        files: acceptedFiles,
        largeFileDetails: {
          name: largeFiles.length === 1 ? largeFiles[0].name : `${largeFiles.length} file`,
          size: largeFiles.reduce((acc, f) => acc + f.size, 0)
        }
      });
    } else {
      await processFiles(acceptedFiles);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] } as any,
    noClick: pages.length > 0, // Disable click to upload when pages exist
    noDrag: pages.length > 0, // Disable drag to upload when pages exist
  } as any);

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
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
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

  const handleInsertBlankPage = (id: string) => {
    const index = pages.findIndex(p => p.id === id);
    if (index === -1) return;

    const newPage: PageItem = {
      id: uuidv4(),
      fileId: 'blank',
      pageIndex: -1,
      rotation: 0,
      isBlank: true,
    };

    setPages(items => [
      ...items.slice(0, index + 1),
      newPage,
      ...items.slice(index + 1)
    ]);
  };

  const handleInsertFile = (id: string) => {
    setInsertAfterId(id);
    fileInputRef.current?.click();
  };

  const handleToggleSelection = (id: string) => {
    setSelectedPages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const processFileInput = async (fileList: FileList, compressionMode?: CompressionMode) => {
    const targetIndex = insertAfterId ? pages.findIndex(p => p.id === insertAfterId) : pages.length - 1;
    
    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Caricamento file...',
    });

    try {
      const newFiles: PDFFile[] = [];
      const newPages: PageItem[] = [];

      for (let i = 0; i < fileList.length; i++) {
        let file = fileList[i];
        if (file.type !== 'application/pdf') continue;

        if (file.size > 10 * 1024 * 1024 && compressionMode && compressionMode !== 'original') {
          setPopupState({
            isOpen: true,
            status: 'processing',
            message: `Compressione ${file.name} in corso... (0%)`,
          });
          
          file = await compressPDF(file, compressionMode, (progress) => {
            setPopupState({
              isOpen: true,
              status: 'processing',
              message: `Compressione ${file.name} in corso... (${progress}%)`,
            });
          });
        }

        const pdfFile = await loadPDF(file);
        newFiles.push(pdfFile);

        for (let j = 0; j < pdfFile.pageCount; j++) {
          newPages.push({
            id: uuidv4(),
            fileId: pdfFile.id,
            pageIndex: j,
            rotation: 0,
          });
        }
      }

      setFiles(prev => [...prev, ...newFiles]);
      
      // Insert new pages after the target page
      setPages(prev => {
        if (targetIndex === -1) {
          return [...prev, ...newPages];
        }
        return [
          ...prev.slice(0, targetIndex + 1),
          ...newPages,
          ...prev.slice(targetIndex + 1)
        ];
      });

      setPopupState({
        isOpen: true,
        status: 'success',
        message: `Aggiunte ${newPages.length} pagine.`,
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Impossibile caricare i file.',
      });
    } finally {
      setInsertAfterId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    
    const filesArray = Array.from(fileList);
    const largeFiles = filesArray.filter(f => f.size > 10 * 1024 * 1024);
    
    if (largeFiles.length > 0) {
      setCompressionModalState({
        isOpen: true,
        files: filesArray,
        largeFileDetails: {
          name: largeFiles.length === 1 ? largeFiles[0].name : `${largeFiles.length} file`,
          size: largeFiles.reduce((acc, f) => acc + f.size, 0)
        }
      });
    } else {
      await processFileInput(fileList);
    }
  };

  const handleClearAll = () => {
    if (confirm('Sei sicuro di voler cancellare tutte le pagine?')) {
      setFiles([]);
      setPages([]);
      setSelectedPages(new Set());
    }
  };

  const handleDownload = async () => {
    if (pages.length === 0) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Generazione del nuovo PDF...',
    });

    try {
      const pagesToExport = selectedPages.size > 0 
        ? pages.filter(p => selectedPages.has(p.id))
        : pages;

      const mergedPdfBytes = await generateMergedPDF(files, pagesToExport);
      
      // Determine filename
      let fileName = 'document';
      if (pagesToExport.length > 0) {
        const firstPage = pagesToExport[0];
        const firstFile = files.find(f => f.id === firstPage.fileId);
        if (firstFile) {
          fileName = firstFile.name.replace(/\.pdf$/i, '');
        }
      }

      // Create blob and download
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${fileName}-pdfmaster.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'PDF scaricato con successo!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Impossibile generare il PDF.',
      });
    }
  };

  const handleSplitPages = async () => {
    if (pages.length === 0) return;
    
    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Preparazione anteprima...',
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
        message: 'Impossibile preparare l\'anteprima di divisione.',
      });
    }
  };

  const confirmSplitPages = async (config?: SplitConfig) => {
    if (!mergedPdfForSplit) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Divisione pagine...',
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
      setSelectedPages(new Set());
      setMergedPdfForSplit(null);

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'Pagine divise con successo!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Impossibile dividere le pagine.',
      });
    }
  };

  const handleBookletReorder = () => {
    if (pages.length === 0) return;

    if (confirm('Questa operazione riorganizzerà le pagine per la stampa a opuscolo. Verranno aggiunte pagine vuote se necessario per arrivare a un multiplo di 4. Continuare?')) {
      const bookletPages = reorderPagesForBooklet(pages);
      setPages(bookletPages);
      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'Pagine riorganizzate per opuscolo!',
      });
    }
  };

  const handleLightenBackground = async () => {
    if (pages.length === 0) return;

    const pagesToProcess = selectedPages.size > 0 
      ? pages.filter(p => selectedPages.has(p.id))
      : pages;

    const msg = selectedPages.size > 0 
      ? `Vuoi schiarire lo sfondo delle ${selectedPages.size} pagine selezionate? Questa operazione rasterizzerà le pagine.`
      : `Vuoi schiarire lo sfondo di tutte le pagine? Questa operazione rasterizzerà le pagine.`;

    if (!confirm(msg)) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Schiarimento sfondo in corso... Potrebbe volerci un po\' di tempo.',
    });

    try {
      const processedPdfBytes = await lightenPages(files, pagesToProcess);
      
      const newFile = await loadPDFFromBytes(processedPdfBytes.buffer, 'Lightened_Document.pdf');
      
      const newPages: PageItem[] = [];
      for (let i = 0; i < newFile.pageCount; i++) {
        newPages.push({
          id: uuidv4(),
          fileId: newFile.id,
          pageIndex: i,
          rotation: 0,
        });
      }

      setFiles(prev => [...prev, newFile]);
      
      setPages(prev => {
        const next = [...prev];
        let newPageIndex = 0;
        for (let i = 0; i < next.length; i++) {
          if (pagesToProcess.find(p => p.id === next[i].id)) {
            next[i] = newPages[newPageIndex++];
          }
        }
        return next;
      });

      setSelectedPages(new Set());

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'Sfondo schiarito con successo!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Errore durante lo schiarimento dello sfondo.',
      });
    }
  };

  const handleTwoUp = async () => {
    if (pages.length === 0) return;

    const pagesToProcess = selectedPages.size > 0 
      ? pages.filter(p => selectedPages.has(p.id))
      : pages;

    const msg = selectedPages.size > 0 
      ? `Vuoi affiancare 2 copie per foglio delle ${selectedPages.size} pagine selezionate?`
      : `Vuoi affiancare 2 copie per foglio di tutte le pagine?`;

    if (!confirm(msg)) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Generazione pagine affiancate in corso...',
    });

    try {
      const processedPdfBytes = await createTwoUpPDF(files, pagesToProcess);
      
      const newFile = await loadPDFFromBytes(processedPdfBytes.buffer, '2Up_Document.pdf');
      
      const newPages: PageItem[] = [];
      for (let i = 0; i < newFile.pageCount; i++) {
        newPages.push({
          id: uuidv4(),
          fileId: newFile.id,
          pageIndex: i,
          rotation: 0,
        });
      }

      setFiles(prev => [...prev, newFile]);
      
      setPages(prev => {
        const next = [...prev];
        let newPageIndex = 0;
        for (let i = 0; i < next.length; i++) {
          if (pagesToProcess.find(p => p.id === next[i].id)) {
            next[i] = newPages[newPageIndex++];
          }
        }
        return next;
      });

      setSelectedPages(new Set());

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'Pagine affiancate con successo!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Errore durante l\'elaborazione delle pagine.',
      });
    }
  };

  const handleProcessPages = async (mode: 'compress' | 'grayscale' | 'bw') => {
    if (pages.length === 0) return;

    const pagesToProcess = selectedPages.size > 0 
      ? pages.filter(p => selectedPages.has(p.id))
      : pages;

    const modeNames = {
      compress: 'comprimere',
      grayscale: 'convertire in scala di grigi',
      bw: 'convertire in bianco e nero'
    };

    const msg = selectedPages.size > 0 
      ? `Vuoi ${modeNames[mode]} le ${selectedPages.size} pagine selezionate? Questa operazione rasterizzerà le pagine.`
      : `Vuoi ${modeNames[mode]} tutte le pagine? Questa operazione rasterizzerà le pagine.`;

    if (!confirm(msg)) return;

    setPopupState({
      isOpen: true,
      status: 'processing',
      message: 'Elaborazione in corso... (0%)',
    });

    try {
      const processedPdfBytes = await processPages(files, pagesToProcess, mode, (progress) => {
        setPopupState({
          isOpen: true,
          status: 'processing',
          message: `Elaborazione in corso... (${progress}%)`,
        });
      });
      
      const newFile = await loadPDFFromBytes(processedPdfBytes.buffer, `Processed_${mode}.pdf`);
      
      const newPages: PageItem[] = [];
      for (let i = 0; i < newFile.pageCount; i++) {
        newPages.push({
          id: uuidv4(),
          fileId: newFile.id,
          pageIndex: i,
          rotation: 0,
        });
      }

      setFiles(prev => [...prev, newFile]);
      
      setPages(prev => {
        const next = [...prev];
        let newPageIndex = 0;
        for (let i = 0; i < next.length; i++) {
          if (pagesToProcess.find(p => p.id === next[i].id)) {
            next[i] = newPages[newPageIndex++];
          }
        }
        return next;
      });

      setSelectedPages(new Set());

      setPopupState({
        isOpen: true,
        status: 'success',
        message: 'Elaborazione completata con successo!',
      });
    } catch (error) {
      console.error(error);
      setPopupState({
        isOpen: true,
        status: 'error',
        message: 'Errore durante l\'elaborazione delle pagine.',
      });
    }
  };

  const handleSelectAll = () => {
    setSelectedPages(new Set(pages.map(p => p.id)));
  };

  const handleDeselectAll = () => {
    setSelectedPages(new Set());
  };

  const handleRemoveSelected = () => {
    if (selectedPages.size === 0) return;
    if (confirm(`Sei sicuro di voler rimuovere ${selectedPages.size} pagine?`)) {
      setPages(items => items.filter(item => !selectedPages.has(item.id)));
      setSelectedPages(new Set());
    }
  };

  const handleDuplicateSelected = () => {
    if (selectedPages.size === 0) return;
    const pagesToAdd: PageItem[] = [];
    
    pages.forEach((page) => {
      if (selectedPages.has(page.id)) {
        pagesToAdd.push({
          ...page,
          id: uuidv4(),
        });
      }
    });
    
    setPages([...pages, ...pagesToAdd]);
  };

  const menus: Menu[] = [
    {
      title: 'File',
      items: [
        { label: 'Aggiungi PDF...', icon: <FilePlus className="w-4 h-4" />, onClick: () => fileInputRef.current?.click() },
        { divider: true },
        { label: 'Esporta PDF', icon: <Download className="w-4 h-4" />, onClick: handleDownload, disabled: pages.length === 0 },
        { label: 'Esporta Selezionate', icon: <Download className="w-4 h-4" />, onClick: handleDownload, disabled: selectedPages.size === 0 },
        { divider: true },
        { label: 'Cancella Tutto', icon: <Trash className="w-4 h-4 text-red-500" />, onClick: handleClearAll, disabled: pages.length === 0 },
      ]
    },
    {
      title: 'Modifica',
      items: [
        { label: 'Seleziona Tutto', icon: <CheckSquare className="w-4 h-4" />, onClick: handleSelectAll, disabled: pages.length === 0 },
        { label: 'Deseleziona Tutto', icon: <Square className="w-4 h-4" />, onClick: handleDeselectAll, disabled: selectedPages.size === 0 },
        { divider: true },
        { label: 'Rimuovi Selezionate', icon: <Trash2 className="w-4 h-4" />, onClick: handleRemoveSelected, disabled: selectedPages.size === 0 },
        { label: 'Duplica Selezionate', icon: <Copy className="w-4 h-4" />, onClick: handleDuplicateSelected, disabled: selectedPages.size === 0 },
      ]
    },
    {
      title: 'Visualizza',
      items: [
        { label: 'Vista Griglia', icon: <LayoutGrid className="w-4 h-4" />, onClick: () => setViewMode('grid') },
        { label: 'Vista Doppia Pagina', icon: <BookOpen className="w-4 h-4" />, onClick: () => setViewMode('double') },
        { divider: true },
        { label: showCover ? 'Nascondi Copertina Singola' : 'Mostra Copertina Singola', onClick: () => setShowCover(!showCover), disabled: viewMode !== 'double' },
      ]
    },
    {
      title: 'Strumenti',
      items: [
        { label: 'Dividi Pagine', icon: <Columns className="w-4 h-4" />, onClick: handleSplitPages, disabled: pages.length === 0 },
        { label: 'Riorganizza per Opuscolo', icon: <Book className="w-4 h-4" />, onClick: handleBookletReorder, disabled: pages.length === 0 },
        { label: 'Stampa 2 copie per foglio', icon: <Copy className="w-4 h-4" />, onClick: handleTwoUp, disabled: pages.length === 0 },
        { label: 'Schiarisci Sfondo', icon: <SunMedium className="w-4 h-4" />, onClick: handleLightenBackground, disabled: pages.length === 0 },
        { divider: true },
        { label: 'Comprimi PDF', icon: <FileDown className="w-4 h-4" />, onClick: () => handleProcessPages('compress'), disabled: pages.length === 0 },
        { label: 'Scala di grigi', icon: <ImageIcon className="w-4 h-4" />, onClick: () => handleProcessPages('grayscale'), disabled: pages.length === 0 },
        { label: 'Bianco e nero', icon: <FileText className="w-4 h-4" />, onClick: () => handleProcessPages('bw'), disabled: pages.length === 0 },
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 flex flex-col">
        {/* Menu Bar */}
        <div className="flex items-center justify-between px-2 h-10 bg-slate-100 border-b border-slate-200">
          <MenuBar menus={menus} />
          
          <div className="flex items-center gap-2 px-2">
            <span className="text-sm font-bold text-slate-700">PDF Master</span>
            <div className="flex flex-col items-center justify-center w-7 h-7 rounded-full bg-yellow-400 text-blue-800 font-black leading-[0.85] text-[8px] shadow-sm">
              <span>SUD</span>
              <span>PEN</span>
            </div>
          </div>
        </div>
        
        {/* Toolbar */}
        <div className="flex items-center px-4 h-12 gap-1 bg-white">
          <button onClick={() => fileInputRef.current?.click()} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors" title="Aggiungi PDF">
            <FilePlus className="w-4 h-4" />
          </button>
          <button onClick={handleDownload} disabled={pages.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Esporta PDF">
            <Download className="w-4 h-4" />
          </button>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <button onClick={handleSplitPages} disabled={pages.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Dividi Pagine">
            <Columns className="w-4 h-4" />
          </button>
          <button onClick={handleBookletReorder} disabled={pages.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Riorganizza per Opuscolo">
            <Book className="w-4 h-4" />
          </button>
          <button onClick={handleLightenBackground} disabled={pages.length === 0} className="p-2 text-slate-600 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed" title="Schiarisci Sfondo">
            <SunMedium className="w-4 h-4" />
          </button>
          <div className="h-6 w-px bg-slate-200 mx-1" />
          <div className="flex bg-slate-100 p-0.5 rounded-md">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-1.5 rounded transition-all",
                viewMode === 'grid' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"
              )}
              title="Vista Griglia"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('double')}
              className={cn(
                "p-1.5 rounded transition-all",
                viewMode === 'double' ? "bg-white shadow-sm text-indigo-600" : "text-slate-500 hover:text-slate-700"
              )}
              title="Vista Doppia Pagina"
            >
              <BookOpen className="w-4 h-4" />
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
              Trascina qui i tuoi file PDF
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-8">
              Carica più file per unire, riordinare, ruotare o aggiungere pagine vuote.
              Tutto avviene nel tuo browser.
            </p>
            <button className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-xl shadow-md hover:bg-indigo-700 transition-colors">
              Seleziona file PDF
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Grid */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={pages.map(p => p.id)} strategy={rectSortingStrategy}>
                <div className={cn(
                  "grid",
                  viewMode === 'grid' 
                    ? "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6" 
                    : "grid-cols-2 gap-x-2 gap-y-8 max-w-4xl mx-auto"
                )}>
                  {pages.map((page, index) => (
                    <div 
                      key={page.id}
                      className={cn(
                        viewMode === 'double' && showCover && index === 0 && "col-start-2"
                      )}
                    >
                      <SortablePage
                        page={page}
                        file={files.find(f => f.id === page.fileId)}
                        isSelected={selectedPages.has(page.id)}
                        onToggleSelection={handleToggleSelection}
                        onRotate={handleRotate}
                        onRemove={handleRemove}
                        onDuplicate={handleDuplicate}
                        onInsertBlankPage={handleInsertBlankPage}
                        onInsertFile={handleInsertFile}
                        isDoubleView={viewMode === 'double'}
                      />
                    </div>
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

      <SplitPageModal
        isOpen={isSplitModalOpen}
        onClose={() => setIsSplitModalOpen(false)}
        onConfirm={confirmSplitPages}
        pdfBytes={mergedPdfForSplit}
      />

      {compressionModalState.largeFileDetails && (
        <CompressionModal
          isOpen={compressionModalState.isOpen}
          fileName={compressionModalState.largeFileDetails.name}
          fileSize={compressionModalState.largeFileDetails.size}
          onCancel={() => setCompressionModalState({ isOpen: false, files: [], largeFileDetails: null })}
          onConfirm={(mode) => {
            const filesToProcess = compressionModalState.files;
            setCompressionModalState({ isOpen: false, files: [], largeFileDetails: null });
            
            // Check if it came from file input (insertAfterId might be set)
            if (insertAfterId !== null || fileInputRef.current?.files?.length) {
              const dataTransfer = new DataTransfer();
              filesToProcess.forEach(f => dataTransfer.items.add(f));
              processFileInput(dataTransfer.files, mode);
            } else {
              processFiles(filesToProcess, mode);
            }
          }}
        />
      )}

      {/* Hidden File Input for "Insert File" action */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept=".pdf"
        multiple
        className="hidden"
      />
    </div>
  );
}
