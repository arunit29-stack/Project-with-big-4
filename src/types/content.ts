export type ContentStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "failed";

export interface LibraryPdfItem {
  id: string;
  type: "pdf";
  title: string;
  status: ContentStatus;
  pdfUrl: string;
  downloadUrl: string;
}

export interface VideoChapter {
  id: string;
  title: string;
  startTime: number;
}

export interface TranscriptLine {
  id: string;
  startTime: number;
  text: string;
}

export interface LibraryVideoItem {
  id: string;
  type: "video";
  title: string;
  status: ContentStatus;
  hlsUrl?: string;
  posterUrl?: string;
  chapters: VideoChapter[];
  transcript: TranscriptLine[];
  uploadProgress?: number;
}

export type LibraryItem = LibraryPdfItem | LibraryVideoItem;

export interface LibraryTopic {
  id: string;
  title: string;
  items: LibraryItem[];
}

export interface LibraryWeek {
  id: string;
  title: string;
  topics: LibraryTopic[];
}

export interface ContentLibraryResponse {
  weeks: LibraryWeek[];
}

export interface HighlightAnnotation {
  id: string;
  fileId: string;
  page: number;
  type: "highlight";
  color: string;
  text: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  createdAt: string;
}

export interface NoteAnnotation {
  id: string;
  fileId: string;
  page: number;
  type: "note";
  x: number;
  y: number;
  text: string;
  createdAt: string;
}

export type PdfAnnotation = HighlightAnnotation | NoteAnnotation;

export interface VideoNote {
  id: string;
  videoId: string;
  timestamp: number;
  text: string;
  createdAt: string;
}
