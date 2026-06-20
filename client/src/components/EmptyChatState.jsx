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
      className="flex-1 flex flex-col items-center justify-center bg-base px-6 text-center"
    >
      <div className="flex flex-col items-center max-w-sm">
        <div className="w-16 h-16 rounded-lg bg-surface border-3 border-border flex items-center justify-center mb-6 shadow-brutal">
          {hasChats ? (
            <ShieldCheck className="w-8 h-8 text-accent" />
          ) : (
            <MessageSquareDashed className="w-8 h-8 text-accent" />
          )}
        </div>
        <h2 className="text-xl font-display font-bold text-tx-primary mb-2 tracking-tight">
          {hasChats ? "Secure Workspace" : "No Conversations"}
        </h2>
        <p className="text-sm text-tx-secondary leading-relaxed font-semibold">
          {hasChats
            ? "Your connection is encrypted. Select a chat from the sidebar or start a new one."
            : "Zync is a secure peer-to-peer workspace. Start a new conversation from the sidebar."}
        </p>
      </div>
    </motion.div>
  );
}
