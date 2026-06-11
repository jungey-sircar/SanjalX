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
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { GiftPacketBubble } from '../../src/components/GiftPacketBubble';
import { SendGiftModalContent } from '../../src/components/SendGiftModal';
import { useAuthStore } from '../../src/store/authStore';
import { socketService } from '../../src/services/socket';
import api from '../../src/services/api';
import { Message, User } from '../../src/types';
import { format } from 'date-fns';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { user, token } = useAuthStore();
  const [otherUser, setOtherUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    if (user && token) {
      const handleNewMessage = (data: any) => {
        if (data.data.sender_id === id || data.data.receiver_id === id) {
          setMessages(prev => [...prev, data.data]);
        }
      };

      const handleMessageSent = (data: any) => {
        if (data.data.receiver_id === id) {
          setMessages(prev => [...prev, data.data]);
        }
      };

      const handleTyping = (data: any) => {
        if (data.user_id === id) {
          setIsTyping(true);
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsTyping(false);
          }, 3000);
        }
      };

      socketService.on('new_message', handleNewMessage);
      socketService.on('message_sent', handleMessageSent);
      socketService.on('typing', handleTyping);

      return () => {
        socketService.off('new_message', handleNewMessage);
        socketService.off('message_sent', handleMessageSent);
        socketService.off('typing', handleTyping);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }
      };
    }
  }, [user, token, id]);

  const loadData = async () => {
    try {
      const [userRes, messagesRes] = await Promise.all([
        api.get(`/users/${id}`),
        api.get(`/messages/${id}`),
      ]);
      setOtherUser(userRes.data);
      setMessages(messagesRes.data);
    } catch (error) {
      console.error('Error loading chat:', error);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = (content: string, type: string = 'text') => {
    if (!content.trim()) return;
    
    socketService.sendMessage(id!, content, type);
    setInputText('');
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
      sendMessage(`data:image/jpeg;base64,${result.assets[0].base64}`, 'image');
    }
  };

  const handleTranslate = async (message: Message, targetLang: string) => {
    try {
      const response = await api.post('/translate', {
        text: message.content,
        target_language: targetLang,
      });
      
      setMessages(prev =>
        prev.map(m =>
          m.id === message.id
            ? { ...m, translated_content: response.data.translated }
            : m
        )
      );
    } catch (error) {
      Alert.alert('Translation Error', 'Failed to translate message');
    }
  };

  const handleSendGift = async (amount: number, message: string, giftType: string, slots: number) => {
    try {
      await api.post('/gifts/send', {
        chat_id: id,
        total_amount: amount,
        gift_type: giftType,
        total_slots: slots,
        message: message || 'Sent you a gift!',
        is_group: false,
      });
      setShowGiftModal(false);
      // Reload messages to show the gift packet message
      try {
        const messagesRes = await api.get(`/messages/${id}`);
        setMessages(messagesRes.data);
      } catch (err) {
        console.error('Error reloading messages:', err);
      }
    } catch (error: any) {
      throw error; // Let modal handle it
    }
  };

  const handleOpenGift = (packetId: string) => {
    router.push(`/gift/${packetId}`);
  };

  const handleInputChange = (text: string) => {
    setInputText(text);
    if (text.length > 0) {
      socketService.sendTyping(id!);
    }
  };

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isOwnMessage = item.sender_id === user?.id;
    const showDate = index === 0 || 
      new Date(item.created_at).toDateString() !== new Date(messages[index - 1].created_at).toDateString();

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
          <View
            style={[
              styles.messageBubble,
              {
                backgroundColor: isOwnMessage
                  ? theme.chatBubbleSent
                  : theme.chatBubbleReceived,
              },
              isOwnMessage && styles.ownMessageBubble,
            ]}
          >
            {item.message_type === 'image' ? (
              <TouchableOpacity>
                <View style={styles.imageMessage}>
                  <Ionicons name="image" size={48} color={theme.textSecondary} />
                  <Text style={[styles.imageText, { color: theme.textSecondary }]}>
                    Image
                  </Text>
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
              <>
                <Text style={[styles.messageText, { color: theme.text }]}>
                  {item.content}
                </Text>
                {item.translated_content && (
                  <View style={[styles.translatedContainer, { borderTopColor: theme.border }]}>
                    <Text style={[styles.translatedLabel, { color: theme.textSecondary }]}>
                      Translated:
                    </Text>
                    <Text style={[styles.translatedText, { color: theme.text }]}>
                      {item.translated_content}
                    </Text>
                  </View>
                )}
              </>
            )}
            <View style={styles.messageFooter}>
              <Text style={[styles.messageTime, { color: theme.textSecondary }]}>
                {format(new Date(item.created_at), 'HH:mm')}
              </Text>
              {isOwnMessage && (
                <Ionicons
                  name={item.read ? 'checkmark-done' : 'checkmark'}
                  size={14}
                  color={item.read ? theme.primary : theme.textSecondary}
                  style={styles.checkmark}
                />
              )}
            </View>
          </View>
          {!isOwnMessage && item.message_type === 'text' && !item.translated_content && (
            <TouchableOpacity
              style={styles.translateButton}
              onPress={() => {
                Alert.alert(
                  'Translate to',
                  'Choose language',
                  [
                    { text: 'English', onPress: () => handleTranslate(item, 'en') },
                    { text: 'Nepali', onPress: () => handleTranslate(item, 'ne') },
                    { text: 'Hindi', onPress: () => handleTranslate(item, 'hi') },
                    { text: 'Cancel', style: 'cancel' },
                  ]
                );
              }}
            >
              <Ionicons name="language" size={18} color={theme.primary} />
            </TouchableOpacity>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.userInfo}>
          <Avatar
            source={otherUser?.profile_photo}
            name={otherUser?.display_name || ''}
            size={40}
            isOnline={otherUser?.is_online}
          />
          <View style={styles.userText}>
            <Text style={[styles.userName, { color: theme.text }]}>
              {otherUser?.display_name}
            </Text>
            <Text style={[styles.userStatus, { color: theme.textSecondary }]}>
              {isTyping ? 'typing...' : otherUser?.is_online ? 'Online' : 'Offline'}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push(`/call/${id}?type=voice`)}
        >
          <Ionicons name="call" size={22} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => router.push(`/call/${id}?type=video`)}
        >
          <Ionicons name="videocam" size={24} color={theme.primary} />
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
              onChangeText={handleInputChange}
              multiline
              maxLength={1000}
            />
          </View>
          <TouchableOpacity
            style={[styles.sendButton, { backgroundColor: theme.primary }]}
            onPress={() => sendMessage(inputText)}
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
          receiverName={otherUser?.display_name || 'User'}
          receiverId={id!}
          isGroup={false}
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
  userInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  userText: {
    marginLeft: 10,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userStatus: {
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
  translatedContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  translatedLabel: {
    fontSize: 10,
    marginBottom: 2,
  },
  translatedText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  messageTime: {
    fontSize: 10,
  },
  checkmark: {
    marginLeft: 4,
  },
  translateButton: {
    padding: 4,
    marginLeft: 4,
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
