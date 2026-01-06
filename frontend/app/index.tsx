import React, { useEffect } from 'react';
import { View, StyleSheet, Image, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { useTheme } from '../src/hooks/useTheme';
import { LoadingScreen } from '../src/components/LoadingScreen';
import { Ionicons } from '@expo/vector-icons';

export default function Index() {
  const router = useRouter();
  const theme = useTheme();
  const { isLoading, isAuthenticated } = useAuthStore();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.replace('/(tabs)/chats');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [isLoading, isAuthenticated]);

  return (
    <View style={[styles.container, { backgroundColor: theme.primary }]}>
      <View style={styles.logoContainer}>
        <Ionicons name="chatbubbles" size={80} color="#FFFFFF" />
        <Text style={styles.title}>ConnectX</Text>
        <Text style={styles.subtitle}>Stay Connected</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 16,
  },
  subtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },
});
