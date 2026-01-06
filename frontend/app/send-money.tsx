import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/hooks/useTheme';
import { Avatar } from '../src/components/Avatar';
import api from '../src/services/api';
import { User } from '../src/types';

export default function SendMoneyScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedContact, setSelectedContact] = useState<User | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'select' | 'amount'>('select');

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const response = await api.get('/contacts');
      setContacts(response.data);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const handleSelectContact = (contact: User) => {
    setSelectedContact(contact);
    setStep('amount');
  };

  const handleSendMoney = async () => {
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      await api.post('/wallet/send', {
        receiver_id: selectedContact!.id,
        amount: amountNum,
        note: note || undefined,
      });
      Alert.alert(
        'Success',
        `$${amountNum.toFixed(2)} sent to ${selectedContact!.display_name}`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to send money');
    } finally {
      setLoading(false);
    }
  };

  const renderContact = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.contactItem, { backgroundColor: theme.surface }]}
      onPress={() => handleSelectContact(item)}
    >
      <Avatar
        source={item.profile_photo}
        name={item.display_name}
        size={48}
      />
      <View style={styles.contactInfo}>
        <Text style={[styles.contactName, { color: theme.text }]}>
          {item.display_name}
        </Text>
        <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
          @{item.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  if (step === 'amount' && selectedContact) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { backgroundColor: theme.surface }]}>
          <TouchableOpacity onPress={() => setStep('select')}>
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Send Money</Text>
          <View style={{ width: 24 }} />
        </View>

        <KeyboardAvoidingView
          style={styles.amountContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.recipientCard}>
            <Avatar
              source={selectedContact.profile_photo}
              name={selectedContact.display_name}
              size={64}
            />
            <Text style={[styles.recipientName, { color: theme.text }]}>
              {selectedContact.display_name}
            </Text>
          </View>

          <View style={styles.amountInputContainer}>
            <Text style={[styles.currencySymbol, { color: theme.text }]}>$</Text>
            <TextInput
              style={[styles.amountInput, { color: theme.text }]}
              placeholder="0.00"
              placeholderTextColor={theme.textSecondary}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <View style={[styles.noteContainer, { backgroundColor: theme.surface }]}>
            <TextInput
              style={[styles.noteInput, { color: theme.text }]}
              placeholder="Add a note (optional)"
              placeholderTextColor={theme.textSecondary}
              value={note}
              onChangeText={setNote}
              maxLength={100}
            />
          </View>

          <TouchableOpacity
            style={[
              styles.sendButton,
              { backgroundColor: theme.primary },
              (!amount || loading) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMoney}
            disabled={!amount || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.sendButtonText}>Send ${amount || '0.00'}</Text>
            )}
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { backgroundColor: theme.surface }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Send Money</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          Select Contact
        </Text>
        
        {contacts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              No contacts found
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              Add contacts to send them money
            </Text>
          </View>
        ) : (
          <FlatList
            data={contacts}
            renderItem={renderContact}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
          />
        )}
      </View>
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
    padding: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
  },
  contactUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  amountContainer: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  recipientCard: {
    alignItems: 'center',
    marginBottom: 40,
  },
  recipientName: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 12,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '300',
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '300',
    minWidth: 100,
    textAlign: 'center',
  },
  noteContainer: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  noteInput: {
    fontSize: 16,
    textAlign: 'center',
  },
  sendButton: {
    width: '100%',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
});
