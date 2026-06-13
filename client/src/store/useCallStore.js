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

  // ⚡ 1. Mount the WebRTC Socket Listeners
  initCallListeners: () => {
    const socket = useSocketStore.getState().socket;
    if (!socket) return;

    socket.on("webrtc:incoming-call", ({ signal, caller }) => {
      // Ignore if already in a call
      if (get().callState !== 'IDLE') return;
      set({ callState: 'RINGING', incomingSignal: signal, remoteUser: caller });
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

  // ⚡ 2. Initiate a Video Call
  initiateCall: async (userToCall) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      set({ localStream: stream, callState: 'CALLING', remoteUser: userToCall });

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
          callerData: currentUser
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      set({ localStream: stream, callState: 'CONNECTED' });

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
    });
  }
}));