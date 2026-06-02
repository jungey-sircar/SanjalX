import { Platform } from 'react-native';
import { socketService } from './socket';

// STUN servers for ICE connectivity
const ICE_SERVERS: RTCConfiguration['iceServers'] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
];

export type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';

export interface CallEventData {
  event: string;
  [key: string]: any;
}

type CallEventHandler = (data: CallEventData) => void;

class WebRTCService {
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private eventHandlers: Set<CallEventHandler> = new Set();
  private currentRoomId: string | null = null;
  private callType: 'voice' | 'video' = 'video';
  private isMuted: boolean = false;
  private isVideoOn: boolean = true;
  private isInitialized: boolean = false;
  private boundHandlers: Map<string, (data: any) => void> = new Map();

  // Check if WebRTC is available on this platform
  get isWebRTCAvailable(): boolean {
    if (Platform.OS === 'web') {
      return typeof RTCPeerConnection !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.mediaDevices;
    }
    return false; // Native requires react-native-webrtc dev build
  }

  // Initialize - register signaling handlers on the shared socket
  initialize(): void {
    if (this.isInitialized) return;

    const signalingEvents = [
      'incoming_call',
      'call_room_created',
      'call_response',
      'joined_call',
      'participant_joined',
      'participant_left',
      'webrtc_offer',
      'webrtc_answer',
      'ice_candidate',
      'call_ended',
      'left_call',
    ];

    signalingEvents.forEach((eventType) => {
      const handler = (data: any) => this.handleSignalingMessage(data);
      this.boundHandlers.set(eventType, handler);
      socketService.on(eventType, handler);
    });

    this.isInitialized = true;
    console.log('[WebRTC] Initialized, listening for signaling events');
  }

  // Cleanup signaling handlers
  deinitialize(): void {
    this.boundHandlers.forEach((handler, eventType) => {
      socketService.off(eventType, handler);
    });
    this.boundHandlers.clear();
    this.isInitialized = false;
    this.cleanup();
    console.log('[WebRTC] Deinitialized');
  }

  // Handle incoming signaling messages from the shared socket
  private async handleSignalingMessage(data: any): Promise<void> {
    const msgType = data.type;
    console.log('[WebRTC] Signaling:', msgType);

    switch (msgType) {
      case 'incoming_call':
        this.emitEvent({
          event: 'incoming_call',
          roomId: data.room_id,
          callerId: data.from_id,
          callerName: data.caller_name,
          callerPhoto: data.caller_photo,
          callType: data.call_type,
          isGroupCall: data.is_group_call || false,
          groupName: data.group_name,
          participantIds: data.participant_ids,
        });
        break;

      case 'call_room_created':
        this.currentRoomId = data.room_id;
        this.emitEvent({
          event: 'room_created',
          roomId: data.room_id,
          callType: data.call_type,
        });
        break;

      case 'call_response':
        if (data.accepted) {
          this.emitEvent({
            event: 'call_accepted',
            roomId: data.room_id,
            peerId: data.from_id,
          });
          // Create offer for the accepting peer
          await this.createOffer(data.from_id);
        } else {
          this.emitEvent({
            event: 'call_rejected',
            roomId: data.room_id,
            peerId: data.from_id,
          });
        }
        break;

      case 'joined_call':
        this.currentRoomId = data.room_id;
        this.callType = data.call_type;
        this.emitEvent({
          event: 'joined_call',
          roomId: data.room_id,
          callType: data.call_type,
          participants: data.participants,
        });
        break;

      case 'participant_joined':
        this.emitEvent({
          event: 'participant_joined',
          roomId: data.room_id,
          peerId: data.user_id,
          peerName: data.user_name,
          peerPhoto: data.user_photo,
          participants: data.participants,
        });
        // Create offer for the new participant
        await this.createOffer(data.user_id);
        break;

      case 'participant_left':
        this.closePeerConnection(data.user_id);
        this.emitEvent({
          event: 'participant_left',
          roomId: data.room_id,
          peerId: data.user_id,
          participants: data.participants,
        });
        break;

      case 'webrtc_offer':
        await this.handleOffer(data.from_id, data.offer);
        break;

      case 'webrtc_answer':
        await this.handleAnswer(data.from_id, data.answer);
        break;

      case 'ice_candidate':
        await this.handleIceCandidate(data.from_id, data.candidate);
        break;

      case 'call_ended':
        this.emitEvent({
          event: 'call_ended',
          roomId: data.room_id,
          endedBy: data.ended_by,
        });
        this.cleanup();
        break;

      case 'left_call':
        this.emitEvent({ event: 'left_call', roomId: data.room_id });
        break;
    }
  }

  // Start local media capture
  async startLocalStream(isVideo: boolean = true): Promise<MediaStream | null> {
    if (!this.isWebRTCAvailable) {
      console.warn('[WebRTC] Not available on this platform');
      return null;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: isVideo
          ? { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
          : false,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.callType = isVideo ? 'video' : 'voice';
      this.isVideoOn = isVideo;
      this.isMuted = false;

      console.log('[WebRTC] Local stream started:', {
        audio: this.localStream.getAudioTracks().length,
        video: this.localStream.getVideoTracks().length,
      });

      return this.localStream;
    } catch (error: any) {
      console.warn('[WebRTC] Media capture failed:', error.message);
      
      // Try audio-only fallback if video failed
      if (isVideo) {
        try {
          console.log('[WebRTC] Trying audio-only fallback...');
          this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          this.callType = 'voice';
          this.isVideoOn = false;
          this.isMuted = false;
          return this.localStream;
        } catch (audioError) {
          console.warn('[WebRTC] Audio-only also failed:', audioError);
        }
      }
      
      // Return null - call can still proceed for signaling
      return null;
    }
  }

  // Create RTCPeerConnection for a peer
  private createPeerConnection(peerId: string): RTCPeerConnection {
    console.log('[WebRTC] Creating peer connection for:', peerId);

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketService.send({
          type: 'ice_candidate',
          target_id: peerId,
          room_id: this.currentRoomId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Connection state
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', peerId, pc.connectionState);
      this.emitEvent({
        event: 'connection_state_change',
        peerId,
        state: pc.connectionState,
      });

      if (pc.connectionState === 'connected') {
        this.emitEvent({ event: 'peer_connected', peerId });
      } else if (pc.connectionState === 'failed') {
        this.restartIce(peerId);
      }
    };

    // ICE state
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE state:', peerId, pc.iceConnectionState);
      if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            this.restartIce(peerId);
          }
        }, 5000);
      }
    };

    // Remote tracks
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track from:', peerId, event.track.kind);

      let remoteStream = this.remoteStreams.get(peerId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(peerId, remoteStream);
      }
      remoteStream.addTrack(event.track);

      this.emitEvent({
        event: 'remote_stream',
        peerId,
        stream: remoteStream,
      });
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  // Create and send SDP offer
  private async createOffer(peerId: string): Promise<void> {
    if (!this.isWebRTCAvailable) return;

    let pc = this.peerConnections.get(peerId);
    if (!pc) {
      pc = this.createPeerConnection(peerId);
    }

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.callType === 'video',
      });
      await pc.setLocalDescription(offer);

      socketService.send({
        type: 'webrtc_offer',
        target_id: peerId,
        room_id: this.currentRoomId,
        offer: pc.localDescription?.toJSON(),
      });
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
    }
  }

  // Handle incoming SDP offer
  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isWebRTCAvailable) return;

    let pc = this.peerConnections.get(peerId);
    if (!pc) {
      pc = this.createPeerConnection(peerId);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Process queued ICE candidates
      const queued = this.pendingCandidates.get(peerId) || [];
      for (const candidate of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(peerId);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socketService.send({
        type: 'webrtc_answer',
        target_id: peerId,
        room_id: this.currentRoomId,
        answer: pc.localDescription?.toJSON(),
      });
    } catch (error) {
      console.error('[WebRTC] Error handling offer:', error);
    }
  }

  // Handle incoming SDP answer
  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));

      const queued = this.pendingCandidates.get(peerId) || [];
      for (const candidate of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(peerId);
    } catch (error) {
      console.error('[WebRTC] Error handling answer:', error);
    }
  }

  // Handle incoming ICE candidate
  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);

    if (!pc || !pc.remoteDescription) {
      // Queue for later
      if (!this.pendingCandidates.has(peerId)) {
        this.pendingCandidates.set(peerId, []);
      }
      this.pendingCandidates.get(peerId)!.push(candidate);
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('[WebRTC] Error adding ICE candidate:', error);
    }
  }

  // Restart ICE for failed connection
  private async restartIce(peerId: string): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (!pc) return;

    try {
      const offer = await pc.createOffer({ iceRestart: true });
      await pc.setLocalDescription(offer);

      socketService.send({
        type: 'webrtc_offer',
        target_id: peerId,
        room_id: this.currentRoomId,
        offer: pc.localDescription?.toJSON(),
      });
    } catch (error) {
      console.error('[WebRTC] Error restarting ICE:', error);
    }
  }

  // Close a single peer connection
  private closePeerConnection(peerId: string): void {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
  }

  // ============== PUBLIC API ==============

  // Start a 1:1 call
  async startCall(targetId: string, type: 'voice' | 'video' = 'video'): Promise<string> {
    console.log('[WebRTC] Starting call to:', targetId, type);
    this.callType = type;

    if (this.isWebRTCAvailable) {
      await this.startLocalStream(type === 'video');
    }

    const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentRoomId = roomId;

    socketService.send({
      type: 'call_request',
      target_id: targetId,
      room_id: roomId,
      call_type: type,
    });

    return roomId;
  }

  // Accept an incoming call
  async acceptCall(roomId: string, callerId: string, type: 'voice' | 'video' = 'video'): Promise<void> {
    console.log('[WebRTC] Accepting call:', roomId);
    this.currentRoomId = roomId;
    this.callType = type;

    if (this.isWebRTCAvailable) {
      await this.startLocalStream(type === 'video');
    }

    // Send accept response
    socketService.send({
      type: 'call_response',
      target_id: callerId,
      room_id: roomId,
      accepted: true,
    });

    // Join the call room
    socketService.send({
      type: 'join_call',
      room_id: roomId,
    });
  }

  // Reject an incoming call
  rejectCall(roomId: string, callerId: string): void {
    socketService.send({
      type: 'call_response',
      target_id: callerId,
      room_id: roomId,
      accepted: false,
    });
  }

  // Start a group call
  async startGroupCall(participantIds: string[], type: 'voice' | 'video' = 'video', groupName: string = 'Group Call'): Promise<string> {
    this.callType = type;

    if (this.isWebRTCAvailable) {
      await this.startLocalStream(type === 'video');
    }

    const roomId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentRoomId = roomId;

    socketService.send({
      type: 'group_call_request',
      participant_ids: participantIds,
      room_id: roomId,
      call_type: type,
      group_name: groupName,
    });

    return roomId;
  }

  // Leave current call
  leaveCall(): void {
    if (this.currentRoomId) {
      socketService.send({
        type: 'leave_call',
        room_id: this.currentRoomId,
      });
    }
    this.cleanup();
  }

  // End call for everyone
  endCall(): void {
    if (this.currentRoomId) {
      socketService.send({
        type: 'end_call',
        room_id: this.currentRoomId,
      });
    }
    this.cleanup();
  }

  // Toggle mute
  toggleMute(): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.isMuted = !audioTrack.enabled;
      }
    }
    return this.isMuted;
  }

  // Toggle video
  toggleVideo(): boolean {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.isVideoOn = videoTrack.enabled;
      }
    }
    return this.isVideoOn;
  }

  // Switch camera (front/back)
  async switchCamera(): Promise<void> {
    if (!this.localStream || !this.isWebRTCAvailable) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      const constraints = videoTrack.getConstraints();
      const currentFacing = (constraints as any).facingMode || 'user';
      const newFacing = currentFacing === 'user' ? 'environment' : 'user';

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newFacing, width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace in peer connections
      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(newVideoTrack);
      });

      // Replace in local stream
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(newVideoTrack);
      videoTrack.stop();

      this.emitEvent({ event: 'local_stream_updated', stream: this.localStream });
    } catch (error) {
      console.error('[WebRTC] Error switching camera:', error);
    }
  }

  // Getters
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(peerId: string): MediaStream | undefined {
    return this.remoteStreams.get(peerId);
  }

  getAllRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  getState() {
    return {
      isMuted: this.isMuted,
      isVideoOn: this.isVideoOn,
      roomId: this.currentRoomId,
      callType: this.callType,
    };
  }

  // Event handling
  addEventListener(handler: CallEventHandler): void {
    this.eventHandlers.add(handler);
  }

  removeEventListener(handler: CallEventHandler): void {
    this.eventHandlers.delete(handler);
  }

  private emitEvent(data: CallEventData): void {
    this.eventHandlers.forEach((handler) => {
      try {
        handler(data);
      } catch (err) {
        console.error('[WebRTC] Error in event handler:', err);
      }
    });
  }

  // Cleanup media and connections
  cleanup(): void {
    console.log('[WebRTC] Cleaning up');

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    this.remoteStreams.clear();
    this.pendingCandidates.clear();
    this.currentRoomId = null;
    this.isMuted = false;
    this.isVideoOn = true;
  }
}

export const webRTCService = new WebRTCService();
