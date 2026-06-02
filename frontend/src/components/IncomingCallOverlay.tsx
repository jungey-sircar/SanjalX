import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from './Avatar';
import { useCallStore } from '../store/callStore';
import { webRTCService } from '../services/webrtc';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function IncomingCallOverlay() {
  const router = useRouter();
  const { incomingCall, setIncomingCall } = useCallStore();
  const slideAnim = useRef(new Animated.Value(-300)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (incomingCall) {
      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: false,
        tension: 80,
        friction: 12,
      }).start();

      // Pulse animation for call icon
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 600,
            useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: false,
          }),
        ])
      );
      pulse.start();

      // Auto-dismiss after 30 seconds
      const timeout = setTimeout(() => {
        handleReject();
      }, 30000);

      return () => {
        pulse.stop();
        clearTimeout(timeout);
      };
    } else {
      // Slide out
      Animated.timing(slideAnim, {
        toValue: -300,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [incomingCall]);

  const handleAccept = () => {
    if (!incomingCall) return;

    const { roomId, callerId, callType } = incomingCall;
    setIncomingCall(null);

    // Navigate to call screen with incoming params
    router.push(
      `/call/${callerId}?type=${callType}&roomId=${roomId}&isIncoming=true`
    );
  };

  const handleReject = () => {
    if (!incomingCall) return;

    webRTCService.rejectCall(incomingCall.roomId, incomingCall.callerId);
    setIncomingCall(null);
  };

  if (!incomingCall) return null;

  const isVideo = incomingCall.callType === 'video';

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.card}>
        {/* Call info */}
        <View style={styles.callerInfo}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <Avatar
              name={incomingCall.callerName}
              source={incomingCall.callerPhoto}
              size={56}
            />
          </Animated.View>
          <View style={styles.textContainer}>
            <Text style={styles.callerName} numberOfLines={1}>
              {incomingCall.callerName}
            </Text>
            <Text style={styles.callTypeText}>
              <Ionicons
                name={isVideo ? 'videocam' : 'call'}
                size={14}
                color="#AAA"
              />{' '}
              Incoming {isVideo ? 'Video' : 'Voice'} Call
              {incomingCall.isGroupCall ? ` - ${incomingCall.groupName}` : ''}
            </Text>
          </View>
        </View>

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.actionButton, styles.rejectButton]}
            onPress={handleReject}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={28} color="#FFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.acceptButton]}
            onPress={handleAccept}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isVideo ? 'videocam' : 'call'}
              size={24}
              color="#FFF"
            />
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 100,
  },
  card: {
    backgroundColor: '#1E1E2E',
    borderRadius: 20,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  callerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  textContainer: {
    marginLeft: 12,
    flex: 1,
  },
  callerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
  },
  callTypeText: {
    fontSize: 13,
    color: '#AAA',
    marginTop: 3,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectButton: {
    backgroundColor: '#FF3B30',
  },
  acceptButton: {
    backgroundColor: '#34C759',
  },
});
