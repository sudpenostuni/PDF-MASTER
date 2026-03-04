import React, { forwardRef } from 'react';
import { Document, Page } from 'react-pdf';
import { RotateCw, Trash2, GripVertical, Copy } from 'lucide-react';
import { PageItem, PDFFile } from '@/lib/pdf-utils';
import { cn } from '@/lib/utils';

interface PageThumbnailProps extends React.HTMLAttributes<HTMLDivElement> {
  page: PageItem;
  file?: PDFFile;
  isDragging?: boolean;
  onRotate?: (id: string) => void;
  onRemove?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  dragHandleProps?: any;
}

export const PageThumbnail = forwardRef<HTMLDivElement, PageThumbnailProps>(
  ({ page, file, isDragging, onRotate, onRemove, onDuplicate, dragHandleProps, className, style, ...props }, ref) => {
    return (
      <div
        ref={ref}
        style={style}
        className={cn(
          "relative group bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow",
          isDragging && "opacity-50 ring-2 ring-indigo-500",
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

        {/* Actions */}
        <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onRotate && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRotate(page.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 bg-white text-slate-700 rounded-md shadow-sm hover:bg-slate-50 border border-slate-200"
              title="Rotate 90°"
            >
              <RotateCw className="w-4 h-4" />
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
          {onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove(page.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="p-1.5 bg-white text-red-600 rounded-md shadow-sm hover:bg-red-50 border border-slate-200"
              title="Remove Page"
            >
              <Trash2 className="w-4 h-4" />
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

        {/* Footer Info */}
        <div className="px-3 py-2 bg-white border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
          <span className="truncate max-w-[80px]" title={file?.name || 'Blank'}>
            {page.isBlank ? 'New Page' : file?.name}
          </span>
          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">
            {page.isBlank ? '-' : page.pageIndex + 1}
          </span>
        </div>
      </div>
    );
  }
);

PageThumbnail.displayName = 'PageThumbnail';
