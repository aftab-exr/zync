import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../store/useCallStore';

export default function CallOverlay() {
  const { callState, remoteUser, localStream, remoteStream, answerCall, rejectCall, endCall } = useCallStore();
  
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();

  // Attach streams to video elements automatically when they load
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream, callState]);

  if (callState === 'IDLE') return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      >
        <div className="w-full max-w-4xl rounded-3xl overflow-hidden bg-[var(--bg-surface)] border border-[var(--border)] shadow-2xl relative flex flex-col">
          
          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-[var(--border)] z-10 bg-[var(--bg-surface)]">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-[var(--success)] animate-pulse shadow-[0_0_10px_var(--success)]" />
              <h3 className="font-display font-semibold text-white">
                {callState === 'RINGING' ? 'Incoming Call...' : callState === 'CALLING' ? 'Ringing...' : 'Secure Video Call'}
              </h3>
            </div>
            <p className="font-mono text-sm text-[var(--text-secondary)]">{remoteUser?.displayName || "Unknown"}</p>
          </div>

          {/* Video Grid */}
          <div className="flex-1 min-h-[40vh] md:min-h-[60vh] relative bg-black flex items-center justify-center">
            
            {callState === 'RINGING' || callState === 'CALLING' ? (
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-[var(--accent)] mb-4 flex items-center justify-center shadow-[0_0_30px_rgba(79,142,247,0.3)]">
                  <Video className="w-10 h-10 text-white" />
                </div>
                <h2 className="text-xl font-medium text-white mb-2">{remoteUser?.displayName}</h2>
                <p className="text-[var(--text-secondary)]">@{remoteUser?.username}</p>
              </div>
            ) : (
              <>
                {/* Remote Stream (Main Screen) */}
                <video 
                  playsInline 
                  autoPlay 
                  ref={remoteVideoRef} 
                  className="w-full h-full object-cover"
                />
                
                {/* Local Stream (Picture-in-Picture) */}
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="absolute bottom-6 right-6 w-32 md:w-48 aspect-video bg-black rounded-xl overflow-hidden shadow-xl border-2 border-[var(--border)]"
                >
                  <video playsInline autoPlay muted ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" />
                </motion.div>
              </>
            )}
          </div>

          {/* Controls Footer */}
          <div className="px-6 py-6 bg-[var(--bg-surface)] border-t border-[var(--border)] flex justify-center gap-6 z-10">
            {callState === 'RINGING' && (
              <button onClick={answerCall} className="w-14 h-14 rounded-full bg-[var(--success)] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shadow-lg">
                <Phone className="w-6 h-6 text-white" />
              </button>
            )}
            
            <button onClick={callState === 'RINGING' ? rejectCall : endCall} className="w-14 h-14 rounded-full bg-[var(--error)] flex items-center justify-center hover:brightness-110 active:scale-95 transition-all shadow-lg">
              <PhoneOff className="w-6 h-6 text-white" />
            </button>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}