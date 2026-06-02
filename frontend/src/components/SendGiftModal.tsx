import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface SendGiftModalContentProps {
  receiverName: string;
  receiverId: string;
  isGroup?: boolean;
  onSend: (amount: number, message: string, giftType: string, slots: number) => Promise<void>;
  onClose: () => void;
}

export function SendGiftModalContent({
  receiverName,
  receiverId,
  isGroup = false,
  onSend,
  onClose,
}: SendGiftModalContentProps) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [giftType, setGiftType] = useState(isGroup ? 'equal' : 'direct');
  const [slots, setSlots] = useState('');
  const [sending, setSending] = useState(false);

  const quickAmounts = [5, 10, 20, 50, 100];

  const handleSend = async () => {
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    if (amountNum < 0.01) {
      Alert.alert('Minimum Amount', 'Minimum gift amount is $0.01');
      return;
    }

    let slotsNum = 1;
    if (giftType === 'equal') {
      slotsNum = parseInt(slots) || 1;
      if (slotsNum < 1) {
        Alert.alert('Invalid', 'Must have at least 1 recipient.');
        return;
      }
    }

    setSending(true);
    try {
      await onSend(amountNum, message, giftType, slotsNum);
    } catch (error: any) {
      Alert.alert('Error', error?.response?.data?.detail || 'Failed to send gift');
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Gift</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Recipient */}
        <View style={styles.recipientRow}>
          <Ionicons name="person" size={18} color="#FFD700" />
          <Text style={styles.recipientText}>To: {receiverName}</Text>
        </View>

        {/* Gift Type selector (only for group) */}
        {isGroup && (
          <View style={styles.typeSection}>
            <Text style={styles.sectionLabel}>Gift Type</Text>
            <View style={styles.typeRow}>
              <TouchableOpacity
                style={[styles.typeBtn, giftType === 'equal' && styles.typeBtnActive]}
                onPress={() => setGiftType('equal')}
              >
                <Ionicons name="people" size={20} color={giftType === 'equal' ? '#C41E3A' : '#999'} />
                <Text style={[styles.typeText, giftType === 'equal' && styles.typeTextActive]}>
                  Equal Split
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typeBtn, giftType === 'first_claim' && styles.typeBtnActive]}
                onPress={() => setGiftType('first_claim')}
              >
                <Ionicons name="flash" size={20} color={giftType === 'first_claim' ? '#C41E3A' : '#999'} />
                <Text style={[styles.typeText, giftType === 'first_claim' && styles.typeTextActive]}>
                  First Claim
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Amount */}
        <View style={styles.amountSection}>
          <Text style={styles.sectionLabel}>Amount</Text>
          <View style={styles.amountInputRow}>
            <Text style={styles.currencySign}>$</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              placeholderTextColor="#666"
              keyboardType="decimal-pad"
              maxLength={10}
            />
          </View>
          <View style={styles.quickAmountRow}>
            {quickAmounts.map((qa) => (
              <TouchableOpacity
                key={qa}
                style={[styles.quickBtn, amount === String(qa) && styles.quickBtnActive]}
                onPress={() => setAmount(String(qa))}
              >
                <Text style={[styles.quickBtnText, amount === String(qa) && styles.quickBtnTextActive]}>
                  ${qa}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Slots (for equal split) */}
        {giftType === 'equal' && isGroup && (
          <View style={styles.slotsSection}>
            <Text style={styles.sectionLabel}>Number of Recipients</Text>
            <TextInput
              style={styles.slotsInput}
              value={slots}
              onChangeText={setSlots}
              placeholder="e.g. 5"
              placeholderTextColor="#666"
              keyboardType="number-pad"
              maxLength={4}
            />
            {amount && slots ? (
              <Text style={styles.splitInfo}>
                Each person gets: ${(parseFloat(amount) / (parseInt(slots) || 1)).toFixed(2)}
              </Text>
            ) : null}
          </View>
        )}

        {/* Message */}
        <View style={styles.messageSection}>
          <Text style={styles.sectionLabel}>Message (optional)</Text>
          <TextInput
            style={styles.messageInput}
            value={message}
            onChangeText={setMessage}
            placeholder="Best wishes!"
            placeholderTextColor="#666"
            maxLength={100}
            multiline={false}
          />
        </View>

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendBtn, (!amount || sending) && styles.sendBtnDisabled]}
          onPress={handleSend}
          disabled={!amount || sending}
        >
          {sending ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <>
              <Text style={styles.sendBtnText}>
                Send ${parseFloat(amount || '0').toFixed(2)}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFD700',
  },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,215,0,0.1)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
  },
  recipientText: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '600',
  },
  typeSection: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#AAA',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  typeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  typeBtnActive: {
    borderColor: '#C41E3A',
    backgroundColor: 'rgba(196,30,58,0.1)',
  },
  typeText: {
    color: '#999',
    fontSize: 14,
    fontWeight: '600',
  },
  typeTextActive: {
    color: '#FFD700',
  },
  amountSection: {
    marginBottom: 20,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 4,
    marginBottom: 12,
  },
  currencySign: {
    color: '#FFD700',
    fontSize: 32,
    fontWeight: 'bold',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    paddingVertical: 12,
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center',
  },
  quickBtnActive: {
    backgroundColor: 'rgba(196,30,58,0.3)',
  },
  quickBtnText: {
    color: '#AAA',
    fontSize: 14,
    fontWeight: '600',
  },
  quickBtnTextActive: {
    color: '#FFD700',
  },
  slotsSection: {
    marginBottom: 20,
  },
  slotsInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 16,
  },
  splitInfo: {
    color: '#FFD700',
    fontSize: 13,
    marginTop: 6,
  },
  messageSection: {
    marginBottom: 28,
  },
  messageInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 14,
    color: '#FFF',
    fontSize: 16,
  },
  sendBtn: {
    backgroundColor: '#C41E3A',
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: 'center',
    shadowColor: '#C41E3A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  sendBtnText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
