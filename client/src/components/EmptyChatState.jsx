import { ShieldCheck, MessageSquareDashed } from "lucide-react";
import { motion } from "framer-motion";
import { useMotion } from "../lib/motion";

export default function EmptyChatState({ hasChats }) {
  const M = useMotion();

  return (
    <motion.div
      variants={M.backdropVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-base)] px-6 text-center"
    >
      <div className="flex flex-col items-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-zinc-900/70 border border-zinc-800 flex items-center justify-center mb-6 shadow-sm">
          {hasChats ? (
            <ShieldCheck className="w-8 h-8 text-[var(--accent)]" />
          ) : (
            <MessageSquareDashed className="w-8 h-8 text-[var(--accent)]" />
          )}
        </div>
        <h2 className="text-lg font-display font-semibold text-white mb-2 tracking-tight">
          {hasChats ? "Secure Workspace" : "No Conversations"}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {hasChats
            ? "Your connection is encrypted. Select a chat from the sidebar or start a new one."
            : "Zync is a secure peer-to-peer workspace. Start a new conversation from the sidebar."}
        </p>
      </div>
    </motion.div>
  );
}
