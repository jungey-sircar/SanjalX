import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform } from 'react-native';

interface WebVideoViewProps {
  stream: MediaStream | null;
  isMirrored?: boolean;
  style?: any;
  muted?: boolean;
}

/**
 * A component that renders a WebRTC MediaStream as a video element.
 * Only works on web platform.
 */
export function WebVideoView({ stream, isMirrored = false, style, muted = false }: WebVideoViewProps) {
  const containerRef = useRef<View>(null);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    // We need to access the DOM node from the View ref
    const viewNode = containerRef.current as any;
    if (!viewNode) return;

    // Get the actual DOM element (react-native-web wraps View in div)
    const domNode = viewNode as unknown as HTMLDivElement;
    if (!domNode || typeof domNode.appendChild !== 'function') return;

    // Create video element if not exists
    if (!videoElementRef.current) {
      const video = document.createElement('video');
      video.autoplay = true;
      video.playsInline = true;
      video.muted = muted;
      video.style.width = '100%';
      video.style.height = '100%';
      video.style.objectFit = 'cover';
      video.style.backgroundColor = '#1C1C1E';
      if (isMirrored) {
        video.style.transform = 'scaleX(-1)';
      }
      domNode.appendChild(video);
      videoElementRef.current = video;
    }

    // Update stream
    if (videoElementRef.current) {
      videoElementRef.current.srcObject = stream;
      videoElementRef.current.muted = muted;
      if (isMirrored) {
        videoElementRef.current.style.transform = 'scaleX(-1)';
      } else {
        videoElementRef.current.style.transform = 'none';
      }
    }

    return () => {
      // Don't remove on stream change - only on unmount
    };
  }, [stream, isMirrored, muted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (videoElementRef.current) {
        videoElementRef.current.srcObject = null;
        videoElementRef.current.remove();
        videoElementRef.current = null;
      }
    };
  }, []);

  if (Platform.OS !== 'web') {
    return <View style={[styles.container, style]} />;
  }

  return (
    <View
      ref={containerRef}
      style={[styles.container, style]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#1C1C1E',
  },
});
