import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { useAuthStore } from '../../src/store/authStore';
import { socketService } from '../../src/services/socket';
import api from '../../src/services/api';
import { User } from '../../src/types';

export default function CallScreen() {
  const { id, type } = useLocalSearchParams<{ id: string; type?: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuthStore();
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connected' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(type === 'video');
  const [callDuration, setCallDuration] = useState(0);

  useEffect(() => {
    loadUser();
    initiateCall();

    const handleCallResponse = (data: any) => {
      if (data.from_id === id) {
        if (data.accepted) {
          setCallStatus('connected');
          // Create call record
          api.post('/calls', {
            receiver_id: id,
            call_type: type || 'voice',
          }).then(res => {
            api.put(`/calls/${res.data.id}/accept`);
          });
        } else {
          setCallStatus('ended');
          Alert.alert('Call Rejected', 'The user declined your call');
          setTimeout(() => router.back(), 1500);
        }
      }
    };

    socketService.on('call_response', handleCallResponse);

    return () => {
      socketService.off('call_response', handleCallResponse);
    };
  }, [id]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callStatus === 'connected') {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callStatus]);

  const loadUser = async () => {
    try {
      const response = await api.get(`/users/${id}`);
      setOtherUser(response.data);
    } catch (error) {
      console.error('Error loading user:', error);
    }
  };

  const initiateCall = () => {
    socketService.sendCallRequest(id!, type as 'voice' | 'video' || 'voice');
    // Simulate call being answered after 3 seconds for demo
    setTimeout(() => {
      if (callStatus === 'calling') {
        setCallStatus('connected');
      }
    }, 3000);
  };

  const endCall = async () => {
    setCallStatus('ended');
    try {
      const callRes = await api.post('/calls', {
        receiver_id: id,
        call_type: type || 'voice',
      });
      await api.put(`/calls/${callRes.data.id}/end`);
    } catch (error) {
      console.error('Error ending call:', error);
    }
    router.back();
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (callStatus) {
      case 'calling':
        return 'Calling...';
      case 'ringing':
        return 'Ringing...';
      case 'connected':
        return formatDuration(callDuration);
      case 'ended':
        return 'Call Ended';
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: '#1C1C1E' }]}>
      <View style={styles.content}>
        <View style={styles.userSection}>
          <Avatar
            source={otherUser?.profile_photo}
            name={otherUser?.display_name || ''}
            size={120}
          />
          <Text style={styles.userName}>{otherUser?.display_name}</Text>
          <Text style={styles.callStatus}>{getStatusText()}</Text>
        </View>

        {isVideoEnabled && callStatus === 'connected' && (
          <View style={styles.videoPlaceholder}>
            <Ionicons name="videocam" size={64} color="#666" />
            <Text style={styles.videoText}>Video Preview</Text>
          </View>
        )}

        <View style={styles.controls}>
          <View style={styles.controlsRow}>
            <TouchableOpacity
              style={[styles.controlButton, isMuted && styles.controlButtonActive]}
              onPress={() => setIsMuted(!isMuted)}
            >
              <Ionicons
                name={isMuted ? 'mic-off' : 'mic'}
                size={28}
                color={isMuted ? '#000' : '#FFF'}
              />
              <Text style={[styles.controlLabel, isMuted && styles.controlLabelActive]}>
                {isMuted ? 'Unmute' : 'Mute'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.controlButton, isSpeaker && styles.controlButtonActive]}
              onPress={() => setIsSpeaker(!isSpeaker)}
            >
              <Ionicons
                name={isSpeaker ? 'volume-high' : 'volume-medium'}
                size={28}
                color={isSpeaker ? '#000' : '#FFF'}
              />
              <Text style={[styles.controlLabel, isSpeaker && styles.controlLabelActive]}>
                Speaker
              </Text>
            </TouchableOpacity>

            {type === 'video' && (
              <TouchableOpacity
                style={[styles.controlButton, !isVideoEnabled && styles.controlButtonActive]}
                onPress={() => setIsVideoEnabled(!isVideoEnabled)}
              >
                <Ionicons
                  name={isVideoEnabled ? 'videocam' : 'videocam-off'}
                  size={28}
                  color={!isVideoEnabled ? '#000' : '#FFF'}
                />
                <Text style={[styles.controlLabel, !isVideoEnabled && styles.controlLabelActive]}>
                  Video
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity style={styles.endCallButton} onPress={endCall}>
            <Ionicons name="call" size={32} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingVertical: 40,
  },
  userSection: {
    alignItems: 'center',
    marginTop: 60,
  },
  userName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFF',
    marginTop: 20,
  },
  callStatus: {
    fontSize: 16,
    color: '#8E8E93',
    marginTop: 8,
  },
  videoPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 40,
    marginHorizontal: 20,
    backgroundColor: '#2C2C2E',
    borderRadius: 20,
  },
  videoText: {
    color: '#666',
    marginTop: 12,
    fontSize: 14,
  },
  controls: {
    paddingHorizontal: 40,
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 32,
    marginBottom: 40,
  },
  controlButton: {
    alignItems: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
  },
  controlButtonActive: {
    backgroundColor: '#FFF',
  },
  controlLabel: {
    color: '#FFF',
    fontSize: 11,
    marginTop: 4,
  },
  controlLabelActive: {
    color: '#000',
  },
  endCallButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#FF3B30',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    transform: [{ rotate: '135deg' }],
  },
});
