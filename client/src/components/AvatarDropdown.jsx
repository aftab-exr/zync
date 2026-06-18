import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut } from "lucide-react";

import { useAuthStore } from "../store/useAuthStore";
import { useSocketStore } from "../store/useSocketStore";
import { useMotion } from "../lib/motion";

// ⚡ Reusable avatar + dropdown menu. Gateway to Settings and the secure logout.
// `avatarUrl` is an optional override; otherwise we read the live profile from
// the store. (The schema has no `profilePic` field — the photo lives on
// `avatarUrl`, which the whole app reads.)
export default function AvatarDropdown({ avatarUrl }) {
  const M = useMotion();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const { user, authUser, logout } = useAuthStore();
  const currentUser = authUser || user;

  const photo = avatarUrl || currentUser?.avatarUrl;
  const initial = currentUser?.displayName?.charAt(0).toUpperCase() || "Z";

  // Close the menu on any click/tap outside the container.
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  const goToSettings = () => {
    setOpen(false);
    navigate("/settings");
  };

  const handleLogout = async () => {
    setOpen(false);
    // 🔒 IDENTITY-SAFE: useAuthStore.logout NEVER deletes `zync_private_key`
    // (locked in during the E2E stabilization phase). Here we only tear down the
    // live socket and let the store clear session state.
    useSocketStore.getState().disconnect?.();
    await logout();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-10 h-10 rounded-full bg-[var(--border)] border-2 border-[var(--border-active)] overflow-hidden flex items-center justify-center font-display font-bold text-xs text-white hover:brightness-110 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
      >
        {photo ? (
          <img src={photo} alt="Your avatar" className="w-full h-full object-cover" />
        ) : (
          initial
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            variants={M.dropdownVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            role="menu"
            className="absolute right-0 mt-2 w-52 origin-top-right rounded-xl border border-zinc-800 bg-zinc-900/70 backdrop-blur-xl py-1.5 z-[60] overflow-hidden"
          >
            {/* Identity header */}
            <div className="px-4 py-2 border-b border-zinc-800 mb-1">
              <p className="text-sm font-medium text-white truncate">
                {currentUser?.displayName || "Zync User"}
              </p>
              <p className="text-xs text-slate-400 font-mono truncate">
                @{currentUser?.username || "unknown"}
              </p>
            </div>

            <button
              role="menuitem"
              onClick={goToSettings}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-100 hover:bg-zinc-800/50 transition-colors text-left active:scale-[0.98]"
            >
              <Settings className="w-4 h-4" /> Profile / Settings
            </button>

            <button
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-400 hover:bg-zinc-800/50 transition-colors text-left active:scale-[0.98]"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
