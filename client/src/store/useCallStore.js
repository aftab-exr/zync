import { create } from 'zustand';
import Peer from 'simple-peer';
import { useSocketStore } from './useSocketStore';
import { useAuthStore } from './useAuthStore';

export const useCallStore = create((set, get) => ({
  localStream: null,
  remoteStream: null,
  peer: null,
  callState: 'IDLE', // IDLE, RINGING, CALLING, CONNECTED
  incomingSignal: null,
  remoteUser: null,
  // ⚡ PHASE 4: 'video' (camera + mic) or 'audio' (mic only). Drives getUserMedia
  // constraints on both ends and which controls the overlay shows.
  callType: 'video',
  // ⚡ PHASE 4: local track mute flags, mirrored onto the actual MediaStreamTracks.
  isMicMuted: false,
  isCameraOff: false,

  // ⚡ 1. Mount the WebRTC Socket Listeners
  initCallListeners: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    socket.on("webrtc:incoming-call", ({ signal, caller, callType }) => {
      // Ignore if already in a call
      if (get().callState !== 'IDLE') return;
      // ⚡ PHASE 4: adopt the caller's media mode so answerCall mirrors it
      // (audio-only stays audio-only). Defaults to video for legacy callers.
      set({
        callState: 'RINGING',
        incomingSignal: signal,
        remoteUser: caller,
        callType: callType === 'audio' ? 'audio' : 'video',
      });
    });

    socket.on("webrtc:call-accepted", (signal) => {
      const { peer } = get();
      if (peer) {
         peer.signal(signal);
         set({ callState: 'CONNECTED' });
      }
    });

    socket.on("webrtc:call-rejected", () => {
      get().cleanup();
      alert("Call was rejected.");
    });

    socket.on("webrtc:call-ended", () => {
      get().cleanup();
    });
  },

  // ⚡ 2. Initiate a Call (video by default, or audio-only)
  initiateCall: async (userToCall, callType = 'video') => {
    try {
      // Audio calls skip the camera entirely so no webcam light comes on.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true,
      });
      set({
        localStream: stream,
        callState: 'CALLING',
        remoteUser: userToCall,
        callType,
        isMicMuted: false,
        isCameraOff: false,
      });

      const socket = useSocketStore.getState().socket;
      const currentUser = useAuthStore.getState().authUser || useAuthStore.getState().user;

      const peer = new Peer({
        initiator: true,
        trickle: false, // Disabling trickle packages the entire SDP into one fast payload
        stream: stream,
      });

      peer.on('signal', (data) => {
        socket.emit('webrtc:call-user', {
          userToCall: userToCall._id,
          signalData: data,
          callerData: currentUser,
          callType, // ⚡ PHASE 4: tell the callee whether to answer with a camera
        });
      });

      peer.on('stream', (currentStream) => {
        set({ remoteStream: currentStream });
      });

      set({ peer });
    } catch (error) {
      console.error("Camera access failed", error);
      alert("Please allow Camera and Microphone permissions to make calls.");
      get().cleanup();
    }
  },

  // ⚡ 3. Answer an Incoming Call
  answerCall: async () => {
    try {
      // ⚡ PHASE 4: mirror the caller's media mode (audio-only ↔ video).
      const { callType } = get();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: callType === 'video',
        audio: true,
      });
      set({ localStream: stream, callState: 'CONNECTED', isMicMuted: false, isCameraOff: false });

      const socket = useSocketStore.getState().socket;
      const { incomingSignal, remoteUser } = get();

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: stream,
      });

      peer.on('signal', (data) => {
        socket.emit('webrtc:answer-call', { to: remoteUser._id, signalData: data });
      });

      peer.on('stream', (currentStream) => {
        set({ remoteStream: currentStream });
      });

      peer.signal(incomingSignal);
      set({ peer });
    } catch (error) {
      console.error("Failed to answer", error);
      get().cleanup();
    }
  },

  // ⚡ PHASE 4: Mute/unmute the local mic by toggling its audio tracks. We disable
  // the track (rather than stopping it) so it can be re-enabled without a new
  // getUserMedia round-trip — the peer just receives silence meanwhile.
  toggleMic: () => {
    const { localStream, isMicMuted } = get();
    if (!localStream) return;
    const nextMuted = !isMicMuted;
    localStream.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    set({ isMicMuted: nextMuted });
  },

  // ⚡ PHASE 4: Turn the local camera on/off by toggling its video tracks. No-op
  // for audio-only calls (no video tracks exist).
  toggleCamera: () => {
    const { localStream, isCameraOff } = get();
    if (!localStream) return;
    const nextOff = !isCameraOff;
    localStream.getVideoTracks().forEach((track) => { track.enabled = !nextOff; });
    set({ isCameraOff: nextOff });
  },

  rejectCall: () => {
    const socket = useSocketStore.getState().socket;
    const { remoteUser } = get();
    if (remoteUser) socket.emit('webrtc:reject-call', { to: remoteUser._id });
    get().cleanup();
  },

  endCall: () => {
    const socket = useSocketStore.getState().socket;
    const { remoteUser } = get();
    if (remoteUser) socket.emit('webrtc:end-call', { to: remoteUser._id });
    get().cleanup();
  },

  // ⚡ Hard Reset: Kills the camera light and destroys the P2P connection
  cleanup: () => {
    const { localStream, peer } = get();
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    if (peer) peer.destroy();
    
    set({
      localStream: null,
      remoteStream: null,
      peer: null,
      callState: 'IDLE',
      incomingSignal: null,
      remoteUser: null,
      callType: 'video',
      isMicMuted: false,
      isCameraOff: false,
    });
  }
}));