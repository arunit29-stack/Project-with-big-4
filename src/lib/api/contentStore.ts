import type {
  ContentLibraryResponse,
  ContentStatus,
  LibraryItem,
  PdfAnnotation,
  VideoNote,
} from "@/types/content";

const SAMPLE_PDF =
  "https://mozilla.github.io/pdf.js/web/compressed.tracemonkey-pldi-09.pdf";

const SAMPLE_HLS =
  "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

const libraries = new Map<string, ContentLibraryResponse>();

const annotations = new Map<string, PdfAnnotation[]>();
const videoNotes = new Map<string, VideoNote[]>();

const tusUploads = new Map<
  string,
  { courseId: string; offset: number; size: number; data: Buffer[] }
>();

function libraryKey(courseId: string): string {
  return courseId;
}

function annotationKey(
  courseId: string,
  userId: string,
  fileId: string,
): string {
  return `${courseId}:${userId}:${fileId}`;
}

function notesKey(courseId: string, userId: string, videoId: string): string {
  return `${courseId}:${userId}:${videoId}`;
}

function defaultLibrary(_courseId: string): ContentLibraryResponse {
  return {
    weeks: [
      {
        id: "week-1",
        title: "Week 1 — Introduction",
        topics: [
          {
            id: "topic-1-1",
            title: "Course overview",
            items: [
              {
                id: "pdf-syllabus",
                type: "pdf",
                title: "Course syllabus",
                status: "ready",
                pdfUrl: SAMPLE_PDF,
                downloadUrl: SAMPLE_PDF,
              },
              {
                id: "pdf-lecture-1",
                type: "pdf",
                title: "Lecture 1 slides",
                status: "processing",
                pdfUrl: SAMPLE_PDF,
                downloadUrl: SAMPLE_PDF,
              },
            ],
          },
          {
            id: "topic-1-2",
            title: "Cell biology",
            items: [
              {
                id: "video-intro-cells",
                type: "video",
                title: "Introduction to cells",
                status: "ready",
                hlsUrl: SAMPLE_HLS,
                chapters: [
                  { id: "ch-1", title: "Overview", startTime: 0 },
                  { id: "ch-2", title: "Cell membrane", startTime: 62 },
                  { id: "ch-3", title: "Organelles", startTime: 145 },
                ],
                transcript: [
                  {
                    id: "t-1",
                    startTime: 0,
                    text: "Welcome to this lecture on cell biology.",
                  },
                  {
                    id: "t-2",
                    startTime: 8,
                    text: "Today we will explore the structure of cells.",
                  },
                  {
                    id: "t-3",
                    startTime: 62,
                    text: "The cell membrane separates the interior from the environment.",
                  },
                  {
                    id: "t-4",
                    startTime: 145,
                    text: "Organelles perform specialized functions within the cell.",
                  },
                ],
              },
              {
                id: "video-lab-prep",
                type: "video",
                title: "Lab prep (processing)",
                status: "processing",
                chapters: [],
                transcript: [],
              },
              {
                id: "video-failed-upload",
                type: "video",
                title: "Supplementary demo",
                status: "failed",
                chapters: [],
                transcript: [],
              },
            ],
          },
        ],
      },
      {
        id: "week-2",
        title: "Week 2 — Genetics",
        topics: [
          {
            id: "topic-2-1",
            title: "DNA & RNA",
            items: [
              {
                id: "pdf-dna",
                type: "pdf",
                title: "DNA structure reading",
                status: "ready",
                pdfUrl: SAMPLE_PDF,
                downloadUrl: SAMPLE_PDF,
              },
            ],
          },
        ],
      },
    ],
  };
}

export function getLibrary(courseId: string): ContentLibraryResponse {
  if (!libraries.has(libraryKey(courseId))) {
    libraries.set(libraryKey(courseId), defaultLibrary(courseId));
  }
  return JSON.parse(
    JSON.stringify(libraries.get(libraryKey(courseId))),
  ) as ContentLibraryResponse;
}

export function updateItemStatus(
  courseId: string,
  itemId: string,
  status: ContentStatus,
  extra?: Partial<LibraryItem>,
): void {
  const lib = getLibrary(courseId);
  for (const week of lib.weeks) {
    for (const topic of week.topics) {
      const item = topic.items.find((i) => i.id === itemId);
      if (item) {
        Object.assign(item, { status, ...extra });
        libraries.set(libraryKey(courseId), lib);
        return;
      }
    }
  }
}

export function addVideoItem(
  courseId: string,
  item: LibraryItem,
): void {
  const lib = getLibrary(courseId);
  const week = lib.weeks[0];
  if (!week) return;
  const topic = week.topics[week.topics.length - 1];
  if (topic) {
    topic.items.push(item as LibraryItem);
    libraries.set(libraryKey(courseId), lib);
  }
}

export function getAnnotations(
  courseId: string,
  userId: string,
  fileId: string,
): PdfAnnotation[] {
  return [
    ...(annotations.get(annotationKey(courseId, userId, fileId)) ?? []),
  ];
}

export function saveAnnotations(
  courseId: string,
  userId: string,
  fileId: string,
  items: PdfAnnotation[],
): void {
  annotations.set(annotationKey(courseId, userId, fileId), items);
}

export function getVideoNotes(
  courseId: string,
  userId: string,
  videoId: string,
): VideoNote[] {
  return [...(videoNotes.get(notesKey(courseId, userId, videoId)) ?? [])];
}

export function addVideoNote(
  courseId: string,
  userId: string,
  videoId: string,
  note: Omit<VideoNote, "id" | "createdAt" | "videoId">,
): VideoNote {
  const key = notesKey(courseId, userId, videoId);
  const list = videoNotes.get(key) ?? [];
  const created: VideoNote = {
    id: `note-${Date.now()}`,
    videoId,
    ...note,
    createdAt: new Date().toISOString(),
  };
  list.push(created);
  videoNotes.set(key, list);
  return created;
}

export function parseUserIdFromToken(authHeader: string | null): string {
  if (!authHeader?.startsWith("Bearer ")) return "anonymous";
  const token = authHeader.slice(7);
  try {
    if (token.startsWith("cbb.mock.")) {
      const payload = token.slice("cbb.mock.".length);
      const json = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as { sub?: string };
      return json.sub ?? "user-unknown";
    }
  } catch {
    /* fall through */
  }
  return "user-unknown";
}

export function createTusUpload(courseId: string, size: number): string {
  const id = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  tusUploads.set(id, { courseId, offset: 0, size, data: [] });
  return id;
}

export function getTusUpload(id: string) {
  return tusUploads.get(id);
}

export function patchTusUpload(
  id: string,
  chunk: Buffer,
  offset: number,
): number {
  const upload = tusUploads.get(id);
  if (!upload) return -1;
  if (offset !== upload.offset) return upload.offset;
  upload.data.push(chunk);
  upload.offset += chunk.length;
  tusUploads.set(id, upload);
  return upload.offset;
}

export function finalizeTusUpload(id: string): string | null {
  const upload = tusUploads.get(id);
  if (!upload || upload.offset < upload.size) return null;
  const videoId = `video-${Date.now()}`;
  addVideoItem(upload.courseId, {
    id: videoId,
    type: "video",
    title: "Uploaded lecture",
    status: "uploading",
    uploadProgress: 100,
    chapters: [],
    transcript: [],
  });
  setTimeout(() => {
    updateItemStatus(upload.courseId, videoId, "processing");
    setTimeout(() => {
      updateItemStatus(upload.courseId, videoId, "ready", {
        hlsUrl: SAMPLE_HLS,
        chapters: [
          { id: "ch-u1", title: "Start", startTime: 0 },
        ],
        transcript: [
          {
            id: "tu-1",
            startTime: 0,
            text: "Uploaded video is now ready to stream.",
          },
        ],
      } as Partial<LibraryItem>);
    }, 3000);
  }, 1500);
  tusUploads.delete(id);
  return videoId;
}

export function retryItem(courseId: string, itemId: string): void {
  updateItemStatus(courseId, itemId, "processing");
  setTimeout(() => {
    updateItemStatus(courseId, itemId, "ready", {
      hlsUrl: SAMPLE_HLS,
    } as Partial<LibraryItem>);
  }, 2000);
}
