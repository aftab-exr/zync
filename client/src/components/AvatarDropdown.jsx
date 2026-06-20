import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Settings, LogOut } from "lucide-react";

import { useAuthStore } from "../store/useAuthStore";
import { useSocketStore } from "../store/useSocketStore";
import { useMotion } from "../lib/motion";

export default function AvatarDropdown({ avatarUrl }) {
  const M = useMotion();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const { user, authUser, logout } = useAuthStore();
  const currentUser = authUser || user;

  const photo = avatarUrl || currentUser?.avatarUrl;
  const initial = currentUser?.displayName?.charAt(0).toUpperCase() || "Z";

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
    useSocketStore.getState().disconnect?.();
    await logout();
  };

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-10 h-10 rounded-lg bg-primary border-3 border-border overflow-hidden flex items-center justify-center font-display font-bold text-sm text-tx-primary hover:brightness-110 shadow-brutal-sm transition-all focus:outline-none focus:ring-2 focus:ring-accent active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
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
            className="absolute right-0 mt-3 w-52 origin-top-right rounded-lg border-3 border-border bg-surface py-1.5 z-[60] overflow-hidden shadow-brutal"
          >
            {/* Identity header */}
            <div className="px-4 py-2 border-b-3 border-border mb-1 bg-base">
              <p className="text-sm font-bold text-tx-primary truncate">
                {currentUser?.displayName || "Zync User"}
              </p>
              <p className="text-xs text-tx-secondary font-mono truncate">
                @{currentUser?.username || "unknown"}
              </p>
            </div>

            <button
              role="menuitem"
              onClick={goToSettings}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-tx-primary hover:bg-base transition-colors text-left font-semibold active:translate-x-0.5 active:translate-y-0.5"
            >
              <Settings className="w-4 h-4 text-tx-secondary" /> Profile / Settings
            </button>

            <button
              role="menuitem"
              onClick={handleLogout}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-secondary hover:bg-red-50 transition-colors text-left font-semibold border-t border-border active:translate-x-0.5 active:translate-y-0.5"
            >
              <LogOut className="w-4 h-4 text-secondary" /> Logout
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
