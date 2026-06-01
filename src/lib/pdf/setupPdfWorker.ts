import { pdfjs } from "react-pdf";

let configured = false;

export function setupPdfWorker(): void {
  if (configured || typeof window === "undefined") return;
  pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  configured = true;
}
