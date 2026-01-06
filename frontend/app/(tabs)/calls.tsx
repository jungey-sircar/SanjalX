import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import api from '../../src/services/api';
import { Call, User } from '../../src/types';
import { format, isToday, isYesterday } from 'date-fns';

interface CallWithUser extends Call {
  otherUser?: User;
}

export default function CallsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [calls, setCalls] = useState<CallWithUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadCalls = async () => {
    try {
      const response = await api.get('/calls/history');
      const callsData = response.data;
      
      // Fetch user info for each call
      const callsWithUsers = await Promise.all(
        callsData.map(async (call: Call) => {
          try {
            const meResponse = await api.get('/auth/me');
            const currentUserId = meResponse.data.id;
            const otherUserId = call.caller_id === currentUserId ? call.receiver_id : call.caller_id;
            const userResponse = await api.get(`/users/${otherUserId}`);
            return { ...call, otherUser: userResponse.data };
          } catch {
            return call;
          }
        })
      );
      
      setCalls(callsWithUsers);
    } catch (error) {
      console.error('Error loading calls:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadCalls();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadCalls();
    setRefreshing(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    }
    return format(date, 'MMM dd');
  };

  const getCallIcon = (call: Call) => {
    const isMissed = call.status === 'missed' || call.status === 'rejected';
    if (call.call_type === 'video') {
      return isMissed ? 'videocam-off' : 'videocam';
    }
    return isMissed ? 'call' : 'call';
  };

  const getCallColor = (call: Call) => {
    if (call.status === 'missed' || call.status === 'rejected') {
      return theme.error;
    }
    return theme.success;
  };

  const renderCall = ({ item }: { item: CallWithUser }) => (
    <TouchableOpacity
      style={[styles.callItem, { backgroundColor: theme.surface }]}
      onPress={() => item.otherUser && router.push(`/call/${item.otherUser.id}`)}
    >
      <Avatar
        source={item.otherUser?.profile_photo}
        name={item.otherUser?.display_name || 'Unknown'}
        size={50}
      />
      <View style={styles.callContent}>
        <Text style={[styles.userName, { color: theme.text }]}>
          {item.otherUser?.display_name || 'Unknown User'}
        </Text>
        <View style={styles.callInfo}>
          <Ionicons
            name={getCallIcon(item) as any}
            size={16}
            color={getCallColor(item)}
          />
          <Text style={[styles.callStatus, { color: theme.textSecondary }]}>
            {item.call_type === 'video' ? 'Video' : 'Voice'} • {item.status}
          </Text>
        </View>
      </View>
      <View style={styles.callMeta}>
        <Text style={[styles.callTime, { color: theme.textSecondary }]}>
          {formatTime(item.created_at)}
        </Text>
        <TouchableOpacity
          style={styles.callButton}
          onPress={() => item.otherUser && router.push(`/call/${item.otherUser.id}`)}
        >
          <Ionicons
            name={item.call_type === 'video' ? 'videocam' : 'call'}
            size={20}
            color={theme.primary}
          />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Calls</Text>
      </View>

      {calls.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="call-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No call history
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Your calls will appear here
          </Text>
        </View>
      ) : (
        <FlatList
          data={calls}
          renderItem={renderCall}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  listContent: {
    paddingBottom: 16,
  },
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
  },
  callContent: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  callInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  callStatus: {
    fontSize: 13,
    marginLeft: 6,
  },
  callMeta: {
    alignItems: 'flex-end',
  },
  callTime: {
    fontSize: 12,
    marginBottom: 8,
  },
  callButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
