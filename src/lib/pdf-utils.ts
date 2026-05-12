import { PDFDocument, degrees } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import { pdfjs } from 'react-pdf';

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

export interface NormalizedRect {
  x: number; // 0-1
  y: number; // 0-1
  width: number; // 0-1
  height: number; // 0-1
}

export interface SplitConfig {
  rect1: NormalizedRect;
  rect2: NormalizedRect;
}

export async function splitPDFPages(pdfBytes: Uint8Array, config?: SplitConfig): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const newPdfDoc = await PDFDocument.create();
  
  const pageCount = pdfDoc.getPageCount();
  
  for (let i = 0; i < pageCount; i++) {
    // We need to copy the page twice to split it
    const [page1] = await newPdfDoc.copyPages(pdfDoc, [i]);
    const [page2] = await newPdfDoc.copyPages(pdfDoc, [i]);
    
    const { width, height } = page1.getSize();
    
    if (config) {
      // Manual Split
      // Rect 1
      page1.setCropBox(
        config.rect1.x * width,
        config.rect1.y * height,
        config.rect1.width * width,
        config.rect1.height * height
      );
      newPdfDoc.addPage(page1);

      // Rect 2
      page2.setCropBox(
        config.rect2.x * width,
        config.rect2.y * height,
        config.rect2.width * width,
        config.rect2.height * height
      );
      newPdfDoc.addPage(page2);
    } else {
      // Auto Split (Vertical Half)
      // Left Page (0 to width/2)
      page1.setCropBox(0, 0, width / 2, height);
      newPdfDoc.addPage(page1);
      
      // Right Page (width/2 to width)
      page2.setCropBox(width / 2, 0, width / 2, height);
      newPdfDoc.addPage(page2);
    }
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

export function reorderPagesForBooklet(pages: PageItem[]): PageItem[] {
  const n = pages.length;
  const remainder = n % 4;
  const paddingNeeded = remainder === 0 ? 0 : 4 - remainder;
  
  // Create a copy of pages and add blank pages if needed
  const workingPages = [...pages];
  for (let i = 0; i < paddingNeeded; i++) {
    workingPages.push({
      id: uuidv4(),
      fileId: 'blank',
      pageIndex: -1,
      rotation: 0,
      isBlank: true,
    });
  }
  
  const totalPages = workingPages.length;
  const bookletPages: PageItem[] = [];
  const numSheets = totalPages / 4;
  
  for (let k = 1; k <= numSheets; k++) {
    // Front of sheet k
    bookletPages.push(workingPages[totalPages - 2 * (k - 1) - 1]); // Front Left
    bookletPages.push(workingPages[2 * (k - 1)]);                 // Front Right
    
    // Back of sheet k
    bookletPages.push(workingPages[2 * (k - 1) + 1]);             // Back Left
    bookletPages.push(workingPages[totalPages - 2 * k + 1 - 1]);  // Back Right
  }
  
  return bookletPages;
}

export async function lightenPages(
  files: PDFFile[],
  pagesToProcess: PageItem[]
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  const pdfDocsCache: Record<string, any> = {};

  for (const pageItem of pagesToProcess) {
    if (pageItem.isBlank) {
      mergedPdf.addPage();
      continue;
    }

    const file = files.find(f => f.id === pageItem.fileId);
    if (!file) continue;

    if (!pdfDocsCache[file.id]) {
      pdfDocsCache[file.id] = await pdfjs.getDocument({ data: file.data }).promise;
    }

    const pdfDoc = pdfDocsCache[file.id];
    const page = await pdfDoc.getPage(pageItem.pageIndex + 1);

    // Scale 2.0 provides a good balance between quality and performance
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Contrast stretch parameters
    const minGray = 100; // Darker than this becomes black
    const maxGray = 190; // Lighter than this becomes white

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      // Grayscale conversion
      let gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Contrast stretch
      if (gray < minGray) {
        gray = 0;
      } else if (gray > maxGray) {
        gray = 255;
      } else {
        gray = Math.round(((gray - minGray) / (maxGray - minGray)) * 255);
      }
      
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const imgDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
    
    const jpgImage = await mergedPdf.embedJpg(imgBytes);
    
    const originalViewport = page.getViewport({ scale: 1.0 });
    const newPage = mergedPdf.addPage([originalViewport.width, originalViewport.height]);
    
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: originalViewport.width,
      height: originalViewport.height,
    });
    
    if (pageItem.rotation) {
       newPage.setRotation(degrees(pageItem.rotation));
    }
  }

  return await mergedPdf.save();
}

export async function compressPDF(
  file: File,
  mode: 'compress' | 'grayscale' | 'bw',
  onProgress?: (progress: number) => void
): Promise<File> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdfDoc.numPages;

  const newPdf = await PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    
    // Lower scale for compression, slightly higher for grayscale/bw to preserve readability
    const scale = mode === 'compress' ? 1.0 : 1.5;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (mode === 'grayscale' || mode === 'bw') {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let j = 0; j < data.length; j += 4) {
        const r = data[j];
        const g = data[j + 1];
        const b = data[j + 2];
        
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        if (mode === 'bw') {
          // Threshold for B&W
          gray = gray > 150 ? 255 : 0;
        }
        
        data[j] = gray;
        data[j + 1] = gray;
        data[j + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const quality = mode === 'compress' ? 0.6 : 0.8;
    const imgDataUrl = canvas.toDataURL('image/jpeg', quality);
    const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
    
    const jpgImage = await newPdf.embedJpg(imgBytes);
    
    const originalViewport = page.getViewport({ scale: 1.0 });
    const newPage = newPdf.addPage([originalViewport.width, originalViewport.height]);
    
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: originalViewport.width,
      height: originalViewport.height,
    });

    if (onProgress) {
      onProgress(Math.round((i / numPages) * 100));
    }
    
    // Yield to main thread
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  const newPdfBytes = await newPdf.save();
  return new File([newPdfBytes], file.name, { type: 'application/pdf' });
}

export async function createTwoUpPDF(
  files: PDFFile[],
  pagesToProcess: PageItem[]
): Promise<Uint8Array> {
  // 1. Generate a merged PDF of the selected pages to apply rotations and handle blanks
  const mergedBytes = await generateMergedPDF(files, pagesToProcess);
  
  const sourcePdf = await PDFDocument.load(mergedBytes);
  const newPdf = await PDFDocument.create();
  const pageCount = sourcePdf.getPageCount();
  
  for (let i = 0; i < pageCount; i++) {
    const sourcePage = sourcePdf.getPage(i);
    const embeddedPage = await newPdf.embedPage(sourcePage);
    
    const width = embeddedPage.width;
    const height = embeddedPage.height;
    
    // Create a new page twice as wide
    const newPage = newPdf.addPage([width * 2, height]);
    
    // Draw the left copy
    newPage.drawPage(embeddedPage, {
      x: 0,
      y: 0,
    });
    
    // Draw the right copy
    newPage.drawPage(embeddedPage, {
      x: width,
      y: 0,
    });
  }
  
  return await newPdf.save();
}

export async function processPages(
  files: PDFFile[],
  pagesToProcess: PageItem[],
  mode: 'compress' | 'grayscale' | 'bw',
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  const mergedPdf = await PDFDocument.create();
  const pdfDocsCache: Record<string, any> = {};

  for (let idx = 0; idx < pagesToProcess.length; idx++) {
    const pageItem = pagesToProcess[idx];
    
    if (pageItem.isBlank) {
      mergedPdf.addPage();
      continue;
    }

    const file = files.find(f => f.id === pageItem.fileId);
    if (!file) continue;

    if (!pdfDocsCache[file.id]) {
      pdfDocsCache[file.id] = await pdfjs.getDocument({ data: file.data }).promise;
    }

    const pdfDoc = pdfDocsCache[file.id];
    const page = await pdfDoc.getPage(pageItem.pageIndex + 1);

    const scale = mode === 'compress' ? 1.0 : 1.5;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas context not available');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({ canvasContext: ctx, viewport }).promise;

    if (mode === 'grayscale' || mode === 'bw') {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let j = 0; j < data.length; j += 4) {
        const r = data[j];
        const g = data[j + 1];
        const b = data[j + 2];
        
        let gray = 0.299 * r + 0.587 * g + 0.114 * b;
        
        if (mode === 'bw') {
          gray = gray > 150 ? 255 : 0;
        }
        
        data[j] = gray;
        data[j + 1] = gray;
        data[j + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    }

    const quality = mode === 'compress' ? 0.6 : 0.8;
    const imgDataUrl = canvas.toDataURL('image/jpeg', quality);
    const imgBytes = await fetch(imgDataUrl).then(res => res.arrayBuffer());
    
    const jpgImage = await mergedPdf.embedJpg(imgBytes);
    
    const originalViewport = page.getViewport({ scale: 1.0 });
    const newPage = mergedPdf.addPage([originalViewport.width, originalViewport.height]);
    
    newPage.drawImage(jpgImage, {
      x: 0,
      y: 0,
      width: originalViewport.width,
      height: originalViewport.height,
    });
    
    if (pageItem.rotation) {
       newPage.setRotation(degrees(pageItem.rotation));
    }

    if (onProgress) {
      onProgress(Math.round(((idx + 1) / pagesToProcess.length) * 100));
    }
    
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return await mergedPdf.save();
}

export async function convertGraphicDesignToBooklet(
  files: PDFFile[],
  pagesToProcess: PageItem[],
  onProgress?: (progress: number) => void
): Promise<Uint8Array> {
  // 1. Merge selected pages
  const mergedBytes = await generateMergedPDF(files, pagesToProcess);
  const sourcePdf = await PDFDocument.load(mergedBytes);
  
  // 2. Flatten into A4 reading order
  const flattenedPdf = await PDFDocument.create();
  const pageCount = sourcePdf.getPageCount();
  
  for (let i = 0; i < pageCount; i++) {
    const page = sourcePdf.getPage(i);
    const { width, height } = page.getSize();
    
    // Check if it's a spread (A3 format: width > height).
    // Often A4 is portrait (width < height).
    // Allow a small tolerance just in case
    if (width > height + 10) {
      // It's a spread, split it
      const embeddedSpread = await flattenedPdf.embedPage(page);
      const halfWidth = width / 2;
      
      const leftPage = flattenedPdf.addPage([halfWidth, height]);
      leftPage.drawPage(embeddedSpread, { x: 0, y: 0 }); // Left half is visible
      
      const rightPage = flattenedPdf.addPage([halfWidth, height]);
      rightPage.drawPage(embeddedSpread, { x: -halfWidth, y: 0 }); // Shift left to show right half
    } else {
      // Normal A4 page
      const [copiedPage] = await flattenedPdf.copyPages(sourcePdf, [i]);
      flattenedPdf.addPage(copiedPage);
    }

    if (onProgress) {
        onProgress(Math.round(((i + 1) / pageCount) * 30)); // 30% for splitting
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  // 3. Save to bake the transformations
  const readingOrderPdfBytes = await flattenedPdf.save();
  const readingPdf = await PDFDocument.load(readingOrderPdfBytes);
  const totalFlattened = readingPdf.getPageCount();
  
  // 4. Calculate booklet order
  const remainder = totalFlattened % 4;
  const paddingNeeded = remainder === 0 ? 0 : 4 - remainder;
  
  const pageRefs: (number | null)[] = [];
  for (let i = 0; i < totalFlattened; i++) {
    pageRefs.push(i);
  }
  for (let i = 0; i < paddingNeeded; i++) {
    pageRefs.push(null);
  }
  
  const totalWithPadding = pageRefs.length;
  const numSheets = totalWithPadding / 4;
  const bookletOrder: (number | null)[] = [];
  
  for (let k = 1; k <= numSheets; k++) {
    bookletOrder.push(pageRefs[totalWithPadding - 2 * (k - 1) - 1]); // Front Left
    bookletOrder.push(pageRefs[2 * (k - 1)]);                         // Front Right
    
    bookletOrder.push(pageRefs[2 * (k - 1) + 1]);                     // Back Left
    bookletOrder.push(pageRefs[totalWithPadding - 2 * k + 1 - 1]);    // Back Right
  }
  
  // 5. Combine pairs side by side into the final A3 sheet layout
  const finalPdf = await PDFDocument.create();
  
  let a4Width = 595.28;
  let a4Height = 841.89;
  if (totalFlattened > 0) {
    const { width, height } = readingPdf.getPage(0).getSize();
    a4Width = width;
    a4Height = height;
  }
  
  const finalSteps = Math.ceil(bookletOrder.length / 2);
  for (let i = 0; i < bookletOrder.length; i += 2) {
    const leftRef = bookletOrder[i];
    const rightRef = bookletOrder[i + 1];
    
    const newSpread = finalPdf.addPage([a4Width * 2, a4Height]);
    
    if (leftRef !== null) {
      const leftSrcPage = readingPdf.getPage(leftRef);
      const embeddedLeft = await finalPdf.embedPage(leftSrcPage);
      newSpread.drawPage(embeddedLeft, { x: 0, y: 0 });
    }
    
    if (rightRef !== null) {
      const rightSrcPage = readingPdf.getPage(rightRef);
      const embeddedRight = await finalPdf.embedPage(rightSrcPage);
      newSpread.drawPage(embeddedRight, { x: a4Width, y: 0 });
    }
    
    if (onProgress) {
        // From 30% to 100% for final rendering and appending
        const step = Math.floor(i / 2) + 1;
        onProgress(30 + Math.round((step / finalSteps) * 70)); 
    }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  
  return await finalPdf.save();
}
