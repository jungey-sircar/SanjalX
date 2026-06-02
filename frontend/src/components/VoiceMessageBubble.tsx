import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio, AVPlaybackStatus } from 'expo-av';

interface VoiceMessageBubbleProps {
  audioUri: string;
  duration: number;
  waveform?: number[];
  isSent: boolean;
  theme: any;
  messageId: string;
  onPlayStart?: (messageId: string) => void;
  currentPlayingId?: string | null;
}

export function VoiceMessageBubble({
  audioUri,
  duration,
  waveform,
  isSent,
  theme,
  messageId,
  onPlayStart,
  currentPlayingId,
}: VoiceMessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const progressAnim = useRef(new Animated.Value(0)).current;

  // Generate fake waveform if not provided
  const displayWaveform = waveform || Array.from({ length: 30 }, () => Math.random() * 0.8 + 0.2);

  useEffect(() => {
    // Stop playback if another message starts playing
    if (currentPlayingId && currentPlayingId !== messageId && isPlaying) {
      stopPlayback();
    }
  }, [currentPlayingId]);

  useEffect(() => {
    return () => {
      // Cleanup sound on unmount
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const stopPlayback = async () => {
    if (sound) {
      await sound.stopAsync();
      await sound.setPositionAsync(0);
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      progressAnim.setValue(0);
    }
  };

  const togglePlayback = async () => {
    try {
      if (isPlaying && sound) {
        await sound.pauseAsync();
        setIsPlaying(false);
        return;
      }

      // Notify parent that this message is starting playback
      if (onPlayStart) {
        onPlayStart(messageId);
      }

      if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
        return;
      }

      // Load and play sound
      setIsLoading(true);
      
      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
        shouldDuckAndroid: true,
      });

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: audioUri },
        { shouldPlay: true },
        onPlaybackStatusUpdate
      );

      setSound(newSound);
      setIsPlaying(true);
      setIsLoading(false);
    } catch (error) {
      console.error('Error playing voice message:', error);
      setIsLoading(false);
      setIsPlaying(false);
    }
  };

  const onPlaybackStatusUpdate = (status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    if (status.positionMillis !== undefined && status.durationMillis) {
      const prog = status.positionMillis / status.durationMillis;
      setProgress(prog);
      setCurrentTime(status.positionMillis / 1000);
      progressAnim.setValue(prog);
    }

    if (status.didJustFinish) {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      progressAnim.setValue(0);
    }
  };

  const bubbleColor = isSent ? theme.chatBubbleSent : theme.chatBubbleReceived;
  const textColor = theme.text;
  const secondaryColor = theme.textSecondary;
  const playButtonColor = isSent ? theme.primary : '#007AFF';

  return (
    <View style={[styles.container, { backgroundColor: bubbleColor }]}>
      {/* Play/Pause Button */}
      <TouchableOpacity
        style={[styles.playButton, { backgroundColor: playButtonColor }]}
        onPress={togglePlayback}
        disabled={isLoading}
      >
        {isLoading ? (
          <Animated.View style={styles.loadingIndicator}>
            <Ionicons name="ellipsis-horizontal" size={20} color="#FFF" />
          </Animated.View>
        ) : (
          <Ionicons
            name={isPlaying ? 'pause' : 'play'}
            size={20}
            color="#FFF"
            style={isPlaying ? {} : { marginLeft: 2 }}
          />
        )}
      </TouchableOpacity>

      {/* Waveform Visualization */}
      <View style={styles.waveformContainer}>
        <View style={styles.waveformBars}>
          {displayWaveform.map((height, index) => {
            const isActive = index / displayWaveform.length <= progress;
            return (
              <View
                key={index}
                style={[
                  styles.waveformBar,
                  {
                    height: Math.max(4, height * 24),
                    backgroundColor: isActive ? playButtonColor : secondaryColor,
                    opacity: isActive ? 1 : 0.4,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Duration / Current Time */}
        <Text style={[styles.durationText, { color: secondaryColor }]}>
          {isPlaying || progress > 0 ? formatTime(currentTime) : formatTime(duration)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    paddingRight: 14,
    borderRadius: 16,
    minWidth: 200,
    maxWidth: 260,
  },
  playButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  loadingIndicator: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveformContainer: {
    flex: 1,
  },
  waveformBars: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    borderRadius: 1.5,
  },
  durationText: {
    fontSize: 11,
    marginTop: 4,
  },
});
