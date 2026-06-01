"use client";

import { useAuth } from "@/contexts/AuthContext";
import { useTranslation } from "@/lib/i18n/useTranslation";
import * as tus from "tus-js-client";
import { useCallback, useRef, useState } from "react";

interface VideoUploadZoneProps {
  courseId: string;
  onUploadComplete: () => void;
}

export function VideoUploadZone({
  courseId,
  onUploadComplete,
}: VideoUploadZoneProps) {
  const { t } = useTranslation();
  const { token } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<tus.Upload | null>(null);

  const [progress, setProgress] = useState<number | null>(null);
  const [resuming, setResuming] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const startUpload = useCallback(
    (file: File) => {
      if (!token) return;

      const endpoint = `/api/courses/${courseId}/videos/tus`;
      setProgress(0);
      setResuming(false);

      const upload = new tus.Upload(file, {
        endpoint,
        retryDelays: [0, 1000, 3000, 5000],
        metadata: {
          filename: file.name,
          filetype: file.type,
        },
        headers: { Authorization: `Bearer ${token}` },
        chunkSize: 256 * 1024,
        onError: () => {
          setProgress(null);
        },
        onProgress: (bytesSent, bytesTotal) => {
          setProgress(Math.round((bytesSent / bytesTotal) * 100));
        },
        onSuccess: () => {
          setProgress(null);
          uploadRef.current = null;
          onUploadComplete();
        },
        onShouldRetry: () => {
          setResuming(true);
          return true;
        },
      });

      upload.findPreviousUploads().then((previous) => {
        if (previous.length > 0) {
          setResuming(true);
          upload.resumeFromPreviousUpload(previous[0]);
        }
        upload.start();
      });

      uploadRef.current = upload;
    },
    [courseId, token, onUploadComplete],
  );

  function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) startUpload(file);
  }

  return (
    <div className="border-t border-slate-200 bg-slate-50 p-4">
      <p className="mb-2 text-sm font-medium text-slate-800">
        {t("contentLibrary.upload.title")}
      </p>

      <div
        role="button"
        tabIndex={0}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-8 text-center transition ${
          dragOver
            ? "border-brand-500 bg-brand-50"
            : "border-slate-300 bg-white hover:border-brand-400"
        }`}
      >
        <p className="text-sm text-slate-600">
          {t("contentLibrary.upload.dropzone")}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
      </div>

      {resuming && (
        <p className="mt-2 text-sm font-medium text-amber-700">
          {t("contentLibrary.upload.resuming")}
        </p>
      )}

      {progress !== null && (
        <div className="mt-3">
          <div className="mb-1 flex justify-between text-xs text-slate-600">
            <span>{t("contentLibrary.upload.progress")}</span>
            <span className="tabular-nums">{progress}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full bg-brand-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
