import React, { useEffect, useState, useCallback, useRef } from 'react';
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
import { WebVideoView } from '../../src/components/WebVideoView';
import { useAuthStore } from '../../src/store/authStore';
import { useCallStore } from '../../src/store/callStore';
import { webRTCService } from '../../src/services/webrtc';
import api from '../../src/services/api';
import { User } from '../../src/types';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface Participant {
  id: string;
  name: string;
  photo?: string;
  stream?: MediaStream | null;
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
  const { setActiveCall, resetCall } = useCallStore();

  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [callStatus, setCallStatus] = useState<CallStatus>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(type === 'video');
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteParticipants, setRemoteParticipants] = useState<Map<string, Participant>>(new Map());
  const [currentRoomId, setCurrentRoomId] = useState<string | null>(incomingRoomId || null);
  const [isGroupCall] = useState(isGroup === 'true');

  const callDurationInterval = useRef<ReturnType<typeof setInterval> | null>(null);
  const callType = (type as 'voice' | 'video') || 'video';
  const hasWebRTC = webRTCService.isWebRTCAvailable;

  // Initialize call
  useEffect(() => {
    const init = async () => {
      if (!user || !token || !id) return;

      // Load other user info
      if (!isGroupCall) {
        try {
          const response = await api.get(`/users/${id}`);
          setOtherUser(response.data);
        } catch (error) {
          console.error('Error loading user:', error);
        }
      }

      // Start or accept call
      try {
        if (isIncoming === 'true' && incomingRoomId) {
          setCallStatus('connecting');
          await webRTCService.acceptCall(incomingRoomId, id, callType);
          setActiveCall(incomingRoomId, callType);
        } else {
          setCallStatus('calling');
          const roomId = await webRTCService.startCall(id, callType);
          setCurrentRoomId(roomId);
          setActiveCall(roomId, callType);
        }

        // Set local stream (may be null if media failed)
        const stream = webRTCService.getLocalStream();
        setLocalStream(stream);
        if (!stream && hasWebRTC) {
          setIsVideoEnabled(false);
        }
      } catch (error) {
        console.error('Error starting call:', error);
      }
    };

    init();

    return () => {
      if (callDurationInterval.current) {
        clearInterval(callDurationInterval.current);
      }
    };
  }, [id, user, token]);

  // WebRTC event listener
  useEffect(() => {
    const handleCallEvent = (data: any) => {
      const event = data.event;
      console.log('[CallScreen] Event:', event, data);

      switch (event) {
        case 'call_accepted':
          setCallStatus('connecting');
          break;

        case 'call_rejected':
          setCallStatus('ended');
          Alert.alert('Call Declined', 'The user declined your call.');
          setTimeout(() => goBack(), 1500);
          break;

        case 'joined_call':
          setCallStatus('connecting');
          if (data.participants) {
            const participants = new Map<string, Participant>();
            data.participants.forEach((p: any) => {
              participants.set(p.id, { id: p.id, name: p.name, photo: p.photo, stream: null });
            });
            setRemoteParticipants(participants);
          }
          break;

        case 'participant_joined':
          setRemoteParticipants((prev) => {
            const updated = new Map(prev);
            updated.set(data.peerId, {
              id: data.peerId,
              name: data.peerName || 'Unknown',
              photo: data.peerPhoto,
              stream: null,
            });
            return updated;
          });
          break;

        case 'participant_left':
          setRemoteParticipants((prev) => {
            const updated = new Map(prev);
            updated.delete(data.peerId);
            return updated;
          });
          break;

        case 'remote_stream':
          setRemoteParticipants((prev) => {
            const updated = new Map(prev);
            const existing = updated.get(data.peerId) || { id: data.peerId, name: 'Unknown', stream: null };
            existing.stream = data.stream;
            updated.set(data.peerId, { ...existing });
            return updated;
          });

          if (callStatus !== 'connected') {
            setCallStatus('connected');
            startDurationTimer();
          }
          break;

        case 'peer_connected':
          if (callStatus !== 'connected') {
            setCallStatus('connected');
            startDurationTimer();
          }
          break;

        case 'connection_state_change':
          if (data.state === 'connected' && callStatus !== 'connected') {
            setCallStatus('connected');
            startDurationTimer();
          }
          break;

        case 'call_ended':
          setCallStatus('ended');
          Alert.alert('Call Ended', 'The call has been ended.');
          setTimeout(() => goBack(), 1000);
          break;

        case 'local_stream_updated':
          setLocalStream(data.stream);
          break;
      }
    };

    webRTCService.addEventListener(handleCallEvent);
    return () => {
      webRTCService.removeEventListener(handleCallEvent);
    };
  }, [callStatus, isGroupCall]);

  const startDurationTimer = useCallback(() => {
    if (callDurationInterval.current) return;
    callDurationInterval.current = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = (): string => {
    switch (callStatus) {
      case 'calling': return 'Calling...';
      case 'ringing': return 'Ringing...';
      case 'connecting': return 'Connecting...';
      case 'connected': return formatDuration(callDuration);
      case 'ended': return 'Call Ended';
      default: return '';
    }
  };

  const goBack = () => {
    resetCall();
    router.back();
  };

  const handleEndCall = () => {
    if (callDurationInterval.current) {
      clearInterval(callDurationInterval.current);
    }
    webRTCService.endCall();
    setCallStatus('ended');
    setTimeout(() => goBack(), 300);
  };

  const handleToggleMute = () => {
    const muted = webRTCService.toggleMute();
    setIsMuted(muted);
  };

  const handleToggleVideo = () => {
    const enabled = webRTCService.toggleVideo();
    setIsVideoEnabled(enabled);
  };

  const handleSwitchCamera = async () => {
    await webRTCService.switchCamera();
  };

  // ============== RENDER ==============

  // Render avatar placeholder (for voice calls or when no video)
  const renderAvatarView = (name: string, photo?: string | null, size: number = 120) => (
    <View style={styles.avatarContainer}>
      <Avatar source={photo} name={name} size={size} />
    </View>
  );

  // Render 1:1 call
  const render1to1Call = () => {
    const remoteArr = Array.from(remoteParticipants.values());
    const remoteParticipant = remoteArr[0];
    const hasRemoteStream = remoteParticipant?.stream;
    const showRemoteVideo = callType === 'video' && hasRemoteStream && callStatus === 'connected' && hasWebRTC;
    const showLocalVideo = callType === 'video' && isVideoEnabled && localStream && hasWebRTC;

    return (
      <View style={styles.callContainer}>
        {/* Remote video / avatar (full screen) */}
        <View style={styles.remoteArea}>
          {showRemoteVideo ? (
            <WebVideoView
              stream={remoteParticipant.stream!}
              style={styles.fullVideo}
            />
          ) : (
            renderAvatarView(
              otherUser?.display_name || 'Unknown',
              otherUser?.profile_photo
            )
          )}
        </View>

        {/* Local video preview (small, top-right) */}
        {showLocalVideo && (
          <View style={styles.localVideoPreview}>
            <WebVideoView
              stream={localStream}
              isMirrored
              muted
              style={styles.localVideo}
            />
          </View>
        )}

        {/* User info overlay */}
        <View style={styles.userInfoOverlay}>
          <Text style={styles.userName}>
            {otherUser?.display_name || 'Unknown'}
          </Text>
          <Text style={styles.statusText}>{getStatusText()}</Text>
        </View>
      </View>
    );
  };

  // Render group call (grid)
  const renderGroupCall = () => {
    const participants = Array.from(remoteParticipants.values());
    const totalCount = participants.length + 1;
    const cols = totalCount <= 2 ? totalCount : totalCount <= 4 ? 2 : 3;
    const itemWidth = SCREEN_WIDTH / cols;
    const rows = Math.ceil(totalCount / cols);
    const itemHeight = (SCREEN_HEIGHT - 180) / rows;

    return (
      <View style={styles.gridContainer}>
        {/* Self */}
        <View style={[styles.gridItem, { width: itemWidth, height: itemHeight }]}>
          {callType === 'video' && isVideoEnabled && localStream && hasWebRTC ? (
            <WebVideoView stream={localStream} isMirrored muted style={styles.fullVideo} />
          ) : (
            renderAvatarView(user?.display_name || 'You', user?.profile_photo, 60)
          )}
          <View style={styles.gridNameBadge}>
            <Text style={styles.gridNameText}>You</Text>
          </View>
        </View>

        {/* Remote participants */}
        {participants.map((p) => (
          <View key={p.id} style={[styles.gridItem, { width: itemWidth, height: itemHeight }]}>
            {p.stream && hasWebRTC ? (
              <WebVideoView stream={p.stream} style={styles.fullVideo} />
            ) : (
              renderAvatarView(p.name, p.photo, 60)
            )}
            <View style={styles.gridNameBadge}>
              <Text style={styles.gridNameText}>{p.name}</Text>
            </View>
          </View>
        ))}

        <View style={styles.groupInfoOverlay}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          <Text style={styles.participantCount}>{totalCount} participants</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Main content */}
      {isGroupCall ? renderGroupCall() : render1to1Call()}

      {/* WebRTC unavailable notice */}
      {!hasWebRTC && Platform.OS !== 'web' && (
        <View style={styles.noticeOverlay}>
          <Ionicons name="information-circle" size={24} color="#FFA500" />
          <Text style={styles.noticeText}>
            Video calls require the installed app. Call signaling is active.
          </Text>
        </View>
      )}

      {/* Loading spinner during connecting */}
      {(callStatus === 'calling' || callStatus === 'connecting') && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={styles.loadingText}>{getStatusText()}</Text>
        </View>
      )}

      {/* Call controls */}
      <View style={styles.controlsContainer}>
        <View style={styles.controlsRow}>
          {/* Mute */}
          <TouchableOpacity
            style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
            onPress={handleToggleMute}
          >
            <Ionicons
              name={isMuted ? 'mic-off' : 'mic'}
              size={26}
              color={isMuted ? '#000' : '#FFF'}
            />
            <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>
              {isMuted ? 'Unmute' : 'Mute'}
            </Text>
          </TouchableOpacity>

          {/* Video toggle */}
          {callType === 'video' && (
            <TouchableOpacity
              style={[styles.controlBtn, !isVideoEnabled && styles.controlBtnActive]}
              onPress={handleToggleVideo}
            >
              <Ionicons
                name={isVideoEnabled ? 'videocam' : 'videocam-off'}
                size={26}
                color={!isVideoEnabled ? '#000' : '#FFF'}
              />
              <Text style={[styles.controlLabel, !isVideoEnabled && styles.controlLabelActive]}>
                Camera
              </Text>
            </TouchableOpacity>
          )}

          {/* Switch camera */}
          {callType === 'video' && isVideoEnabled && hasWebRTC && (
            <TouchableOpacity style={styles.controlBtn} onPress={handleSwitchCamera}>
              <Ionicons name="camera-reverse" size={26} color="#FFF" />
              <Text style={styles.controlLabel}>Flip</Text>
            </TouchableOpacity>
          )}

          {/* Speaker */}
          <TouchableOpacity
            style={[styles.controlBtn, isSpeakerOn && styles.controlBtnActive]}
            onPress={() => setIsSpeakerOn(!isSpeakerOn)}
          >
            <Ionicons
              name={isSpeakerOn ? 'volume-high' : 'volume-medium'}
              size={26}
              color={isSpeakerOn ? '#000' : '#FFF'}
            />
            <Text style={[styles.controlLabel, isSpeakerOn && styles.controlLabelActive]}>
              Speaker
            </Text>
          </TouchableOpacity>
        </View>

        {/* End call */}
        <TouchableOpacity style={styles.endCallBtn} onPress={handleEndCall}>
          <Ionicons name="call" size={30} color="#FFF" style={{ transform: [{ rotate: '135deg' }] }} />
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
  },
  remoteArea: {
    flex: 1,
    backgroundColor: '#2C2C2E',
  },
  fullVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  avatarContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#2C2C2E',
  },
  localVideoPreview: {
    position: 'absolute',
    top: 16,
    right: 16,
    width: 110,
    height: 150,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#3C3C3E',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  localVideo: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  userInfoOverlay: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  statusText: {
    fontSize: 15,
    color: '#CCC',
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
    overflow: 'hidden',
  },
  gridNameBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  gridNameText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
  },
  groupInfoOverlay: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  participantCount: {
    fontSize: 13,
    color: '#AAA',
    marginTop: 2,
  },
  noticeOverlay: {
    position: 'absolute',
    top: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(255,165,0,0.15)',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  noticeText: {
    color: '#FFA500',
    fontSize: 13,
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#FFF',
    fontSize: 18,
    marginTop: 16,
    fontWeight: '500',
  },
  controlsContainer: {
    position: 'absolute',
    bottom: 30,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 20,
  },
  controlBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlBtnActive: {
    backgroundColor: '#FFF',
  },
  controlLabel: {
    color: '#CCC',
    fontSize: 10,
    marginTop: 2,
    fontWeight: '500',
  },
  controlLabelActive: {
    color: '#333',
  },
  endCallBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
});
