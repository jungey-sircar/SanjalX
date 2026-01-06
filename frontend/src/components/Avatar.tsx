import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface AvatarProps {
  source?: string | null;
  name?: string;
  size?: number;
  isOnline?: boolean;
}

export function Avatar({ source, name = '', size = 48, isOnline }: AvatarProps) {
  const theme = useTheme();
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const backgroundColor = getColorFromName(name);

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {source ? (
        <Image
          source={{ uri: source.startsWith('data:') ? source : `data:image/jpeg;base64,${source}` }}
          style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
        />
      ) : (
        <View
          style={[
            styles.placeholder,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor
            }
          ]}
        >
          <Text style={[styles.initials, { fontSize: size / 2.5, color: '#FFFFFF' }]}>
            {initials || '?'}
          </Text>
        </View>
      )}
      {isOnline !== undefined && (
        <View
          style={[
            styles.onlineIndicator,
            {
              backgroundColor: isOnline ? theme.success : theme.textSecondary,
              borderColor: theme.surface
            }
          ]}
        />
      )}
    </View>
  );
}

function getColorFromName(name: string): string {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  image: {
    resizeMode: 'cover',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    fontWeight: '600',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
});
