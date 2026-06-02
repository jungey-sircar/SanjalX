import { create } from 'zustand';

export interface IncomingCallData {
  roomId: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  callType: 'voice' | 'video';
  isGroupCall: boolean;
  groupName?: string;
  participantIds?: string[];
}

interface CallState {
  // Incoming call notification
  incomingCall: IncomingCallData | null;
  setIncomingCall: (call: IncomingCallData | null) => void;

  // Active call state
  isInCall: boolean;
  activeRoomId: string | null;
  activeCallType: 'voice' | 'video';
  setActiveCall: (roomId: string | null, callType?: 'voice' | 'video') => void;

  // Call duration
  callStartTime: number | null;
  setCallStartTime: (time: number | null) => void;

  // Reset everything
  resetCall: () => void;
}

export const useCallStore = create<CallState>((set) => ({
  incomingCall: null,
  setIncomingCall: (call) => set({ incomingCall: call }),

  isInCall: false,
  activeRoomId: null,
  activeCallType: 'video',
  setActiveCall: (roomId, callType = 'video') =>
    set({
      isInCall: roomId !== null,
      activeRoomId: roomId,
      activeCallType: callType,
    }),

  callStartTime: null,
  setCallStartTime: (time) => set({ callStartTime: time }),

  resetCall: () =>
    set({
      incomingCall: null,
      isInCall: false,
      activeRoomId: null,
      activeCallType: 'video',
      callStartTime: null,
    }),
}));
