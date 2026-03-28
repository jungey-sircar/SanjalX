import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// STUN/TURN servers configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
];

export interface Participant {
  id: string;
  name: string;
  photo?: string;
  stream?: MediaStream;
  connection?: RTCPeerConnection;
}

export interface CallState {
  status: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
  roomId: string | null;
  callType: 'voice' | 'video';
  isGroupCall: boolean;
  localStream: MediaStream | null;
  participants: Map<string, Participant>;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isSpeakerOn: boolean;
}

type CallEventCallback = (event: string, data: any) => void;

class WebRTCService {
  private socket: WebSocket | null = null;
  private userId: string | null = null;
  private token: string | null = null;
  private localStream: MediaStream | null = null;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private remoteStreams: Map<string, MediaStream> = new Map();
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  private eventCallbacks: Set<CallEventCallback> = new Set();
  private currentRoomId: string | null = null;
  private callType: 'voice' | 'video' = 'video';
  private isGroupCall: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private isMuted: boolean = false;
  private isVideoEnabled: boolean = true;

  // Initialize the service with user credentials
  async initialize(userId: string, token: string): Promise<void> {
    this.userId = userId;
    this.token = token;
    await this.connectWebSocket();
  }

  // Connect to WebSocket for signaling
  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.userId || !this.token) {
        reject(new Error('User not authenticated'));
        return;
      }

      const API_URL = Constants.expoConfig?.extra?.backendUrl || process.env.EXPO_PUBLIC_BACKEND_URL || '';
      const wsUrl = Platform.OS === 'web' 
        ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/${this.userId}?token=${this.token}`
        : `${API_URL.replace('https://', 'wss://').replace('http://', 'ws://')}/ws/${this.userId}?token=${this.token}`;

      console.log('WebRTC: Connecting to WebSocket:', wsUrl);
      this.socket = new WebSocket(wsUrl);

      this.socket.onopen = () => {
        console.log('WebRTC: WebSocket connected');
        this.reconnectAttempts = 0;
        resolve();
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleSignalingMessage(data);
        } catch (error) {
          console.error('WebRTC: Error parsing message:', error);
        }
      };

      this.socket.onclose = () => {
        console.log('WebRTC: WebSocket disconnected');
        this.handleDisconnect();
      };

      this.socket.onerror = (error) => {
        console.error('WebRTC: WebSocket error:', error);
        reject(error);
      };
    });
  }

  // Handle WebSocket disconnection with reconnection logic
  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts && this.userId && this.token) {
      this.reconnectAttempts++;
      console.log(`WebRTC: Attempting reconnect ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      setTimeout(() => {
        this.connectWebSocket().catch(console.error);
      }, 2000 * this.reconnectAttempts);
    }
  }

  // Handle incoming signaling messages
  private async handleSignalingMessage(data: any): Promise<void> {
    console.log('WebRTC: Received signaling message:', data.type);

    switch (data.type) {
      case 'incoming_call':
        this.emitEvent('incoming_call', {
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
        this.isGroupCall = data.is_group_call || false;
        this.emitEvent('room_created', {
          roomId: data.room_id,
          callType: data.call_type,
          isGroupCall: data.is_group_call,
        });
        break;

      case 'call_response':
        if (data.accepted) {
          this.emitEvent('call_accepted', {
            roomId: data.room_id,
            peerId: data.from_id,
          });
          // Create offer for the peer who accepted
          await this.createOffer(data.from_id);
        } else {
          this.emitEvent('call_rejected', {
            roomId: data.room_id,
            peerId: data.from_id,
          });
        }
        break;

      case 'joined_call':
        this.currentRoomId = data.room_id;
        this.callType = data.call_type;
        this.emitEvent('joined_call', {
          roomId: data.room_id,
          callType: data.call_type,
          participants: data.participants,
        });
        break;

      case 'participant_joined':
        this.emitEvent('participant_joined', {
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
        this.emitEvent('participant_left', {
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
        this.emitEvent('call_ended', {
          roomId: data.room_id,
          endedBy: data.ended_by,
        });
        this.cleanup();
        break;

      case 'left_call':
        this.emitEvent('left_call', { roomId: data.room_id });
        break;
    }
  }

  // Start local media capture
  async startLocalStream(isVideo: boolean = true): Promise<MediaStream> {
    try {
      const constraints: MediaStreamConstraints = {
        audio: true,
        video: isVideo ? {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        } : false,
      };

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.callType = isVideo ? 'video' : 'voice';
      this.isVideoEnabled = isVideo;
      
      console.log('WebRTC: Local stream started', {
        audioTracks: this.localStream.getAudioTracks().length,
        videoTracks: this.localStream.getVideoTracks().length,
      });

      return this.localStream;
    } catch (error) {
      console.error('WebRTC: Error starting local stream:', error);
      throw error;
    }
  }

  // Create peer connection for a specific peer
  private createPeerConnection(peerId: string): RTCPeerConnection {
    console.log('WebRTC: Creating peer connection for:', peerId);

    const peerConnection = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
    });

    // Add local tracks to peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        console.log('WebRTC: Adding local track:', track.kind);
        peerConnection.addTrack(track, this.localStream!);
      });
    }

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('WebRTC: Sending ICE candidate to:', peerId);
        this.sendSignalingMessage({
          type: 'ice_candidate',
          target_id: peerId,
          room_id: this.currentRoomId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      console.log('WebRTC: Connection state for', peerId, ':', peerConnection.connectionState);
      this.emitEvent('connection_state_change', {
        peerId,
        state: peerConnection.connectionState,
      });

      if (peerConnection.connectionState === 'failed') {
        // Attempt to restart ICE
        this.restartIce(peerId);
      }
    };

    // Handle ICE connection state changes
    peerConnection.oniceconnectionstatechange = () => {
      console.log('WebRTC: ICE connection state for', peerId, ':', peerConnection.iceConnectionState);
      
      if (peerConnection.iceConnectionState === 'disconnected') {
        // Give it some time to reconnect before declaring failure
        setTimeout(() => {
          if (peerConnection.iceConnectionState === 'disconnected') {
            this.restartIce(peerId);
          }
        }, 5000);
      }
    };

    // Handle remote tracks
    peerConnection.ontrack = (event) => {
      console.log('WebRTC: Received remote track from', peerId, ':', event.track.kind);
      
      let remoteStream = this.remoteStreams.get(peerId);
      if (!remoteStream) {
        remoteStream = new MediaStream();
        this.remoteStreams.set(peerId, remoteStream);
      }
      
      remoteStream.addTrack(event.track);
      
      this.emitEvent('remote_stream', {
        peerId,
        stream: remoteStream,
      });
    };

    this.peerConnections.set(peerId, peerConnection);
    return peerConnection;
  }

  // Create and send offer to a peer
  private async createOffer(peerId: string): Promise<void> {
    console.log('WebRTC: Creating offer for:', peerId);

    let peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      peerConnection = this.createPeerConnection(peerId);
    }

    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.callType === 'video',
      });
      
      await peerConnection.setLocalDescription(offer);
      
      this.sendSignalingMessage({
        type: 'webrtc_offer',
        target_id: peerId,
        room_id: this.currentRoomId,
        offer: peerConnection.localDescription?.toJSON(),
      });
    } catch (error) {
      console.error('WebRTC: Error creating offer:', error);
    }
  }

  // Handle incoming offer
  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    console.log('WebRTC: Handling offer from:', peerId);

    let peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      peerConnection = this.createPeerConnection(peerId);
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Process any pending ICE candidates
      const pendingCandidates = this.pendingCandidates.get(peerId) || [];
      for (const candidate of pendingCandidates) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(peerId);
      
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      
      this.sendSignalingMessage({
        type: 'webrtc_answer',
        target_id: peerId,
        room_id: this.currentRoomId,
        answer: peerConnection.localDescription?.toJSON(),
      });
    } catch (error) {
      console.error('WebRTC: Error handling offer:', error);
    }
  }

  // Handle incoming answer
  private async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    console.log('WebRTC: Handling answer from:', peerId);

    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) {
      console.error('WebRTC: No peer connection found for:', peerId);
      return;
    }

    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
      
      // Process any pending ICE candidates
      const pendingCandidates = this.pendingCandidates.get(peerId) || [];
      for (const candidate of pendingCandidates) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(peerId);
    } catch (error) {
      console.error('WebRTC: Error handling answer:', error);
    }
  }

  // Handle incoming ICE candidate
  private async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): Promise<void> {
    console.log('WebRTC: Handling ICE candidate from:', peerId);

    const peerConnection = this.peerConnections.get(peerId);
    
    if (!peerConnection || !peerConnection.remoteDescription) {
      // Queue the candidate for later
      if (!this.pendingCandidates.has(peerId)) {
        this.pendingCandidates.set(peerId, []);
      }
      this.pendingCandidates.get(peerId)!.push(candidate);
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('WebRTC: Error adding ICE candidate:', error);
    }
  }

  // Restart ICE for a peer connection
  private async restartIce(peerId: string): Promise<void> {
    console.log('WebRTC: Restarting ICE for:', peerId);

    const peerConnection = this.peerConnections.get(peerId);
    if (!peerConnection) return;

    try {
      const offer = await peerConnection.createOffer({ iceRestart: true });
      await peerConnection.setLocalDescription(offer);
      
      this.sendSignalingMessage({
        type: 'webrtc_offer',
        target_id: peerId,
        room_id: this.currentRoomId,
        offer: peerConnection.localDescription?.toJSON(),
      });
    } catch (error) {
      console.error('WebRTC: Error restarting ICE:', error);
    }
  }

  // Close peer connection
  private closePeerConnection(peerId: string): void {
    const peerConnection = this.peerConnections.get(peerId);
    if (peerConnection) {
      peerConnection.close();
      this.peerConnections.delete(peerId);
    }
    this.remoteStreams.delete(peerId);
    this.pendingCandidates.delete(peerId);
  }

  // Send signaling message via WebSocket
  private sendSignalingMessage(message: any): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('WebRTC: WebSocket not connected');
    }
  }

  // Emit event to listeners
  private emitEvent(event: string, data: any): void {
    this.eventCallbacks.forEach(callback => callback(event, data));
  }

  // ============== Public API ==============

  // Start a 1:1 call
  async startCall(targetId: string, callType: 'voice' | 'video' = 'video'): Promise<string> {
    console.log('WebRTC: Starting call to:', targetId, 'type:', callType);

    this.callType = callType;
    this.isGroupCall = false;

    // Start local stream
    await this.startLocalStream(callType === 'video');

    // Generate room ID
    const roomId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentRoomId = roomId;

    // Send call request
    this.sendSignalingMessage({
      type: 'call_request',
      target_id: targetId,
      room_id: roomId,
      call_type: callType,
    });

    return roomId;
  }

  // Start a group call
  async startGroupCall(participantIds: string[], callType: 'voice' | 'video' = 'video', groupName: string = 'Group Call'): Promise<string> {
    console.log('WebRTC: Starting group call with:', participantIds);

    this.callType = callType;
    this.isGroupCall = true;

    // Start local stream
    await this.startLocalStream(callType === 'video');

    // Generate room ID
    const roomId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.currentRoomId = roomId;

    // Send group call request
    this.sendSignalingMessage({
      type: 'group_call_request',
      participant_ids: participantIds,
      room_id: roomId,
      call_type: callType,
      group_name: groupName,
    });

    return roomId;
  }

  // Accept an incoming call
  async acceptCall(roomId: string, callerId: string, callType: 'voice' | 'video' = 'video'): Promise<void> {
    console.log('WebRTC: Accepting call:', roomId);

    this.currentRoomId = roomId;
    this.callType = callType;

    // Start local stream
    await this.startLocalStream(callType === 'video');

    // Send accept response
    this.sendSignalingMessage({
      type: 'call_response',
      target_id: callerId,
      room_id: roomId,
      accepted: true,
    });

    // Join the call room
    this.sendSignalingMessage({
      type: 'join_call',
      room_id: roomId,
    });
  }

  // Reject an incoming call
  rejectCall(roomId: string, callerId: string): void {
    console.log('WebRTC: Rejecting call:', roomId);

    this.sendSignalingMessage({
      type: 'call_response',
      target_id: callerId,
      room_id: roomId,
      accepted: false,
    });
  }

  // Join an existing group call
  async joinGroupCall(roomId: string, callType: 'voice' | 'video' = 'video'): Promise<void> {
    console.log('WebRTC: Joining group call:', roomId);

    this.currentRoomId = roomId;
    this.callType = callType;
    this.isGroupCall = true;

    // Start local stream
    await this.startLocalStream(callType === 'video');

    // Join the call room
    this.sendSignalingMessage({
      type: 'join_call',
      room_id: roomId,
    });
  }

  // Leave current call
  leaveCall(): void {
    console.log('WebRTC: Leaving call:', this.currentRoomId);

    if (this.currentRoomId) {
      this.sendSignalingMessage({
        type: 'leave_call',
        room_id: this.currentRoomId,
      });
    }

    this.cleanup();
  }

  // End current call (ends for all participants)
  endCall(): void {
    console.log('WebRTC: Ending call:', this.currentRoomId);

    if (this.currentRoomId) {
      this.sendSignalingMessage({
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
        return this.isMuted;
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
        this.isVideoEnabled = videoTrack.enabled;
        return this.isVideoEnabled;
      }
    }
    return this.isVideoEnabled;
  }

  // Switch camera (front/back)
  async switchCamera(): Promise<void> {
    if (!this.localStream) return;

    const videoTrack = this.localStream.getVideoTracks()[0];
    if (!videoTrack) return;

    try {
      // Get current facing mode
      const constraints = videoTrack.getConstraints();
      const currentFacingMode = (constraints as any).facingMode || 'user';
      const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

      // Get new stream with switched camera
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newFacingMode,
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      const newVideoTrack = newStream.getVideoTracks()[0];

      // Replace track in all peer connections
      this.peerConnections.forEach((pc) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(newVideoTrack);
        }
      });

      // Replace track in local stream
      this.localStream.removeTrack(videoTrack);
      this.localStream.addTrack(newVideoTrack);
      videoTrack.stop();

      this.emitEvent('local_stream_updated', { stream: this.localStream });
    } catch (error) {
      console.error('WebRTC: Error switching camera:', error);
    }
  }

  // Get local stream
  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  // Get remote stream for a peer
  getRemoteStream(peerId: string): MediaStream | undefined {
    return this.remoteStreams.get(peerId);
  }

  // Get all remote streams
  getAllRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams;
  }

  // Get current call state
  getCallState(): { isMuted: boolean; isVideoEnabled: boolean; roomId: string | null; isGroupCall: boolean } {
    return {
      isMuted: this.isMuted,
      isVideoEnabled: this.isVideoEnabled,
      roomId: this.currentRoomId,
      isGroupCall: this.isGroupCall,
    };
  }

  // Add event listener
  addEventListener(callback: CallEventCallback): void {
    this.eventCallbacks.add(callback);
  }

  // Remove event listener
  removeEventListener(callback: CallEventCallback): void {
    this.eventCallbacks.delete(callback);
  }

  // Cleanup all resources
  cleanup(): void {
    console.log('WebRTC: Cleaning up');

    // Close all peer connections
    this.peerConnections.forEach((pc, peerId) => {
      pc.close();
    });
    this.peerConnections.clear();

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Clear remote streams
    this.remoteStreams.clear();
    this.pendingCandidates.clear();

    // Reset state
    this.currentRoomId = null;
    this.isMuted = false;
    this.isVideoEnabled = true;
  }

  // Disconnect completely
  disconnect(): void {
    this.cleanup();
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.userId = null;
    this.token = null;
    this.eventCallbacks.clear();
  }
}

// Export singleton instance
export const webRTCService = new WebRTCService();
