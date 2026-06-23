import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, User, RotateCw, Volume2, VolumeX } from 'lucide-react';
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
    facingMode,
    isSpeakerOn,
    answerCall,
    rejectCall,
    endCall,
    toggleMic,
    toggleCamera,
    switchCamera,
    toggleSpeaker,
  } = useCallStore();

  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
  const remoteAudioRef = useRef();

  const isVideoCall = callType === 'video';
  const isConnected = callState === 'CONNECTED';

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

  useEffect(() => {
    const applyVolumeAndRouting = async () => {
      const vol = isSpeakerOn ? 1.0 : 0.2;
      [remoteAudioRef.current, remoteVideoRef.current].forEach(el => {
        if (el) el.volume = vol;
      });

      // Try routing if setSinkId is supported
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        let targetDeviceId = "";
        
        if (isSpeakerOn) {
          const speaker = outputs.find(d => d.label.toLowerCase().includes('speaker') || d.label.toLowerCase().includes('loudspeaker'));
          if (speaker) targetDeviceId = speaker.deviceId;
        } else {
          // Enforce earpiece audio routing for standard voice call mode
          const earpiece = outputs.find(d => d.label.toLowerCase().includes('earpiece') || d.label.toLowerCase().includes('receiver') || d.label.toLowerCase().includes('phone') || d.label.toLowerCase().includes('telephony'));
          if (earpiece) targetDeviceId = earpiece.deviceId;
        }

        const setSink = async (el) => {
          if (el && typeof el.setSinkId === 'function') {
            await el.setSinkId(targetDeviceId);
          }
        };

        await setSink(remoteAudioRef.current);
        await setSink(remoteVideoRef.current);
      } catch (err) {
      }
    };

    if (isConnected) {
      applyVolumeAndRouting();
    }
  }, [isConnected, isSpeakerOn]);

  if (callState === 'IDLE') return null;

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
        className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white w-screen h-screen overflow-hidden p-0"
      >
        <div className="w-full h-full flex flex-col justify-between relative bg-zinc-950">
          
          <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />

          {/* Floating Header Overlay */}
          <div className="absolute top-0 left-0 right-0 p-6 pt-10 flex flex-col items-center justify-center z-20 bg-gradient-to-b from-black/80 to-transparent text-white">
            <h3 className="font-display font-bold text-lg tracking-wide drop-shadow">{headerLabel}</h3>
            <p className="text-sm opacity-80 mt-1 font-mono drop-shadow">@{remoteUser?.username || "unknown"}</p>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 w-full h-full relative flex items-center justify-center">
            {(!isConnected) ? (
              // RINGING / CALLING — caller card
              <div className="flex flex-col items-center p-8 rounded-lg max-w-xs w-full z-10">
                <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-700/80 mb-6 flex items-center justify-center overflow-hidden animate-pulse shadow-2xl">
                  {remoteUser?.avatarUrl ? (
                    <img src={remoteUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-zinc-400" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{remoteUser?.displayName}</h2>
                <p className="text-sm text-zinc-400 font-mono">@{remoteUser?.username}</p>
              </div>
            ) : isVideoCall ? (
              // CONNECTED — video call
              <div className="w-full h-full absolute inset-0 bg-black">
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
                  className="absolute bottom-28 right-6 w-32 md:w-44 aspect-[3/4] bg-zinc-900 rounded-2xl overflow-hidden border-2 border-zinc-700/85 shadow-2xl z-20"
                >
                  <video
                    playsInline
                    autoPlay
                    muted
                    ref={localVideoRef}
                    className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                  />
                  {isCameraOff && (
                    <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
                      <VideoOff className="w-6 h-6 text-zinc-500" />
                    </div>
                  )}
                </motion.div>
              </div>
            ) : (
              // CONNECTED — audio-only call
              <div className="flex flex-col items-center p-8 rounded-lg max-w-xs w-full z-10">
                <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-700/80 shadow-2xl mb-6 flex items-center justify-center overflow-hidden">
                  {remoteUser?.avatarUrl ? (
                    <img src={remoteUser.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-12 h-12 text-zinc-400" />
                  )}
                </div>
                <h2 className="text-xl font-bold text-white mb-2">{remoteUser?.displayName}</h2>
                <p className="text-sm text-zinc-400 font-mono">Voice Connected</p>
              </div>
            )}
          </div>

          {/* Controls Footer */}
          <div className="absolute bottom-0 left-0 right-0 p-8 pb-10 bg-gradient-to-t from-black/90 to-transparent flex justify-center items-center gap-6 z-30 shrink-0">
            {isConnected && (
              <>
                {/* Speaker Toggle */}
                <button
                  onClick={toggleSpeaker}
                  title={isSpeakerOn ? 'Switch to Earpiece' : 'Switch to Speaker'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border border-zinc-700/60 shadow-lg ${
                    isSpeakerOn 
                      ? 'bg-white text-zinc-950 hover:bg-zinc-100' 
                      : 'bg-zinc-800/80 text-white hover:bg-zinc-700'
                  }`}
                >
                  {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
                </button>

                {/* Microphone Toggle */}
                <button
                  onClick={toggleMic}
                  title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border border-zinc-700/60 shadow-lg ${
                    isMicMuted 
                      ? 'bg-red-600 text-white hover:bg-red-700' 
                      : 'bg-zinc-800/80 text-white hover:bg-zinc-700'
                  }`}
                >
                  {isMicMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                {/* Camera Toggle (Video Call Only) */}
                {isVideoCall && (
                  <>
                    <button
                      onClick={toggleCamera}
                      title={isCameraOff ? 'Turn camera on' : 'Turn camera off'}
                      className={`w-14 h-14 rounded-full flex items-center justify-center transition-all border border-zinc-700/60 shadow-lg ${
                        isCameraOff 
                          ? 'bg-red-600 text-white hover:bg-red-700' 
                          : 'bg-zinc-800/80 text-white hover:bg-zinc-700'
                      }`}
                    >
                      {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                    </button>

                    {/* Switch Camera (Facing Mode) */}
                    <button
                      onClick={switchCamera}
                      title="Switch Camera"
                      className="w-14 h-14 rounded-full bg-zinc-800/80 text-white hover:bg-zinc-700 flex items-center justify-center transition-all border border-zinc-700/60 shadow-lg"
                    >
                      <RotateCw className="w-6 h-6" />
                    </button>
                  </>
                )}
              </>
            )}

            {/* Answer Call Button */}
            {callState === 'RINGING' && (
              <button
                onClick={answerCall}
                title="Answer Call"
                className="w-16 h-16 rounded-full bg-emerald-600 text-white shadow-lg flex items-center justify-center hover:bg-emerald-500 active:scale-95 transition-all"
              >
                <Phone className="w-7 h-7" />
              </button>
            )}

            {/* Decline / Hang up Button */}
            <button
              onClick={callState === 'RINGING' ? rejectCall : endCall}
              title={callState === 'RINGING' ? "Decline Call" : "End Call"}
              className="w-16 h-16 rounded-full bg-red-600 text-white shadow-lg flex items-center justify-center hover:bg-red-500 active:scale-95 transition-all"
            >
              <PhoneOff className="w-7 h-7" />
            </button>
          </div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
