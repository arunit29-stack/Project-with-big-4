export interface PendingOfflineSubmission {
  id: string;
  courseId: string;
  assignmentId: string;
  fileName: string;
  fileData: ArrayBuffer;
  mimeType: string;
  createdAt: string;
}
