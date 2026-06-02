import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { GiftPacketBubble } from '../../src/components/GiftPacketBubble';
import { SendGiftModalContent } from '../../src/components/SendGiftModal';
import { VoiceMessageBubble } from '../../src/components/VoiceMessageBubble';
import { useAuthStore } from '../../src/store/authStore';
import { socketService } from '../../src/services/socket';
import api from '../../src/services/api';
import { Message } from '../../src/types';
import { format } from 'date-fns';

interface GroupInfo {
  id: string;
  name: string;
  creator_id: string;
  admin_ids: string[];
  member_ids: string[];
  group_photo?: string;
  created_at: string;
  members: GroupMember[];
}

interface GroupMember {
  id: string;
  username: string;
  display_name: string;
  profile_photo?: string;
  is_admin: boolean;
  is_online: boolean;
}

export default function GroupChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuthStore();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [currentPlayingId, setCurrentPlayingId] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);
  const memberCache = useRef<Map<string, GroupMember>>(new Map());

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (user) {
      const handleNewMessage = (data: any) => {
        if (data.data.group_id === id) {
          setMessages(prev => [...prev, data.data]);
        }
      };

      const handleMessageSent = (data: any) => {
        if (data.data.group_id === id) {
          setMessages(prev => [...prev, data.data]);
        }
      };

      const handleGroupUpdated = (data: any) => {
        if (data.group_id === id) {
          loadGroupInfo();
        }
      };

      socketService.on('new_message', handleNewMessage);
      socketService.on('message_sent', handleMessageSent);
      socketService.on('group_updated', handleGroupUpdated);
      socketService.on('member_added', handleGroupUpdated);
      socketService.on('member_removed', handleGroupUpdated);

      return () => {
        socketService.off('new_message', handleNewMessage);
        socketService.off('message_sent', handleMessageSent);
        socketService.off('group_updated', handleGroupUpdated);
        socketService.off('member_added', handleGroupUpdated);
        socketService.off('member_removed', handleGroupUpdated);
      };
    }
  }, [user, id]);

  const loadData = async () => {
    try {
      await Promise.all([loadGroupInfo(), loadMessages()]);
    } catch (error) {
      console.error('Error loading group data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${id}`);
      setGroup(response.data);
      // Cache members for quick lookup
      response.data.members?.forEach((m: GroupMember) => {
        memberCache.current.set(m.id, m);
      });
    } catch (error) {
      console.error('Error loading group info:', error);
      Alert.alert('Error', 'Failed to load group');
      router.back();
    }
  };

  const loadMessages = async () => {
    try {
      const response = await api.get(`/groups/${id}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) return;

    const content = inputText.trim();
    setInputText('');

    try {
      await api.post(`/groups/${id}/messages`, {
        content,
        message_type: 'text',
        receiver_id: id,
      });
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handleSendImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please grant camera roll permissions.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      try {
        await api.post(`/groups/${id}/messages`, {
          content: `data:image/jpeg;base64,${result.assets[0].base64}`,
          message_type: 'image',
          receiver_id: id,
        });
      } catch (error) {
        Alert.alert('Error', 'Failed to send image');
      }
    }
  };

  const handleSendGift = async (amount: number, message: string, giftType: string, slots: number) => {
    try {
      await api.post('/gifts/send', {
        chat_id: id,
        total_amount: amount,
        gift_type: giftType,
        total_slots: slots,
        message: message || 'Sent a gift to the group!',
        is_group: true,
      });
      setShowGiftModal(false);
    } catch (error: any) {
      throw error;
    }
  };

  const handleOpenGift = (packetId: string) => {
    router.push(`/gift/${packetId}`);
  };

  const getMemberName = (senderId: string): string => {
    if (senderId === user?.id) return 'You';
    const member = memberCache.current.get(senderId);
    return member?.display_name || member?.username || 'Unknown';
  };

  const handleVoicePlayStart = (messageId: string) => {
    setCurrentPlayingId(messageId);
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.sender_id === user?.id;
    const showDate = index === 0 ||
      new Date(item.created_at).toDateString() !== new Date(messages[index - 1].created_at).toDateString();
    const senderName = getMemberName(item.sender_id);

    return (
      <View>
        {showDate && (
          <View style={styles.dateContainer}>
            <Text style={[styles.dateText, { color: theme.textSecondary }]}>
              {format(new Date(item.created_at), 'MMMM dd, yyyy')}
            </Text>
          </View>
        )}
        <View style={[styles.messageRow, isOwnMessage && styles.ownMessageRow]}>
          {!isOwnMessage && (
            <Avatar
              source={memberCache.current.get(item.sender_id)?.profile_photo}
              name={senderName}
              size={32}
            />
          )}
          {item.message_type === 'voice' ? (
            <View style={[styles.voiceContainer, isOwnMessage && styles.ownVoiceContainer]}>
              {!isOwnMessage && (
                <Text style={[styles.senderName, { color: theme.primary }]}>{senderName}</Text>
              )}
              <VoiceMessageBubble
                audioUri={item.content}
                duration={item.audio_duration || 0}
                waveform={item.audio_waveform}
                isSent={isOwnMessage}
                theme={theme}
                messageId={item.id}
                onPlayStart={handleVoicePlayStart}
                currentPlayingId={currentPlayingId}
              />
              <Text style={[styles.messageTime, { color: theme.textSecondary }]}>
                {format(new Date(item.created_at), 'HH:mm')}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.messageBubble,
                {
                  backgroundColor: isOwnMessage
                    ? theme.chatBubbleSent
                    : theme.chatBubbleReceived,
                },
                isOwnMessage && styles.ownMessageBubble,
                !isOwnMessage && styles.groupMessageBubble,
              ]}
            >
              {!isOwnMessage && (
                <Text style={[styles.senderName, { color: theme.primary }]}>{senderName}</Text>
              )}
              {item.message_type === 'image' ? (
                <TouchableOpacity>
                  <View style={styles.imageMessage}>
                    <Ionicons name="image" size={48} color={theme.textSecondary} />
                    <Text style={[styles.imageText, { color: theme.textSecondary }]}>Image</Text>
                  </View>
                </TouchableOpacity>
              ) : item.message_type === 'gift_packet' ? (
                (() => {
                  let packetData;
                  try {
                    packetData = JSON.parse(item.content);
                  } catch {
                    packetData = { packet_id: '', message: 'Gift', gift_type: 'direct', total_amount: 0, total_slots: 1, sender_name: '' };
                  }
                  return (
                    <GiftPacketBubble
                      packetData={packetData}
                      isSent={isOwnMessage}
                      onOpen={handleOpenGift}
                    />
                  );
                })()
              ) : (
                <Text style={[styles.messageText, { color: theme.text }]}>
                  {item.content}
                </Text>
              )}
              <Text style={[styles.messageTime, { color: theme.textSecondary }]}>
                {format(new Date(item.created_at), 'HH:mm')}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const isAdmin = group?.admin_ids?.includes(user?.id || '');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.groupInfo} onPress={() => router.push(`/group/info/${id}`)}>
          <Avatar
            source={group?.group_photo}
            name={group?.name || ''}
            size={40}
          />
          <View style={styles.groupText}>
            <Text style={[styles.groupName, { color: theme.text }]} numberOfLines={1}>
              {group?.name}
            </Text>
            <Text style={[styles.memberCount, { color: theme.textSecondary }]}>
              {group?.member_ids?.length} members
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push(`/group/info/${id}`)}
        >
          <Ionicons name="information-circle-outline" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
          onLayout={() => flatListRef.current?.scrollToEnd()}
        />

        <View style={[styles.inputContainer, { backgroundColor: theme.surface, borderTopColor: theme.border }]}>
          <TouchableOpacity style={styles.attachButton} onPress={() => setShowGiftModal(true)}>
            <Text style={{ fontSize: 22 }}>🧧</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.attachButton} onPress={handleSendImage}>
            <Ionicons name="image" size={24} color={theme.primary} />
          </TouchableOpacity>
          <View style={[styles.inputWrapper, { backgroundColor: theme.background }]}>
            <TextInput
              style={[styles.input, { color: theme.text }]}
              placeholder="Type a message..."
              placeholderTextColor={theme.textSecondary}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: inputText.trim() ? theme.primary : theme.textSecondary }]}
            onPress={sendMessage}
            disabled={!inputText.trim()}
          >
            <Ionicons name="send" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Gift Modal */}
      <Modal
        visible={showGiftModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowGiftModal(false)}
      >
        <SendGiftModalContent
          receiverName={group?.name || 'Group'}
          receiverId={id!}
          isGroup={true}
          groupSize={group?.member_ids?.length || 1}
          onSend={handleSendGift}
          onClose={() => setShowGiftModal(false)}
        />
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  backButton: {
    padding: 8,
  },
  groupInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  groupText: {
    marginLeft: 10,
    flex: 1,
  },
  groupName: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberCount: {
    fontSize: 12,
  },
  headerButton: {
    padding: 8,
  },
  content: {
    flex: 1,
  },
  messagesList: {
    padding: 16,
    paddingBottom: 8,
  },
  dateContainer: {
    alignItems: 'center',
    marginVertical: 16,
  },
  dateText: {
    fontSize: 12,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
  },
  ownMessageRow: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '75%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
  },
  ownMessageBubble: {
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
  },
  groupMessageBubble: {
    paddingTop: 4,
  },
  voiceContainer: {
    maxWidth: '75%',
  },
  ownVoiceContainer: {
    alignItems: 'flex-end',
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  imageMessage: {
    width: 150,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  imageText: {
    marginTop: 4,
    fontSize: 12,
  },
  messageTime: {
    fontSize: 10,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  attachButton: {
    padding: 8,
  },
  inputWrapper: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  input: {
    fontSize: 16,
    maxHeight: 80,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});
