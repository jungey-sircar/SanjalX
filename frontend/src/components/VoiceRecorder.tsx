import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  PanResponder,
  Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';

interface VoiceRecorderProps {
  onRecordingComplete: (audioUri: string, duration: number, waveform: number[]) => void;
  onCancel: () => void;
  theme: any;
  maxDuration?: number;
}

export function VoiceRecorder({
  onRecordingComplete,
  onCancel,
  theme,
  maxDuration = 60,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationInterval = useRef<NodeJS.Timeout | null>(null);
  const startTime = useRef<number>(0);
  const waveformData = useRef<number[]>([]);
  
  // Animations
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Start recording immediately when component mounts
    startRecording();
    
    // Pulse animation for recording indicator
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    return () => {
      stopRecording(true);
      if (durationInterval.current) {
        clearInterval(durationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    // Auto-stop at max duration
    if (duration >= maxDuration) {
      stopRecording(false);
    }
  }, [duration, maxDuration]);

  const startRecording = async () => {
    try {
      // Request permissions
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Microphone access is required to record voice messages.',
          [{ text: 'OK', onPress: onCancel }]
        );
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      // Start recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
        onRecordingStatusUpdate
      );

      recordingRef.current = recording;
      setIsRecording(true);
      startTime.current = Date.now();
      waveformData.current = [];

      // Start duration timer
      durationInterval.current = setInterval(() => {
        const elapsed = (Date.now() - startTime.current) / 1000;
        setDuration(elapsed);
        // Simulate waveform data based on random values
        waveformData.current.push(Math.random() * 0.8 + 0.2);
      }, 100);

    } catch (error) {
      console.error('Failed to start recording:', error);
      Alert.alert('Error', 'Failed to start recording. Please try again.');
      onCancel();
    }
  };

  const onRecordingStatusUpdate = (status: Audio.RecordingStatus) => {
    // Can be used to get metering info for waveform
    if (status.metering !== undefined) {
      // Normalize metering value to 0-1 range
      const normalized = Math.max(0, Math.min(1, (status.metering + 60) / 60));
      waveformData.current.push(normalized);
    }
  };

  const stopRecording = async (cancelled: boolean) => {
    if (!recordingRef.current) return;

    if (durationInterval.current) {
      clearInterval(durationInterval.current);
      durationInterval.current = null;
    }

    try {
      await recordingRef.current.stopAndUnloadAsync();
      
      if (cancelled || duration < 1) {
        // Recording cancelled or too short
        recordingRef.current = null;
        setIsRecording(false);
        onCancel();
        return;
      }

      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      setIsRecording(false);

      if (uri) {
        // Downsample waveform to 30 bars
        const downsampledWaveform = downsampleWaveform(waveformData.current, 30);
        onRecordingComplete(uri, duration, downsampledWaveform);
      } else {
        onCancel();
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      onCancel();
    }
  };

  const downsampleWaveform = (data: number[], targetLength: number): number[] => {
    if (data.length <= targetLength) {
      return [...data, ...Array(targetLength - data.length).fill(0.2)];
    }
    
    const result: number[] = [];
    const chunkSize = Math.floor(data.length / targetLength);
    
    for (let i = 0; i < targetLength; i++) {
      const start = i * chunkSize;
      const end = start + chunkSize;
      const chunk = data.slice(start, end);
      const avg = chunk.reduce((a, b) => a + b, 0) / chunk.length;
      result.push(avg);
    }
    
    return result;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        // Slide left to cancel
        if (gestureState.dx < -50) {
          setIsCancelling(true);
          slideAnim.setValue(gestureState.dx);
          opacityAnim.setValue(Math.max(0.3, 1 + gestureState.dx / 150));
        } else {
          setIsCancelling(false);
          slideAnim.setValue(0);
          opacityAnim.setValue(1);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx < -100) {
          // Cancelled
          stopRecording(true);
        } else {
          // Send
          stopRecording(false);
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <Animated.View
        style={[
          styles.contentContainer,
          {
            transform: [{ translateX: slideAnim }],
            opacity: opacityAnim,
          },
        ]}
        {...panResponder.panHandlers}
      >
        {/* Recording indicator */}
        <Animated.View
          style={[
            styles.recordIndicator,
            {
              transform: [{ scale: pulseAnim }],
            },
          ]}
        >
          <View style={styles.recordDot} />
        </Animated.View>

        {/* Duration */}
        <Text style={[styles.durationText, { color: theme.text }]}>
          {formatTime(duration)}
        </Text>

        {/* Waveform visualization */}
        <View style={styles.waveformContainer}>
          {Array.from({ length: 20 }).map((_, index) => {
            const height = waveformData.current[waveformData.current.length - 20 + index] || 0.2;
            return (
              <Animated.View
                key={index}
                style={[
                  styles.waveBar,
                  {
                    height: Math.max(4, height * 24),
                    backgroundColor: '#FF3B30',
                    opacity: 0.6 + index * 0.02,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Cancel hint */}
        <View style={styles.cancelHint}>
          <Ionicons
            name="arrow-back"
            size={16}
            color={isCancelling ? '#FF3B30' : theme.textSecondary}
          />
          <Text
            style={[
              styles.cancelText,
              { color: isCancelling ? '#FF3B30' : theme.textSecondary },
            ]}
          >
            {isCancelling ? 'Release to cancel' : 'Slide to cancel'}
          </Text>
        </View>
      </Animated.View>

      {/* Release to send hint */}
      <View style={styles.sendHint}>
        <Ionicons name="mic" size={20} color="#FF3B30" />
        <Text style={[styles.sendText, { color: theme.textSecondary }]}>
          Release to send
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.1)',
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  recordIndicator: {
    marginRight: 10,
  },
  recordDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF3B30',
  },
  durationText: {
    fontSize: 16,
    fontWeight: '600',
    minWidth: 50,
    marginRight: 12,
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
  },
  waveBar: {
    width: 3,
    borderRadius: 1.5,
  },
  cancelHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cancelText: {
    fontSize: 12,
  },
  sendHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 4,
  },
  sendText: {
    fontSize: 12,
  },
});
