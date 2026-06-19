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

  // Attach streams to their media elements whenever they (re)load. The remote
  // stream binds to the <video> for video calls and the <audio> for audio calls;
  // a <video> would also play audio, but a dedicated <audio> keeps audio calls
  // working even with the video element unmounted.
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      >
        <motion.div
          variants={M.modalVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="w-full max-w-4xl rounded-3xl overflow-hidden bg-surface backdrop-blur-xl border border-border relative flex flex-col"
        >

          {/* Header */}
          <div className="px-6 py-4 flex items-center justify-between border-b border-border z-10 bg-transparent">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-success animate-pulse" />
              <h3 className="font-display font-semibold text-primary">{headerLabel}</h3>
            </div>
            <p className="font-mono text-sm text-secondary">{remoteUser?.displayName || "Unknown"}</p>
          </div>

          {/* Video Grid */}
          <div className="flex-1 min-h-[40vh] md:min-h-[60vh] relative bg-black flex items-center justify-center">

            {/* Remote audio sink — drives sound for audio calls (and as a fallback). */}
            <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

            {(!isConnected) ? (
              // RINGING / CALLING — caller card
              <div className="flex flex-col items-center">
                <div className="w-24 h-24 rounded-full bg-accent mb-4 flex items-center justify-center">
                  {isVideoCall ? <Video className="w-10 h-10 text-primary" /> : <Phone className="w-10 h-10 text-primary" />}
                </div>
                <h2 className="text-xl font-medium text-primary mb-2">{remoteUser?.displayName}</h2>
                <p className="text-secondary">@{remoteUser?.username}</p>
              </div>
            ) : isVideoCall ? (
              // CONNECTED — video call
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
                  transition={M.transition}
                  className="absolute bottom-6 right-6 w-32 md:w-48 aspect-video bg-black rounded-xl overflow-hidden border border-border"
                >
                  <video playsInline autoPlay muted ref={localVideoRef} className="w-full h-full object-cover scale-x-[-1]" />
                  {isCameraOff && (
                    <div className="absolute inset-0 bg-raised flex items-center justify-center">
                      <VideoOff className="w-6 h-6 text-secondary" />
                    </div>
                  )}
                </motion.div>
              </>
            ) : (
              // CONNECTED — audio-only call (no video tracks): show an avatar.
              <div className="flex flex-col items-center">
                <div className="w-28 h-28 rounded-full bg-raised mb-4 flex items-center justify-center overflow-hidden border border-border">
                  {remoteUser?.avatarUrl ? (
                    <img src={remoteUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-secondary" />
                  )}
                </div>
                <h2 className="text-xl font-medium text-primary mb-1">{remoteUser?.displayName}</h2>
                <p className="text-sm text-secondary font-mono">Voice connected</p>
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="px-6 py-6 bg-transparent border-t border-border flex justify-center gap-6 z-10">

            {/* In-call media toggles (mic always; camera only for video calls) */}
            {isConnected && (
              <>
                <button
                  onClick={toggleMic}
                  title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className="w-14 h-14 rounded-full bg-raised border border-border flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
                >
                  {isMicMuted ? <MicOff className="w-6 h-6 text-error" /> : <Mic className="w-6 h-6 text-primary" />}
                </button>

                {isVideoCall && (
                  <button
                    onClick={toggleCamera}
                    title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                    className="w-14 h-14 rounded-full bg-raised border border-border flex items-center justify-center hover:brightness-110 active:scale-95 transition-all"
                  >
                    {isCameraOff ? <VideoOff className="w-6 h-6 text-error" /> : <Video className="w-6 h-6 text-primary" />}
                  </button>
                )}
              </>
            )}

            {/* Answer (only while ringing) */}
            {callState === 'RINGING' && (
              <button onClick={answerCall} className="w-14 h-14 rounded-full bg-success flex items-center justify-center hover:brightness-110 active:scale-95 transition-all">
                <Phone className="w-6 h-6 text-primary" />
              </button>
            )}

            {/* Reject / End */}
            <button onClick={callState === 'RINGING' ? rejectCall : endCall} className="w-14 h-14 rounded-full bg-error flex items-center justify-center hover:brightness-110 active:scale-95 transition-all">
              <PhoneOff className="w-6 h-6 text-primary" />
            </button>
          </div>

        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
