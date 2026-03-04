import { PDFDocument, degrees } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';

export interface PageItem {
  id: string;
  fileId: string;
  pageIndex: number; // 0-based index in the original file
  rotation: number; // degrees (0, 90, 180, 270)
  isBlank?: boolean;
}

export interface PDFFile {
  id: string;
  name: string;
  data: ArrayBuffer;
  url: string;
  pageCount: number;
}

export async function loadPDF(file: File): Promise<PDFFile> {
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  // Load the document to get page count
  // We use a copy of the buffer for pdf-lib just in case, though usually not strictly required if we use URL for display
  const pdfDoc = await PDFDocument.load(arrayBuffer);
  
  return {
    id: uuidv4(),
    name: file.name,
    data: arrayBuffer,
    url,
    pageCount: pdfDoc.getPageCount(),
  };
}

export async function loadPDFFromBytes(data: ArrayBuffer, name: string): Promise<PDFFile> {
  const blob = new Blob([data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const pdfDoc = await PDFDocument.load(data);
  
  return {
    id: uuidv4(),
    name,
    data,
    url,
    pageCount: pdfDoc.getPageCount(),
  };
}

export async function splitPDFPages(pdfBytes: Uint8Array): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const newPdfDoc = await PDFDocument.create();
  
  const pageCount = pdfDoc.getPageCount();
  
  for (let i = 0; i < pageCount; i++) {
    // We need to copy the page twice to split it
    const [pageLeft] = await newPdfDoc.copyPages(pdfDoc, [i]);
    const [pageRight] = await newPdfDoc.copyPages(pdfDoc, [i]);
    
    const { width, height } = pageLeft.getSize();
    
    // Left Page (0 to width/2)
    pageLeft.setCropBox(0, 0, width / 2, height);
    newPdfDoc.addPage(pageLeft);
    
    // Right Page (width/2 to width)
    pageRight.setCropBox(width / 2, 0, width / 2, height);
    newPdfDoc.addPage(pageRight);
  }
  
  return await newPdfDoc.save();
}

export async function generateMergedPDF(
  files: PDFFile[],
  pages: PageItem[]
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();

  // Cache loaded PDF documents to avoid reloading them multiple times
  const pdfDocsCache: Record<string, PDFDocument> = {};

  for (const pageItem of pages) {
    if (pageItem.isBlank) {
      const page = mergedPdf.addPage();
      // Default A4 size if needed, or standard size
      // page.setSize(595.28, 841.89); 
      continue;
    }

    const file = files.find(f => f.id === pageItem.fileId);
    if (!file) continue;

    if (!pdfDocsCache[file.id]) {
      pdfDocsCache[file.id] = await PDFDocument.load(file.data);
    }

    const sourcePdf = pdfDocsCache[file.id];
    const [copiedPage] = await mergedPdf.copyPages(sourcePdf, [pageItem.pageIndex]);
    
    // Apply rotation
    const currentRotation = copiedPage.getRotation().angle;
    copiedPage.setRotation(degrees(currentRotation + pageItem.rotation));
    
    mergedPdf.addPage(copiedPage);
  }

  return await mergedPdf.save();
}
