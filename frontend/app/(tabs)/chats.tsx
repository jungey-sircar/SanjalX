import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  SectionList,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { useAuthStore } from '../../src/store/authStore';
import { socketService } from '../../src/services/socket';
import api from '../../src/services/api';
import { Conversation } from '../../src/types';
import { format, isToday, isYesterday } from 'date-fns';

interface Group {
  id: string;
  name: string;
  creator_id: string;
  member_ids: string[];
  group_photo?: string;
  created_at: string;
}

interface ChatItem {
  type: 'direct' | 'group';
  id: string;
  name: string;
  photo?: string;
  isOnline?: boolean;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  memberCount?: number;
}

export default function ChatsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user, token } = useAuthStore();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'direct' | 'groups'>('all');

  const loadData = async () => {
    try {
      const [convRes, groupsRes] = await Promise.all([
        api.get('/conversations'),
        api.get('/groups'),
      ]);
      setConversations(convRes.data);
      setGroups(groupsRes.data);
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  useEffect(() => {
    if (user && token) {
      socketService.connect(user.id, token);

      const handleNewMessage = () => {
        loadData();
      };

      const handleGroupCreated = () => {
        loadData();
      };

      socketService.on('new_message', handleNewMessage);
      socketService.on('group_created', handleGroupCreated);
      socketService.on('added_to_group', handleGroupCreated);

      return () => {
        socketService.off('new_message', handleNewMessage);
        socketService.off('group_created', handleGroupCreated);
        socketService.off('added_to_group', handleGroupCreated);
      };
    }
  }, [user, token]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return format(date, 'HH:mm');
    } else if (isYesterday(date)) {
      return 'Yesterday';
    }
    return format(date, 'MM/dd');
  };

  const getChatItems = (): ChatItem[] => {
    const items: ChatItem[] = [];

    // Add direct conversations
    if (activeTab === 'all' || activeTab === 'direct') {
      conversations.forEach((conv) => {
        items.push({
          type: 'direct',
          id: conv.user.id,
          name: conv.user.display_name,
          photo: conv.user.profile_photo,
          isOnline: conv.user.is_online,
          lastMessage:
            conv.last_message.message_type === 'image'
              ? '📷 Photo'
              : conv.last_message.message_type === 'voice'
              ? '🎤 Voice message'
              : conv.last_message.message_type === 'gift_packet'
              ? '🧧 Gift packet'
              : conv.last_message.content,
          lastMessageTime: conv.last_message.created_at,
          unreadCount: conv.unread_count,
        });
      });
    }

    // Add groups
    if (activeTab === 'all' || activeTab === 'groups') {
      groups.forEach((group) => {
        items.push({
          type: 'group',
          id: group.id,
          name: group.name,
          photo: group.group_photo,
          memberCount: group.member_ids.length,
          lastMessageTime: group.created_at,
        });
      });
    }

    // Filter by search query
    const filtered = items.filter((item) =>
      item.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Sort by last message time
    return filtered.sort((a, b) => {
      const timeA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const timeB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      return timeB - timeA;
    });
  };

  const chatItems = getChatItems();

  const renderChatItem = ({ item }: { item: ChatItem }) => (
    <TouchableOpacity
      style={[styles.conversationItem, { backgroundColor: theme.surface }]}
      onPress={() =>
        item.type === 'group'
          ? router.push(`/group/${item.id}`)
          : router.push(`/chat/${item.id}`)
      }
    >
      <View style={styles.avatarContainer}>
        <Avatar source={item.photo} name={item.name} size={56} isOnline={item.isOnline} />
        {item.type === 'group' && (
          <View style={[styles.groupBadge, { backgroundColor: theme.primary }]}>
            <Ionicons name="people" size={12} color="#FFFFFF" />
          </View>
        )}
      </View>
      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={[styles.userName, { color: theme.text }]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.lastMessageTime && (
            <Text style={[styles.time, { color: theme.textSecondary }]}>
              {formatTime(item.lastMessageTime)}
            </Text>
          )}
        </View>
        <View style={styles.conversationFooter}>
          <Text
            style={[
              styles.lastMessage,
              { color: (item.unreadCount || 0) > 0 ? theme.text : theme.textSecondary },
            ]}
            numberOfLines={1}
          >
            {item.type === 'group'
              ? `${item.memberCount} members`
              : item.lastMessage || 'Start chatting'}
          </Text>
          {(item.unreadCount || 0) > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: theme.primary }]}>
              <Text style={styles.unreadCount}>
                {(item.unreadCount || 0) > 99 ? '99+' : item.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const TabButton = ({
    tab,
    label,
    count,
  }: {
    tab: 'all' | 'direct' | 'groups';
    label: string;
    count: number;
  }) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        activeTab === tab && { backgroundColor: theme.primary },
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <Text
        style={[
          styles.tabLabel,
          { color: activeTab === tab ? '#FFFFFF' : theme.text },
        ]}
      >
        {label}
      </Text>
      {count > 0 && (
        <View
          style={[
            styles.tabCount,
            { backgroundColor: activeTab === tab ? 'rgba(255,255,255,0.3)' : theme.surface },
          ]}
        >
          <Text
            style={[
              styles.tabCountText,
              { color: activeTab === tab ? '#FFFFFF' : theme.textSecondary },
            ]}
          >
            {count}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Chats</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.headerButton} onPress={() => router.push('/new-group')}>
            <Ionicons name="people-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search chats..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <TabButton tab="all" label="All" count={conversations.length + groups.length} />
        <TabButton tab="direct" label="Direct" count={conversations.length} />
        <TabButton tab="groups" label="Groups" count={groups.length} />
      </View>

      {chatItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons
            name={activeTab === 'groups' ? 'people-outline' : 'chatbubbles-outline'}
            size={64}
            color={theme.textSecondary}
          />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {searchQuery
              ? 'No chats found'
              : activeTab === 'groups'
              ? 'No groups yet'
              : 'No conversations yet'}
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            {activeTab === 'groups'
              ? 'Create a group to start chatting'
              : 'Start chatting with your contacts'}
          </Text>
          {activeTab === 'groups' && (
            <TouchableOpacity
              style={[styles.createGroupButton, { backgroundColor: theme.primary }]}
              onPress={() => router.push('/new-group')}
            >
              <Ionicons name="add" size={20} color="#FFFFFF" />
              <Text style={styles.createGroupText}>Create Group</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={chatItems}
          renderItem={renderChatItem}
          keyExtractor={(item) => `${item.type}-${item.id}`}
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
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    padding: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  tabCount: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabCountText: {
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 16,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
  },
  avatarContainer: {
    position: 'relative',
  },
  groupBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  conversationContent: {
    flex: 1,
    marginLeft: 12,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  time: {
    fontSize: 12,
    marginLeft: 8,
  },
  conversationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  lastMessage: {
    fontSize: 14,
    flex: 1,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    paddingHorizontal: 6,
  },
  unreadCount: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
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
  createGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 20,
    gap: 8,
  },
  createGroupText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
