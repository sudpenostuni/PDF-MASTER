import React, { forwardRef } from 'react';
import { Document, Page } from 'react-pdf';
import { RotateCw, Trash2, GripVertical, Copy, FilePlus, FileInput, Check } from 'lucide-react';
import { PageItem, PDFFile } from '@/lib/pdf-utils';
import { cn } from '@/lib/utils';

interface PageThumbnailProps extends React.HTMLAttributes<HTMLDivElement> {
  page: PageItem;
  file?: PDFFile;
  isDragging?: boolean;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  onRotate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  onInsertBlankPage?: (id: string) => void;
  onInsertFile?: (id: string) => void;
  dragHandleProps?: any;
}

export const PageThumbnail = forwardRef<HTMLDivElement, PageThumbnailProps>(
  ({ page, file, isDragging, isSelected, onToggleSelection, onRotate, onRemove, onDuplicate, onInsertBlankPage, onInsertFile, dragHandleProps, className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "relative group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow",
          isDragging && "opacity-50 ring-2 ring-indigo-500",
          isSelected && "ring-2 ring-indigo-500 border-indigo-500",
          className
        )}
        {...props}
      >
        {/* Drag Handle */}
        <div 
          {...dragHandleProps}
          className="absolute top-2 left-2 z-10 p-1.5 bg-black/50 text-white rounded-md cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-4 h-4" />
        </div>

        {/* Selection Checkbox */}
        {onToggleSelection && (
          <div 
            className={cn(
              "absolute top-2 right-2 z-20 cursor-pointer transition-opacity",
              isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(page.id);
            }}
          >
            <div className={cn(
              "w-6 h-6 rounded-md border flex items-center justify-center transition-colors shadow-sm",
              isSelected 
                ? "bg-indigo-600 border-indigo-600 text-white" 
                : "bg-white border-slate-300 hover:border-indigo-400"
            )}>
              {isSelected && <Check className="w-4 h-4" />}
            </div>
          </div>
        )}

        {/* Top Actions (Duplicate, Insert) */}
        <div className="absolute top-10 right-2 z-10 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onInsertFile && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInsertFile(page.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 bg-white text-indigo-600 rounded-md shadow-sm hover:bg-indigo-50 border border-slate-200"
              title="Insert File After"
            >
              <FileInput className="w-4 h-4" />
            </button>
          )}
          {onInsertBlankPage && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInsertBlankPage(page.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 bg-white text-indigo-600 rounded-md shadow-sm hover:bg-indigo-50 border border-slate-200"
              title="Insert Blank Page After"
            >
              <FilePlus className="w-4 h-4" />
            </button>
          )}
          {onDuplicate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(page.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 bg-white text-slate-700 rounded-md shadow-sm hover:bg-slate-50 border border-slate-200"
              title="Duplicate Page"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Preview */}
        <div className="aspect-[1/1.414] bg-slate-100 flex items-center justify-center overflow-hidden relative">
          {page.isBlank ? (
            <div className="text-slate-400 text-sm font-medium">Blank Page</div>
          ) : file ? (
            <div 
              className="w-full h-full flex items-center justify-center origin-center transition-transform"
              style={{ transform: `rotate(${page.rotation}deg)` }}
            >
              <Document file={file.url} className="flex justify-center" loading={<div className="animate-pulse bg-slate-200 w-full h-full" />}>
                <Page 
                  pageIndex={page.pageIndex} 
                  width={200} 
                  renderTextLayer={false} 
                  renderAnnotationLayer={false}
                  className="pdf-page-thumbnail shadow-sm"
                />
              </Document>
            </div>
          ) : (
            <div className="text-red-400 text-xs">File not found</div>
          )}
        </div>

        {/* Footer Info & Actions */}
        <div className="px-3 py-2 bg-white border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
              {page.isBlank ? '-' : page.pageIndex + 1}
            </span>
          </div>
          
          <div className="flex items-center gap-1">
             {onRotate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRotate(page.id);
                }}
                className="p-1 hover:bg-slate-100 rounded text-slate-600 hover:text-slate-900 transition-colors"
                title="Rotate 90°"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(page.id);
                }}
                className="p-1 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition-colors"
                title="Remove Page"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
);

PageThumbnail.displayName = 'PageThumbnail';
