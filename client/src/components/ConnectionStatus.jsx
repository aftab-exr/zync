import { useSocketStore } from "../store/useSocketStore";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function ConnectionStatus() {
  const { socket, isConnected, isReconnecting } = useSocketStore();

  // Only show the banner if we have initialized a socket but it is currently disconnected
  const showBanner = socket && !isConnected;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="w-full bg-warning text-tx-primary border-b-3 border-border font-mono text-xs font-bold uppercase tracking-wider overflow-hidden z-50 shrink-0"
        >
          <div className="flex items-center justify-center gap-2 py-2 px-4 text-center">
            {isReconnecting ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 text-tx-primary animate-pulse" />
            )}
            <span>
              {isReconnecting ? "System Status: Reconnecting..." : "System Status: Offline"}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
