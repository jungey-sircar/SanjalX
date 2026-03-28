import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { useAuthStore } from '../../src/store/authStore';
import { webRTCService } from '../../src/services/webrtc';
import api from '../../src/services/api';
import { User } from '../../src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Participant {
  id: string;
  name: string;
  photo?: string;
  stream?: MediaStream;
}

type CallStatus = 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended';

export default function CallScreen() {
  const { id, type, roomId: incomingRoomId, isIncoming, isGroup } = useLocalSearchParams<{
    id: string;
    type?: string;
    roomId?: string;
    isIncoming?: string;
    isGroup?: string;
  }>();
  
  const router = useRouter();
  const theme = useTheme();
  const { user, token } = useAuthStore();
  
  // State
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(type === 'video');
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, Participant>>(new Map());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(incomingRoomId || null);
  const [isGroupCall, setIsGroupCall] = useState(isGroup === 'true');
  
  // Refs
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const callDurationInterval = useRef<NodeJS.Timeout | null>(null);
  const callType = (type as 'voice' | 'video') || 'video';

  // Initialize WebRTC and load user info
  useEffect(() => {
    const init = async () => {
      if (!user || !token) return;

      // Load other user info for 1:1 calls
      if (id && !isGroupCall) {
        try {
          const response = await api.get(`/users/${id}`);
          setOtherUser(response.data);
        } catch (error) {
          console.error('Error loading user:', error);
        }
      }

      // Initialize WebRTC service
      try {
        await webRTCService.initialize(user.id, token);
        console.log('WebRTC initialized');
      } catch (error) {
        console.error('Error initializing WebRTC:', error);
        Alert.alert('Error', 'Failed to initialize call. Please try again.');
        router.back();
        return;
      }

      // Start or accept call based on params
      if (isIncoming === 'true' && incomingRoomId) {
        // Incoming call - accept it
        setCallStatus('connecting');
        await webRTCService.acceptCall(incomingRoomId, id!, callType);
      } else {
        // Outgoing call - start it
        setCallStatus('calling');
        const roomId = await webRTCService.startCall(id!, callType);
        setCurrentRoomId(roomId);
      }

      // Get local stream
      const stream = webRTCService.getLocalStream();
      if (stream) {
        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      }
    };

    init();

    return () => {
      // Cleanup on unmount
      if (callDurationInterval.current) {
        clearInterval(callDurationInterval.current);
      }
    };
  }, [id, user, token]);

  // WebRTC event listener
  useEffect(() => {
    const handleCallEvent = (event: string, data: any) => {
      console.log('Call event:', event, data);

      switch (event) {
        case 'call_accepted':
          setCallStatus('connecting');
          break;

        case 'call_rejected':
          setCallStatus('ended');
          Alert.alert('Call Rejected', 'The user declined your call.');
          setTimeout(() => router.back(), 1500);
          break;

        case 'joined_call':
          setCallStatus('connecting');
          // Update participants list
          if (data.participants) {
            const participants = new Map<string, Participant>();
            data.participants.forEach((p: any) => {
              participants.set(p.id, {
                id: p.id,
                name: p.name,
                photo: p.photo,
              });
            });
            setRemoteParticipants(participants);
          }
          break;

        case 'participant_joined':
          setRemoteParticipants(prev => {
            const updated = new Map(prev);
            updated.set(data.peerId, {
              id: data.peerId,
              name: data.peerName,
              photo: data.peerPhoto,
            });
            return updated;
          });
          break;

        case 'participant_left':
          setRemoteParticipants(prev => {
            const updated = new Map(prev);
            updated.delete(data.peerId);
            return updated;
          });
          // If only one left in 1:1 call, end it
          if (!isGroupCall && remoteParticipants.size === 0) {
            handleEndCall();
          }
          break;

        case 'remote_stream':
          console.log('Remote stream received for:', data.peerId);
          setRemoteParticipants(prev => {
            const updated = new Map(prev);
            const participant = updated.get(data.peerId) || { id: data.peerId, name: 'Unknown' };
            participant.stream = data.stream;
            updated.set(data.peerId, participant);
            return updated;
          });

          // Set video element source
          const videoEl = remoteVideoRefs.current.get(data.peerId);
          if (videoEl) {
            videoEl.srcObject = data.stream;
          }

          // Mark as connected once we have a remote stream
          if (callStatus !== 'connected') {
            setCallStatus('connected');
            startCallDuration();
          }
          break;

        case 'connection_state_change':
          if (data.state === 'connected' && callStatus !== 'connected') {
            setCallStatus('connected');
            startCallDuration();
          } else if (data.state === 'failed') {
            Alert.alert('Connection Failed', 'Unable to establish connection. Please try again.');
          }
          break;

        case 'call_ended':
          setCallStatus('ended');
          Alert.alert('Call Ended', 'The call has been ended.');
          setTimeout(() => router.back(), 1500);
          break;

        case 'local_stream_updated':
          setLocalStream(data.stream);
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = data.stream;
          }
          break;
      }
    };

    webRTCService.addEventListener(handleCallEvent);

    return () => {
      webRTCService.removeEventListener(handleCallEvent);
    };
  }, [callStatus, isGroupCall, remoteParticipants.size]);

  // Start call duration timer
  const startCallDuration = useCallback(() => {
    if (callDurationInterval.current) return;
    
    callDurationInterval.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  // Format duration as MM:SS
  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Get status text
  const getStatusText = (): string => {
    switch (callStatus) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Ringing...';
      case 'connecting':
        return 'Connecting...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call Ended';
      default:
        return '';
    }
  };

  // Handle end call
  const handleEndCall = () => {
    if (callDurationInterval.current) {
      clearInterval(callDurationInterval.current);
    }
    webRTCService.endCall();
    setCallStatus('ended');
    setTimeout(() => router.back(), 500);
  };

  // Handle mute toggle
  const handleToggleMute = () => {
    const muted = webRTCService.toggleMute();
    setIsMuted(muted);
  };

  // Handle video toggle
  const handleToggleVideo = () => {
    const enabled = webRTCService.toggleVideo();
    setIsVideoEnabled(enabled);
  };

  // Handle camera switch
  const handleSwitchCamera = async () => {
    await webRTCService.switchCamera();
  };

  // Set remote video ref
  const setRemoteVideoRef = (peerId: string, element: HTMLVideoElement | null) => {
    if (element) {
      remoteVideoRefs.current.set(peerId, element);
      // Set stream if already available
      const participant = remoteParticipants.get(peerId);
      if (participant?.stream) {
        element.srcObject = participant.stream;
      }
    } else {
      remoteVideoRefs.current.delete(peerId);
    }
  };

  // Calculate grid layout for multiple participants
  const getGridLayout = () => {
    const count = remoteParticipants.size + 1; // +1 for local
    if (count <= 1) return { columns: 1, rows: 1 };
    if (count <= 2) return { columns: 2, rows: 1 };
    if (count <= 4) return { columns: 2, rows: 2 };
    if (count <= 6) return { columns: 3, rows: 2 };
    return { columns: 3, rows: 3 };
  };

  const gridLayout = getGridLayout();
  const videoWidth = SCREEN_WIDTH / gridLayout.columns;
  const videoHeight = (SCREEN_HEIGHT - 200) / gridLayout.rows;

  // Render video element (Web only)
  const renderVideo = (stream: MediaStream | null, isLocal: boolean, participantId?: string) => {
    if (Platform.OS !== 'web') {
      // For native, we'd need react-native-webrtc
      return (
        <View style={[styles.videoPlaceholder, { width: videoWidth, height: videoHeight }]}>
          <Ionicons name="videocam" size={48} color="#FFF" />
          <Text style={styles.videoPlaceholderText}>
            {isLocal ? 'Your Video' : 'Remote Video'}
          </Text>
        </View>
      );
    }

    return (
      <video
        ref={isLocal ? localVideoRef : (el) => participantId && setRemoteVideoRef(participantId, el)}
        autoPlay
        playsInline
        muted={isLocal}
        style={{
          width: isGroupCall ? videoWidth : '100%',
          height: isGroupCall ? videoHeight : '100%',
          objectFit: 'cover',
          transform: isLocal ? 'scaleX(-1)' : 'none',
          backgroundColor: '#1C1C1E',
        }}
      />
    );
  };

  // Render 1:1 call UI
  const render1to1CallUI = () => (
    <View style={styles.callContainer}>
      {/* Remote video (full screen) */}
      <View style={styles.remoteVideoContainer}>
        {callStatus === 'connected' && remoteParticipants.size > 0 ? (
          (() => {
            const [participant] = remoteParticipants.values();
            return participant?.stream ? (
              renderVideo(participant.stream, false, participant.id)
            ) : (
              <View style={styles.avatarContainer}>
                <Avatar
                  source={otherUser?.profile_photo}
                  name={otherUser?.display_name || ''}
                  size={120}
                />
              </View>
            );
          })()
        ) : (
          <View style={styles.avatarContainer}>
            <Avatar
              source={otherUser?.profile_photo}
              name={otherUser?.display_name || ''}
              size={120}
            />
          </View>
        )}
      </View>

      {/* Local video (small preview) */}
      {isVideoEnabled && localStream && (
        <View style={styles.localVideoContainer}>
          {renderVideo(localStream, true)}
        </View>
      )}

      {/* User info overlay */}
      <View style={styles.userInfoOverlay}>
        <Text style={styles.userName}>{otherUser?.display_name || 'Unknown'}</Text>
        <Text style={styles.callStatusText}>{getStatusText()}</Text>
      </View>
    </View>
  );

  // Render group call UI (grid layout)
  const renderGroupCallUI = () => (
    <View style={styles.gridContainer}>
      {/* Local video */}
      <View style={[styles.gridItem, { width: videoWidth, height: videoHeight }]}>
        {isVideoEnabled && localStream ? (
          renderVideo(localStream, true)
        ) : (
          <View style={styles.avatarContainer}>
            <Avatar source={user?.profile_photo} name={user?.display_name || ''} size={60} />
            <Text style={styles.gridParticipantName}>You</Text>
          </View>
        )}
      </View>

      {/* Remote participants */}
      {Array.from(remoteParticipants.values()).map(participant => (
        <View key={participant.id} style={[styles.gridItem, { width: videoWidth, height: videoHeight }]}>
          {participant.stream ? (
            <>
              {renderVideo(participant.stream, false, participant.id)}
              <Text style={styles.gridParticipantName}>{participant.name}</Text>
            </>
          ) : (
            <View style={styles.avatarContainer}>
              <Avatar source={participant.photo} name={participant.name} size={60} />
              <Text style={styles.gridParticipantName}>{participant.name}</Text>
            </View>
          )}
        </View>
      ))}

      {/* Status overlay */}
      <View style={styles.groupStatusOverlay}>
        <Text style={styles.callStatusText}>{getStatusText()}</Text>
        <Text style={styles.participantCount}>
          {remoteParticipants.size + 1} participants
        </Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Main content */}
      {isGroupCall ? renderGroupCallUI() : render1to1CallUI()}

      {/* Loading overlay */}
      {(callStatus === 'calling' || callStatus === 'connecting') && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.loadingText}>{getStatusText()}</Text>
        </View>
      )}

      {/* Controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.controlsRow}>
          {/* Mute */}
          <TouchableOpacity
            style={[styles.controlButton, isMuted && styles.controlButtonActive]}
            onPress={handleToggleMute}
          >
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={28}
              color={isMuted ? '#000' : '#FFF'}
            />
          </TouchableOpacity>

          {/* Video toggle */}
          {callType === 'video' && (
            <TouchableOpacity
              style={[styles.controlButton, !isVideoEnabled && styles.controlButtonActive]}
              onPress={handleToggleVideo}
            >
              <Ionicons
                name={isVideoEnabled ? 'videocam' : 'videocam-off'}
                size={28}
                color={!isVideoEnabled ? '#000' : '#FFF'}
              />
            </TouchableOpacity>
          )}

          {/* Switch camera */}
          {callType === 'video' && isVideoEnabled && (
            <TouchableOpacity
              style={styles.controlButton}
              onPress={handleSwitchCamera}
            >
              <Ionicons name="camera-reverse" size={28} color="#FFF" />
            </TouchableOpacity>
          )}

          {/* Speaker */}
          <TouchableOpacity
            style={[styles.controlButton, isSpeakerOn && styles.controlButtonActive]}
            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
          >
            <Ionicons
              name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
              size={28}
              color={isSpeakerOn ? '#000' : '#FFF'}
            />
          </TouchableOpacity>
        </View>

        {/* End call button */}
        <TouchableOpacity style={styles.endCallButton} onPress={handleEndCall}>
          <Ionicons name="call" size={32} color="#FFF" style={styles.endCallIcon} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  callContainer: {
    flex: 1,
    position: 'relative',
  },
  remoteVideoContainer: {
    flex: 1,
    backgroundColor: '#2C2C2E',
  },
  localVideoContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 120,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#3C3C3E',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  avatarContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
  },
  userInfoOverlay: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  callStatusText: {
    fontSize: 16,
    color: '#AAA',
    marginTop: 4,
  },
  gridContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  gridItem: {
    backgroundColor: '#2C2C2E',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1C1C1E',
    position: 'relative',
  },
  gridParticipantName: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  groupStatusOverlay: {
    position: 'absolute',
    top: 20,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  participantCount: {
    fontSize: 14,
    color: '#AAA',
    marginTop: 4,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    fontSize: 18,
    marginTop: 16,
  },
  videoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
  },
  videoPlaceholderText: {
    color: '#888',
    fontSize: 14,
    marginTop: 8,
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginBottom: 24,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#FFF',
  },
  endCallButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
  },
  endCallIcon: {
    transform: [{ rotate: '135deg' }],
  },
});
