import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useCallStore } from '../store/useCallStore';
import { useMotion } from '../lib/motion';

export default function CallOverlay() {
  const M = useMotion();
  const {
    callState,
    callType,
    remoteUser,
    localStream,
    remoteStream,
    isMicMuted,
    isCameraOff,
    answerCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
  } = useCallStore();

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const remoteAudioRef = useRef();

  const isVideoCall = callType === 'video';

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [localStream, remoteStream, callState, callType]);

  if (callState === 'IDLE') return null;

  const isConnected = callState === 'CONNECTED';
  const headerLabel =
    callState === 'RINGING'
      ? `Incoming ${isVideoCall ? 'Video' : 'Voice'} Call...`
      : callState === 'CALLING'
        ? 'Ringing...'
        : `Secure ${isVideoCall ? 'Video' : 'Voice'} Call`;

  return (
    <AnimatePresence>
      <motion.div
        variants={M.backdropVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          variants={M.modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full max-w-4xl rounded-lg overflow-hidden bg-surface border-3 border-border relative flex flex-col shadow-brutal"
        >

          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between border-b-3 border-border z-10 bg-base text-tx-primary font-bold">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-success animate-pulse border border-border" />
              <h3 className="font-display font-bold text-tx-primary">{headerLabel}</h3>
            </div>
            <p className="font-mono text-sm text-tx-secondary">@{remoteUser?.username || "unknown"}</p>
          </div>

          {/* Video Grid */}
          <div className="flex-1 min-h-[40vh] md:min-h-[60vh] relative bg-base flex items-center justify-center border-b-3 border-border">

            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

            {(!isConnected) ? (
              // RINGING / CALLING — caller card
              <div className="flex flex-col items-center p-8 bg-surface border-3 border-border rounded-lg shadow-brutal max-w-xs w-full">
                <div className="w-20 h-20 rounded-lg bg-accent border-3 border-border shadow-brutal-sm mb-4 flex items-center justify-center">
                  {isVideoCall ? <Video className="w-8 h-8 text-tx-primary" /> : <Phone className="w-8 h-8 text-tx-primary" />}
                </div>
                <h2 className="text-lg font-bold text-tx-primary mb-1">{remoteUser?.displayName}</h2>
                <p className="text-xs text-tx-secondary font-mono">@{remoteUser?.username}</p>
              </div>
            ) : isVideoCall ? (
              // CONNECTED — video call
              <>
                <video
                  playsInline
                  autoPlay
                  ref={remoteVideoRef}
                  className="w-full h-full object-cover bg-black"
                />

                {/* Local Stream (Picture-in-Picture) */}
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={M.transition}
                  className="absolute bottom-6 right-6 w-32 md:w-48 aspect-video bg-black rounded-lg overflow-hidden border-3 border-border shadow-brutal-sm"
                >
                  <video playsInline autoPlay muted ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" />
                  {isCameraOff && (
                    <div className="absolute inset-0 bg-base flex items-center justify-center">
                      <VideoOff className="w-6 h-6 text-tx-secondary" />
                    </div>
                  )}
                </motion.div>
              </>
            ) : (
              // CONNECTED — audio-only call
              <div className="flex flex-col items-center p-8 bg-surface border-3 border-border rounded-lg shadow-brutal max-w-xs w-full">
                <div className="w-20 h-20 rounded-lg bg-primary border-3 border-border shadow-brutal-sm mb-4 flex items-center justify-center overflow-hidden">
                  {remoteUser?.avatarUrl ? (
                    <img src={remoteUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-tx-primary" />
                  )}
                </div>
                <h2 className="text-lg font-bold text-tx-primary mb-1">{remoteUser?.displayName}</h2>
                <p className="text-xs text-tx-secondary font-mono">Voice connected</p>
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="px-6 py-6 bg-base flex justify-center gap-6 z-10 shrink-0">

            {isConnected && (
              <>
                <button
                  onClick={toggleMic}
                  title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`w-14 h-14 rounded-lg border-3 border-border flex items-center justify-center transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm ${isMicMuted ? 'bg-secondary text-tx-primary' : 'bg-surface text-tx-primary hover:bg-base'}`}
                >
                  {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                {isVideoCall && (
                  <button
                    onClick={toggleCamera}
                    title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                    className={`w-14 h-14 rounded-lg border-3 border-border flex items-center justify-center transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shadow-brutal-sm ${isCameraOff ? 'bg-secondary text-tx-primary' : 'bg-surface text-tx-primary hover:bg-base'}`}
                  >
                    {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </button>
                )}
              </>
            )}

            {callState === 'RINGING' && (
              <button onClick={answerCall} className="w-14 h-14 rounded-lg bg-success border-3 border-border text-tx-primary font-bold shadow-brutal-sm flex items-center justify-center hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
                <Phone className="w-6 h-6" />
              </button>
            )}

            <button onClick={callState === 'RINGING' ? rejectCall : endCall} className="w-14 h-14 rounded-lg bg-secondary border-3 border-border text-tx-primary font-bold shadow-brutal-sm flex items-center justify-center hover:brightness-110 active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all">
              <PhoneOff className="w-6 h-6" />
            </button>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
