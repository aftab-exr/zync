import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Mic, Trash2, Send, Loader2, AlertCircle } from "lucide-react";

const pickMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const c of candidates) {
    if (window.MediaRecorder?.isTypeSupported?.(c)) return c;
  }
  return "";
};

export default function VoiceRecorder({ onSend, onCancel, busy = false }) {
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState(false);

  const recorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const mimeRef = useRef("audio/webm");
  const sendOnStopRef = useRef(false);

  const teardown = () => {
    clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const mime = pickMimeType();
        mimeRef.current = mime || "audio/webm";
        const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorderRef.current = recorder;
        chunksRef.current = [];

        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
        };
        recorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: mimeRef.current });
          teardown();
          if (sendOnStopRef.current) onSend?.(blob, mimeRef.current);
        };

        recorder.start();
        timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
      } catch (err) {
        console.error("🔴 Microphone access failed:", err);
        setError(true);
      }
    })();

    return () => {
      cancelled = true;
      sendOnStopRef.current = false;
      try {
        if (recorderRef.current && recorderRef.current.state !== "inactive") {
          recorderRef.current.stop();
        }
      } catch { /* already stopped */ }
      teardown();
    };
  }, []);

  const stopRecorder = () => {
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch { /* already stopped */ }
  };

  const handleSend = () => {
    if (busy) return;
    sendOnStopRef.current = true;
    stopRecorder();
  };

  const handleCancel = () => {
    sendOnStopRef.current = false;
    stopRecorder();
    teardown();
    onCancel?.();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  if (error) {
    return (
      <div className="w-full flex items-center justify-between gap-3 bg-surface border-3 border-border rounded-lg shadow-brutal-sm px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-secondary font-bold">
          <AlertCircle className="w-4 h-4 text-secondary" />
          Microphone access denied
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-tx-secondary hover:text-tx-primary font-bold transition-colors underline"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex items-center gap-3 bg-surface border-3 border-border rounded-lg shadow-brutal-sm px-3 py-2"
    >
      {/* Cancel / discard */}
      <button
        type="button"
        onClick={handleCancel}
        disabled={busy}
        className="w-10 h-10 rounded-lg border-3 border-transparent hover:border-border hover:bg-base flex items-center justify-center text-tx-secondary hover:text-secondary hover:shadow-brutal-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50"
        title="Discard"
      >
        <Trash2 className="w-5 h-5" />
      </button>

      {/* Live status */}
      <div className="flex-1 flex items-center gap-2.5">
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary opacity-60" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-secondary" />
        </span>
        <span className="text-sm font-mono text-tx-primary font-bold tabular-nums">{mm}:{ss}</span>
        <span className="text-xs text-tx-secondary font-bold">{busy ? "Securing…" : "Recording"}</span>
      </div>

      {/* Send */}
      <button
        type="button"
        onClick={handleSend}
        disabled={busy}
        className="w-10 h-10 rounded-lg bg-accent text-tx-primary border-3 border-border shadow-brutal-sm flex items-center justify-center hover:bg-accent-hover transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-60"
        title="Send voice note"
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-4 h-4 ml-0.5" />}
      </button>

      <Mic className="w-4 h-4 text-tx-secondary hidden sm:block" />
    </motion.div>
  );
}
