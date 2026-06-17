import { useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  ChevronLeft, Camera, Pencil, AtSign, User, Palette,
  Trash2, ShieldAlert, Loader2, X, Check,
} from "lucide-react";

import { api } from "../lib/axios";
import { auth } from "../lib/firebase";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useMessageStore } from "../store/useMessageStore";
import {
  useSettingsStore,
  resolveBackgroundStyle,
} from "../store/useSettingsStore";

// ⚡ Deep, elegant canvas presets (kept intentionally dark to sit behind chat bubbles).
const COLOR_PRESETS = [
  { name: "Slate", value: "#0f172a" },
  { name: "Emerald", value: "#064e3b" },
  { name: "Violet", value: "#4c1d95" },
  { name: "Rose", value: "#881337" },
  { name: "Indigo", value: "#1e1b4b" },
];

// Rate-limit copy surfaced in the edit modals (matches the server-side lockouts).
const FIELD_CONFIG = {
  displayName: {
    title: "Display Name",
    icon: User,
    placeholder: "e.g. Aaftab",
    maxLength: 50,
    helper: "Display names can be changed once every 14 days.",
    sanitize: (v) => v,
    validate: (v) => (v.trim().length >= 1 && v.trim().length <= 50),
    hint: "1–50 characters.",
  },
  username: {
    title: "Username",
    icon: AtSign,
    placeholder: "aaftab_dev",
    maxLength: 30,
    helper: "Usernames can be changed once every 60 days.",
    sanitize: (v) => v.toLowerCase().replace(/\s/g, ""),
    validate: (v) => /^[a-z0-9_]{3,30}$/.test(v),
    hint: "Only letters, numbers, and underscores (3–30 chars).",
  },
};

// Lightweight client-side downscale + JPEG compression before we ship bytes over the wire.
const compressImage = (file, maxSize = 512, quality = 0.85) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// ──────────────────────────────────────────────────────────────────────────
// Shared modal shell — backdrop + spring-in panel (mobile sheet feel)
// ──────────────────────────────────────────────────────────────────────────
function ModalShell({ onClose, children }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
    >
      <motion.div
        initial={{ y: 40, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 40, opacity: 0, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md bg-[var(--bg-surface)] border-t sm:border rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl"
        style={{ borderColor: "var(--border)" }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Edit field modal (display name / username)
// ──────────────────────────────────────────────────────────────────────────
function EditFieldModal({ field, currentValue, onClose, onSaved }) {
  const cfg = FIELD_CONFIG[field];
  const [value, setValue] = useState(currentValue || "");
  const [saving, setSaving] = useState(false);

  const isValid = cfg.validate(value);
  const isUnchanged = value.trim() === (currentValue || "").trim();

  const handleSave = async () => {
    if (!isValid || isUnchanged || saving) return;
    setSaving(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const res = await api.patch(
        "/users/profile",
        { [field]: value.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      useAuthStore.getState().setUser(res.data.data);
      toast.success(`${cfg.title} updated.`);
      onSaved?.(res.data.data);
      onClose();
    } catch (error) {
      // 429 → server hands back the precise "Please wait X days…" message.
      const msg = error.response?.data?.message || "Could not update. Please try again.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-display font-semibold text-white">Edit {cfg.title}</h3>
        <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ⚡ Rate-limit helper text */}
      <div className="flex items-start gap-2 mb-5 text-xs text-[var(--text-secondary)] bg-[var(--bg-raised)] rounded-lg px-3 py-2 border" style={{ borderColor: "var(--border)" }}>
        <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-[var(--warning)]" />
        <span>{cfg.helper}</span>
      </div>

      <div className="relative">
        {field === "username" && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">@</span>
        )}
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(cfg.sanitize(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder={cfg.placeholder}
          maxLength={cfg.maxLength}
          className={`w-full bg-[var(--bg-base)] border rounded-lg py-3 text-white focus:outline-none focus:border-[var(--accent)] transition-colors ${field === "username" ? "pl-9 pr-4 font-mono" : "px-4"}`}
          style={{ borderColor: "var(--border)" }}
        />
      </div>
      <p className="text-xs text-[var(--text-secondary)] mt-2 h-4">
        {value.length > 0 && !isValid ? cfg.hint : ""}
      </p>

      <div className="flex gap-3 mt-5">
        <button
          onClick={onClose}
          className="flex-1 h-11 rounded-lg border text-sm font-medium text-[var(--text-secondary)] hover:text-white transition-colors active:scale-95"
          style={{ borderColor: "var(--border)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isUnchanged || saving}
          className="flex-1 h-11 rounded-lg text-sm font-medium text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-40 disabled:active:scale-100"
          style={{ backgroundColor: "var(--accent)" }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Destructive confirmation modal (Clear All Chats)
// ──────────────────────────────────────────────────────────────────────────
function ConfirmClearModal({ onClose }) {
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (clearing) return;
    setClearing(true);
    const ok = await useMessageStore.getState().clearAllMessages();
    if (ok) {
      // Refresh the inbox previews so cleared threads stop showing stale text.
      useChatStore.getState().getConversations?.();
      toast.success("All chats cleared.");
      onClose();
    } else {
      toast.error("Failed to clear chats. Please try again.");
    }
    setClearing(false);
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-[rgba(229,72,77,0.12)] flex items-center justify-center mb-4">
          <Trash2 className="w-7 h-7 text-[var(--error)]" />
        </div>
        <h3 className="text-lg font-display font-semibold text-white mb-1">Clear all chats?</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-1">
          Are you sure? This <span className="text-white font-medium">cannot be undone.</span>
        </p>
        <p className="text-xs text-[var(--text-secondary)] mb-6">
          Your encryption identity stays intact — only the messages are permanently deleted.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 h-11 rounded-lg border text-sm font-medium text-[var(--text-secondary)] hover:text-white transition-colors active:scale-95"
          style={{ borderColor: "var(--border)" }}
        >
          Cancel
        </button>
        <button
          onClick={handleClear}
          disabled={clearing}
          className="flex-1 h-11 rounded-lg text-sm font-semibold text-white flex items-center justify-center transition-all active:scale-95 disabled:opacity-60"
          style={{ backgroundColor: "var(--error)" }}
        >
          {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete everything"}
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Section wrapper
// ──────────────────────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-xs uppercase tracking-wider text-[var(--text-secondary)] font-semibold px-1 mb-2">
        {title}
      </h2>
      <div className="bg-[var(--bg-surface)] border rounded-2xl overflow-hidden" style={{ borderColor: "var(--border)" }}>
        {children}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Settings Page
// ──────────────────────────────────────────────────────────────────────────
export default function Settings() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const { user, authUser } = useAuthStore();
  const currentUser = authUser || user;

  const { chatBackground, backgroundType, updateBackground } = useSettingsStore();
  const previewStyle = useMemo(
    () => resolveBackgroundStyle(chatBackground, backgroundType),
    [chatBackground, backgroundType]
  );

  const [editingField, setEditingField] = useState(null); // 'displayName' | 'username'
  const [showClearModal, setShowClearModal] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const handleAvatarSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Please choose an image file.");
      } else if (file.size > 5 * 1024 * 1024) {
        toast.error("Image must be under 5MB.");
      } else {
        setUploadingAvatar(true);
        try {
          const compressed = await compressImage(file);
          const token = await auth.currentUser.getIdToken();
          const res = await api.patch(
            "/users/avatar",
            { image: compressed },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          useAuthStore.getState().setUser(res.data.data);
          toast.success("Avatar updated.");
        } catch (error) {
          toast.error(error.response?.data?.message || "Upload failed. Please try again.");
        } finally {
          setUploadingAvatar(false);
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  return (
    <div className="h-[100dvh] w-full bg-[var(--bg-base)] text-[var(--text-primary)] overflow-y-auto">
      {/* ⚡ HEADER */}
      <header
        className="h-14 border-b flex items-center gap-3 px-4 sticky top-0 z-30 bg-[var(--bg-base)]/95 backdrop-blur"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => navigate("/inbox")}
          className="p-2 -ml-2 text-[var(--text-secondary)] hover:text-white transition-colors active:scale-90"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-display font-bold">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ⚡ PROFILE */}
        <Section title="Profile">
          {/* Avatar */}
          <div className="flex flex-col items-center py-7 border-b" style={{ borderColor: "var(--border)" }}>
            <div className="relative">
              <div className="w-24 h-24 rounded-full bg-[var(--border)] overflow-hidden flex items-center justify-center font-display font-bold text-3xl text-white">
                {currentUser?.avatarUrl ? (
                  <img src={currentUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                  currentUser?.displayName?.charAt(0).toUpperCase() || "Z"
                )}
              </div>

              {/* Upload overlay */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-[var(--accent)] border-4 border-[var(--bg-surface)] flex items-center justify-center text-white hover:bg-[var(--accent-hover)] transition-colors active:scale-90 disabled:opacity-70"
                title="Change photo"
              >
                {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>
            <p className="mt-3 text-xs text-[var(--text-secondary)]">Tap the camera to change your photo</p>
          </div>

          {/* Display Name row */}
          <button
            onClick={() => setEditingField("displayName")}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-[var(--bg-raised)] transition-colors text-left active:scale-[0.99] border-b"
            style={{ borderColor: "var(--border)" }}
          >
            <User className="w-5 h-5 text-[var(--text-secondary)] flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs text-[var(--text-secondary)]">Display Name</p>
              <p className="text-sm text-white font-medium truncate">{currentUser?.displayName || "—"}</p>
            </div>
            <Pencil className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
          </button>

          {/* Username row */}
          <button
            onClick={() => setEditingField("username")}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-[var(--bg-raised)] transition-colors text-left active:scale-[0.99]"
          >
            <AtSign className="w-5 h-5 text-[var(--text-secondary)] flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs text-[var(--text-secondary)]">Username</p>
              <p className="text-sm text-white font-medium font-mono truncate">@{currentUser?.username || "—"}</p>
            </div>
            <Pencil className="w-4 h-4 text-[var(--text-secondary)] flex-shrink-0" />
          </button>
        </Section>

        {/* ⚡ APPEARANCE */}
        <Section title="Appearance">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-[var(--text-secondary)]" />
              <span className="text-sm text-white font-medium">Chat background</span>
            </div>

            {/* Color presets */}
            <div className="flex flex-wrap gap-3 mb-5">
              {COLOR_PRESETS.map((preset) => {
                const active = chatBackground === preset.value;
                return (
                  <button
                    key={preset.value}
                    onClick={() => updateBackground({ chatBackground: preset.value })}
                    className="flex flex-col items-center gap-1.5 group"
                    title={preset.name}
                  >
                    <span
                      className={`w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all group-active:scale-90 ${active ? "border-[var(--accent)]" : "border-transparent"}`}
                      style={resolveBackgroundStyle(preset.value, backgroundType)}
                    >
                      {active && <Check className="w-5 h-5 text-white drop-shadow" />}
                    </span>
                    <span className={`text-[11px] ${active ? "text-white" : "text-[var(--text-secondary)]"}`}>
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Solid / Gradient toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-white font-medium">Style</span>
              <div className="flex bg-[var(--bg-base)] rounded-full p-1 border" style={{ borderColor: "var(--border)" }}>
                {["solid", "gradient"].map((type) => (
                  <button
                    key={type}
                    onClick={() => updateBackground({ backgroundType: type })}
                    className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors capitalize ${backgroundType === type ? "text-white" : "text-[var(--text-secondary)]"}`}
                  >
                    {backgroundType === type && (
                      <motion.span
                        layoutId="bgTypePill"
                        className="absolute inset-0 rounded-full bg-[var(--accent)]"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{type}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Live preview */}
            <div
              className="mt-5 h-20 rounded-xl border flex items-center justify-center"
              style={{ ...previewStyle, borderColor: "var(--border)" }}
            >
              <span className="text-xs text-white/70 font-mono">Preview</span>
            </div>
          </div>
        </Section>

        {/* ⚡ PRIVACY & DATA */}
        <Section title="Privacy & Data">
          <button
            onClick={() => setShowClearModal(true)}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-[rgba(229,72,77,0.08)] transition-colors text-left active:scale-[0.99]"
          >
            <Trash2 className="w-5 h-5 text-[var(--error)] flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-[var(--error)]">Clear All Chats</p>
              <p className="text-xs text-[var(--text-secondary)]">Permanently delete your message history</p>
            </div>
          </button>
        </Section>

        <p className="text-center text-xs text-[var(--text-secondary)] mt-2">
          🔒 Your encryption keys never leave this device.
        </p>
      </div>

      {/* ⚡ MODALS */}
      <AnimatePresence>
        {editingField && (
          <EditFieldModal
            key="edit-field"
            field={editingField}
            currentValue={currentUser?.[editingField]}
            onClose={() => setEditingField(null)}
          />
        )}
        {showClearModal && (
          <ConfirmClearModal key="clear-chats" onClose={() => setShowClearModal(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}
