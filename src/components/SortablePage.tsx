import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageItem, PDFFile } from '@/lib/pdf-utils';
import { PageThumbnail } from './PageThumbnail';

interface SortablePageProps {
  page: PageItem;
  file?: PDFFile;
  onRotate: (id: string) => void;
  onRemove: (id: string) => void;
  onDuplicate: (id: string) => void;
}

export const SortablePage: React.FC<SortablePageProps> = ({ page, file, onRotate, onRemove, onDuplicate }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: page.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <PageThumbnail
      ref={setNodeRef}
      style={style}
      page={page}
      file={file}
      isDragging={isDragging}
      onRotate={onRotate}
      onRemove={onRemove}
      onDuplicate={onDuplicate}
      dragHandleProps={{ ...attributes, ...listeners }}
    />
  );
}
