import type { PresignResponse } from "@/types/assignment";

export async function presignSubmission(
  courseId: string,
  assignmentId: string,
  file: File,
  token: string,
): Promise<PresignResponse> {
  const res = await fetch(
    `/api/courses/${courseId}/assignments/${assignmentId}/submit`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: (() => {
        const form = new FormData();
        form.append("file", file);
        return form;
      })(),
    },
  );
  if (!res.ok) throw new Error("presign_failed");
  return res.json() as Promise<PresignResponse>;
}

export async function uploadToS3(
  uploadUrl: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("upload_failed"));
    };
    xhr.onerror = () => reject(new Error("upload_failed"));
    xhr.send(file);
  });
}

export async function confirmSubmission(
  courseId: string,
  assignmentId: string,
  fileName: string,
  submissionToken: string,
  token: string,
  studentName: string,
): Promise<void> {
  const res = await fetch(
    `/api/courses/${courseId}/assignments/${assignmentId}/submit/confirm`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        fileName,
        submissionToken,
        studentName,
      }),
    },
  );
  if (!res.ok) throw new Error("confirm_failed");
}
