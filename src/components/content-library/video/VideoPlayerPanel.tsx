"use client";

import { StatusChip } from "@/components/content-library/StatusChip";
import { useVideoNotes } from "@/hooks/useVideoNotes";
import { formatTimestamp } from "@/lib/formatTime";
import { useTranslation } from "@/lib/i18n/useTranslation";
import type { LibraryVideoItem } from "@/types/content";
import Hls from "hls.js/dist/hls.js";
import { useCallback, useEffect, useRef, useState } from "react";

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface VideoPlayerPanelProps {
  courseId: string;
  item: LibraryVideoItem;
  canTakeNotes: boolean;
}

type SidePanel = "chapters" | "transcript" | "notes" | null;

export function VideoPlayerPanel({
  courseId,
  item,
  canTakeNotes,
}: VideoPlayerPanelProps) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [sidePanel, setSidePanel] = useState<SidePanel>("chapters");
  const [transcriptQuery, setTranscriptQuery] = useState("");
  const [noteDraft, setNoteDraft] = useState("");

  const { notes, addNote } = useVideoNotes(
    courseId,
    item.status === "ready" ? item.id : null,
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !item.hlsUrl || item.status !== "ready") return;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(item.hlsUrl);
      hls.attachMedia(video);
      hlsRef.current = hls;
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    }
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = item.hlsUrl;
    }
  }, [item.hlsUrl, item.status]);

  const seek = useCallback((time: number) => {
    const video = videoRef.current;
    if (video) {
      video.currentTime = time;
      setCurrentTime(time);
    }
  }, []);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  };

  const toggleFullscreen = () => {
    containerRef.current?.requestFullscreen?.();
  };

  const filteredTranscript = item.transcript.filter(
    (line) =>
      !transcriptQuery.trim() ||
      line.text.toLowerCase().includes(transcriptQuery.toLowerCase()),
  );

  async function handleAddNote() {
    if (!noteDraft.trim()) return;
    await addNote(currentTime, noteDraft);
    setNoteDraft("");
  }

  if (item.status !== "ready" || !item.hlsUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <StatusChip status={item.status} uploadProgress={item.uploadProgress} />
        <p className="text-sm text-slate-500">
          {t("contentLibrary.video.notReady")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[480px] flex-1 flex-col lg:flex-row">
      <div ref={containerRef} className="flex min-w-0 flex-1 flex-col bg-black">
        <video
          ref={videoRef}
          className="aspect-video w-full bg-black"
          onTimeUpdate={() =>
            setCurrentTime(videoRef.current?.currentTime ?? 0)
          }
          onLoadedMetadata={() =>
            setDuration(videoRef.current?.duration ?? 0)
          }
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />

        <div className="bg-slate-900 px-3 py-2 text-white">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            className="mb-2 w-full accent-brand-500"
            aria-label={t("contentLibrary.video.seek")}
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={togglePlay}
              className="rounded px-2 py-1 hover:bg-slate-700"
            >
              {playing
                ? t("contentLibrary.video.pause")
                : t("contentLibrary.video.play")}
            </button>
            <span className="tabular-nums text-xs text-slate-300">
              {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => {
                const v = Number(e.target.value);
                setVolume(v);
                if (videoRef.current) videoRef.current.volume = v;
              }}
              className="w-20 accent-brand-500"
              aria-label={t("contentLibrary.video.volume")}
            />
            <select
              value={speed}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSpeed(s);
                if (videoRef.current) videoRef.current.playbackRate = s;
              }}
              className="rounded bg-slate-800 px-2 py-1 text-xs"
              aria-label={t("contentLibrary.video.speed")}
            >
              {SPEEDS.map((s) => (
                <option key={s} value={s}>
                  {s}×
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={toggleFullscreen}
              className="ml-auto rounded px-2 py-1 hover:bg-slate-700"
            >
              {t("contentLibrary.video.fullscreen")}
            </button>
          </div>
        </div>

        <div className="flex gap-1 border-t border-slate-700 bg-slate-800 px-2 py-1">
          {(
            [
              "chapters",
              "transcript",
              ...(canTakeNotes ? (["notes"] as const) : []),
            ] as const
          ).map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() =>
                setSidePanel(sidePanel === panel ? null : panel)
              }
              className={`rounded px-2 py-1 text-xs ${
                sidePanel === panel
                  ? "bg-brand-600 text-white"
                  : "text-slate-300 hover:bg-slate-700"
              }`}
            >
              {t(`contentLibrary.video.panel.${panel}`)}
            </button>
          ))}
        </div>
      </div>

      {sidePanel && (
        <aside className="w-full shrink-0 border-l border-slate-200 bg-white lg:w-72">
          {sidePanel === "chapters" && (
            <ul className="max-h-[400px] overflow-y-auto p-2">
              {item.chapters.map((ch) => (
                <li key={ch.id}>
                  <button
                    type="button"
                    onClick={() => seek(ch.startTime)}
                    className="w-full rounded px-2 py-2 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-medium text-slate-800">{ch.title}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      {formatTimestamp(ch.startTime)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {sidePanel === "transcript" && (
            <div className="flex max-h-[400px] flex-col">
              <input
                type="search"
                value={transcriptQuery}
                onChange={(e) => setTranscriptQuery(e.target.value)}
                placeholder={t("contentLibrary.video.transcriptSearch")}
                className="m-2 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
              />
              <ul className="flex-1 overflow-y-auto p-2">
                {filteredTranscript.map((line) => (
                  <li key={line.id}>
                    <button
                      type="button"
                      onClick={() => seek(line.startTime)}
                      className="w-full rounded px-2 py-2 text-left text-sm hover:bg-brand-50"
                    >
                      <span className="text-xs text-brand-600">
                        {formatTimestamp(line.startTime)}
                      </span>
                      <p className="text-slate-700">{line.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sidePanel === "notes" && canTakeNotes && (
            <div className="flex max-h-[400px] flex-col p-2">
              <p className="mb-2 text-xs text-slate-500">
                {t("contentLibrary.video.notesAt", {
                  time: formatTimestamp(currentTime),
                })}
              </p>
              <textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder={t("contentLibrary.video.notePlaceholder")}
                className="mb-2 w-full resize-none rounded-lg border border-slate-200 p-2 text-sm"
                rows={3}
              />
              <button
                type="button"
                onClick={() => void handleAddNote()}
                disabled={!noteDraft.trim()}
                className="rounded-lg bg-brand-600 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {t("contentLibrary.video.saveNote")}
              </button>
              <ul className="mt-3 flex-1 space-y-2 overflow-y-auto">
                {notes.map((n) => (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => seek(n.timestamp)}
                      className="w-full rounded border border-slate-100 bg-slate-50 px-2 py-2 text-left text-sm hover:border-brand-200"
                    >
                      <span className="text-xs font-medium text-brand-600">
                        {formatTimestamp(n.timestamp)}
                      </span>
                      <p className="text-slate-700">{n.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
