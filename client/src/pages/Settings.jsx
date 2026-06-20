import { useState, useRef, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import {
  ChevronLeft, Camera, Pencil, AtSign, User, Palette,
  Trash2, ShieldAlert, Loader2, X, Check, Bot, Eye, EyeOff,
} from "lucide-react";

import { api } from "../lib/axios";
import { auth } from "../lib/firebase";
import { useAuthStore } from "../store/useAuthStore";
import { useChatStore } from "../store/useChatStore";
import { useMessageStore } from "../store/useMessageStore";
import { useAIStore } from "../store/useAIStore";
import {
  useSettingsStore,
  resolveBackgroundStyle,
} from "../store/useSettingsStore";

// ⚡ Neubrutalist Color Presets
const COLOR_PRESETS = [
  { name: "Yellow", value: "#FFEB3B" },
  { name: "Red", value: "#FF5252" },
  { name: "Blue", value: "#2196F3" },
  { name: "Off-White", value: "#F4F4F5" },
  { name: "White", value: "#FFFFFF" },
];

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
// Shared modal shell
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
        className="w-full sm:max-w-md bg-surface border-3 border-border rounded-lg p-6 shadow-brutal text-tx-primary"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Edit field modal
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
      const msg = error.response?.data?.message || "Could not update. Please try again.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-lg font-display font-bold text-tx-primary">Edit {cfg.title}</h3>
        <button onClick={onClose} className="p-1 rounded-lg border-2 border-transparent hover:border-border text-tx-secondary hover:text-tx-primary transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-start gap-2 mb-5 text-xs text-tx-secondary bg-base rounded-lg px-3 py-2 border-2 border-border font-bold">
        <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-warning" />
        <span>{cfg.helper}</span>
      </div>

      <div className="relative">
        {field === "username" && (
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-tx-secondary font-bold font-mono">@</span>
        )}
        <input
          autoFocus
          type="text"
          value={value}
          onChange={(e) => setValue(cfg.sanitize(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && handleSave()}
          placeholder={cfg.placeholder}
          maxLength={cfg.maxLength}
          className={`w-full bg-base border-3 border-border rounded-lg py-3 text-tx-primary placeholder-tx-secondary font-bold focus:outline-none focus:border-accent transition-colors ${field === "username" ? "pl-9 pr-4 font-mono" : "px-4"}`}
        />
      </div>
      <p className="text-xs text-secondary font-bold mt-2 h-4">
        {value.length > 0 && !isValid ? cfg.hint : ""}
      </p>

      <div className="flex gap-3 mt-5">
        <button
          onClick={onClose}
          className="flex-1 h-11 rounded-lg border-3 border-border bg-surface text-sm font-bold text-tx-primary hover:bg-base transition-colors active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!isValid || isUnchanged || saving}
          className="flex-1 h-11 rounded-lg bg-accent text-tx-primary border-3 border-border text-sm font-bold flex items-center justify-center transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save changes"}
        </button>
      </div>
    </ModalShell>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Destructive confirmation modal
// ──────────────────────────────────────────────────────────────────────────
function ConfirmClearModal({ onClose }) {
  const [clearing, setClearing] = useState(false);

  const handleClear = async () => {
    if (clearing) return;
    setClearing(true);
    const ok = await useMessageStore.getState().clearAllMessages();
    if (ok) {
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
        <div className="w-14 h-14 rounded-lg bg-red-50 border-3 border-secondary flex items-center justify-center mb-4 shadow-brutal-sm">
          <Trash2 className="w-7 h-7 text-secondary" />
        </div>
        <h3 className="text-lg font-display font-bold text-tx-primary mb-1">Clear all chats?</h3>
        <p className="text-sm text-tx-secondary font-bold mb-1">
          Are you sure? This <span className="text-secondary font-bold">cannot be undone.</span>
        </p>
        <p className="text-xs text-tx-secondary font-semibold mb-6">
          Your encryption identity stays intact — only the messages are permanently deleted.
        </p>
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 h-11 rounded-lg border-3 border-border bg-surface text-sm font-bold text-tx-primary hover:bg-base transition-colors active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm"
        >
          Cancel
        </button>
        <button
          onClick={handleClear}
          disabled={clearing}
          className="flex-1 h-11 rounded-lg bg-secondary text-tx-primary border-3 border-border text-sm font-bold flex items-center justify-center transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm disabled:opacity-60"
        >
          {clearing ? <Loader2 className="w-4 h-4 animate-spin text-tx-primary" /> : "Delete everything"}
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
      <h2 className="text-xs uppercase tracking-wider text-tx-secondary font-bold px-1 mb-2">
        {title}
      </h2>
      <div className="bg-surface border-3 border-border rounded-lg overflow-hidden shadow-brutal-sm">
        {children}
      </div>
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// AI Sidecar developer configuration
// ──────────────────────────────────────────────────────────────────────────
function AISidecarConfig() {
  const { aiBaseUrl, aiApiKey, aiModel, setAiConfig } = useAIStore();
  const [showKey, setShowKey] = useState(false);

  const fieldClass =
    "w-full bg-base border-3 border-border rounded-lg px-3 py-2.5 text-sm text-tx-primary placeholder-tx-secondary font-mono font-bold focus:outline-none focus:border-accent transition-colors shadow-brutal-sm";

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-2 text-xs text-tx-secondary bg-base rounded-lg px-3 py-2 border-2 border-border font-bold">
        <Bot className="w-4 h-4 mt-0.5 flex-shrink-0 text-accent" />
        <span>
          To run a private local model, host an OpenAI-compatible server (LM Studio / Ollama)
          on your machine and enter your local network IP endpoint here.
        </span>
      </div>

      {/* Base URL */}
      <div>
        <label className="block text-xs text-tx-secondary mb-1.5 font-bold">AI Base URL</label>
        <input
          type="text"
          value={aiBaseUrl}
          onChange={(e) => setAiConfig({ aiBaseUrl: e.target.value })}
          placeholder="https://api.groq.com/openai/v1"
          spellCheck={false}
          autoCapitalize="none"
          className={fieldClass}
        />
        <p className="text-[11px] text-tx-secondary mt-1 font-semibold">
          e.g. <span className="font-mono font-bold">http://192.168.1.20:1234/v1</span> for a local model.
        </p>
      </div>

      {/* API Key */}
      <div>
        <label className="block text-xs text-tx-secondary mb-1.5 font-bold">API Key</label>
        <div className="relative">
          <input
            type={showKey ? "text" : "password"}
            value={aiApiKey}
            onChange={(e) => setAiConfig({ aiApiKey: e.target.value })}
            placeholder="sk-…"
            spellCheck={false}
            autoCapitalize="none"
            autoComplete="off"
            className={`${fieldClass} pr-10`}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-tx-secondary hover:text-tx-primary transition-colors"
            title={showKey ? "Hide key" : "Show key"}
          >
            {showKey ? <EyeOff className="w-4 h-4 text-tx-secondary" /> : <Eye className="w-4 h-4 text-tx-secondary" />}
          </button>
        </div>
        <p className="text-[11px] text-tx-secondary mt-1 font-semibold">
          Stored only in this browser's localStorage — never sent to Zync servers.
        </p>
      </div>

      {/* Model */}
      <div>
        <label className="block text-xs text-tx-secondary mb-1.5 font-bold">Model Name</label>
        <input
          type="text"
          value={aiModel}
          onChange={(e) => setAiConfig({ aiModel: e.target.value })}
          placeholder="llama-3.1-8b-instant"
          spellCheck={false}
          autoCapitalize="none"
          className={fieldClass}
        />
      </div>
    </div>
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

  const { chatBackground, updateBackground, motionProfile, setMotionProfile } = useSettingsStore();
  const previewStyle = useMemo(
    () => resolveBackgroundStyle(chatBackground),
    [chatBackground]
  );

  const [editingField, setEditingField] = useState(null);
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
    <div className="h-[100dvh] w-full bg-base text-tx-primary overflow-y-auto font-body">
      {/* ⚡ HEADER */}
      <header className="h-14 border-b-3 border-border flex items-center gap-3 px-4 sticky top-0 z-30 bg-surface">
        <button
          onClick={() => navigate("/inbox")}
          className="p-2 -ml-2 text-tx-secondary hover:text-tx-primary border-3 border-transparent hover:border-border hover:bg-base rounded-lg transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:shadow-brutal-sm"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="text-lg font-display font-bold text-tx-primary">Settings</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* ⚡ PROFILE */}
        <Section title="Profile">
          {/* Avatar */}
          <div className="flex flex-col items-center py-7 border-b-3 border-border bg-base">
            <div className="relative">
              <div className="w-24 h-24 rounded-lg bg-primary border-3 border-border shadow-brutal overflow-hidden flex items-center justify-center font-display font-bold text-3xl text-tx-primary">
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
                className="absolute -bottom-2 -right-2 w-9 h-9 rounded-lg bg-accent border-3 border-border flex items-center justify-center text-tx-primary hover:bg-accent-hover shadow-brutal-sm transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-70"
                title="Change photo"
              >
                {uploadingAvatar ? <Loader2 className="w-4 h-4 animate-spin text-tx-primary" /> : <Camera className="w-4 h-4 text-tx-primary" />}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarSelect}
              />
            </div>
            <p className="mt-4 text-xs text-tx-secondary font-bold">Tap the camera to change your photo</p>
          </div>

          {/* Display Name row */}
          <button
            onClick={() => setEditingField("displayName")}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-base transition-colors text-left border-b-3 border-border active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:shadow-brutal-sm"
          >
            <User className="w-5 h-5 text-tx-secondary flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs text-tx-secondary font-bold">Display Name</p>
              <p className="text-sm text-tx-primary font-bold truncate">{currentUser?.displayName || "—"}</p>
            </div>
            <Pencil className="w-4 h-4 text-tx-secondary flex-shrink-0" />
          </button>

          {/* Username row */}
          <button
            onClick={() => setEditingField("username")}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-base transition-colors text-left active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:shadow-brutal-sm"
          >
            <AtSign className="w-5 h-5 text-tx-secondary flex-shrink-0" />
            <div className="flex-1 overflow-hidden">
              <p className="text-xs text-tx-secondary font-bold">Username</p>
              <p className="text-sm text-tx-primary font-bold font-mono truncate">@{currentUser?.username || "—"}</p>
            </div>
            <Pencil className="w-4 h-4 text-tx-secondary flex-shrink-0" />
          </button>
        </Section>

        {/* ⚡ APPEARANCE */}
        <Section title="Appearance">
          <div className="p-4 bg-surface">
            <div className="flex items-center gap-2 mb-4">
              <Palette className="w-4 h-4 text-tx-secondary" />
              <span className="text-sm text-tx-primary font-bold">Chat background</span>
            </div>

            {/* Color presets */}
            <div className="flex flex-wrap gap-4 mb-5">
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
                      className={`w-11 h-11 rounded-lg border-3 flex items-center justify-center transition-all group-active:scale-95 ${active ? "border-accent shadow-brutal-sm bg-accent" : "border-border shadow-none"}`}
                      style={resolveBackgroundStyle(preset.value)}
                    >
                      {active && <Check className="w-5 h-5 text-tx-primary font-bold" />}
                    </span>
                    <span className={`text-[11px] font-bold ${active ? "text-tx-primary" : "text-tx-secondary"}`}>
                      {preset.name}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Live preview */}
            <div
              className="mt-5 h-20 rounded-lg border-3 border-border flex items-center justify-center shadow-brutal-sm"
              style={{ ...previewStyle }}
            >
              <span className="text-xs text-tx-secondary font-mono font-bold bg-surface px-2.5 py-1 border-2 border-border rounded shadow-brutal-sm">Preview</span>
            </div>
          </div>
        </Section>

        {/* ⚡ MOTION & ACCESSIBILITY */}
        <Section title="Motion & Accessibility">
          <div className="p-4 space-y-4 bg-surface">
            <p className="text-xs text-tx-secondary font-bold">
              Choose the physics profile for transitions and animations.
            </p>
            <div className="flex bg-base rounded-lg p-1 border-3 border-border shadow-brutal-sm">
              {[
                { id: "fluid", name: "Fluid", desc: "HIG Spring" },
                { id: "snappy", name: "Snappy", desc: "Linear" },
                { id: "reduced", name: "Reduced", desc: "Fade Only" }
              ].map((profile) => {
                const active = motionProfile === profile.id;
                return (
                  <button
                    key={profile.id}
                    onClick={() => setMotionProfile(profile.id)}
                    className={`relative flex-1 py-2 text-xs font-bold rounded-lg transition-all ${active ? "text-tx-primary" : "text-tx-secondary"}`}
                  >
                    {active && (
                      <motion.span
                        layoutId="motionProfilePill"
                        className="absolute inset-0 rounded-lg bg-accent border-2 border-border shadow-brutal-sm"
                        transition={{ type: "spring", stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10 block font-bold">{profile.name}</span>
                    <span className="relative z-10 block text-[9px] opacity-80 mt-0.5">{profile.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </Section>

        {/* ⚡ AI SIDECAR DEVELOPER CONFIGURATION */}
        <Section title="AI Sidecar Developer Configuration">
          <AISidecarConfig />
        </Section>

        {/* ⚡ PRIVACY & DATA */}
        <Section title="Privacy & Data">
          <button
            onClick={() => setShowClearModal(true)}
            className="w-full flex items-center gap-4 px-4 py-4 hover:bg-red-50 transition-colors text-left active:translate-x-0.5 active:translate-y-0.5 active:shadow-none hover:shadow-brutal-sm border-t-3 border-transparent"
          >
            <Trash2 className="w-5 h-5 text-secondary flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-secondary">Clear All Chats</p>
              <p className="text-xs text-tx-secondary font-semibold">Permanently delete your message history</p>
            </div>
          </button>
        </Section>

        <p className="text-center text-xs text-tx-secondary mt-4 font-bold">
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
