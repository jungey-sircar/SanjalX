import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { useAuthStore } from '../../src/store/authStore';
import api from '../../src/services/api';
import { Wallet, Transaction, User } from '../../src/types';
import { format, isToday, isYesterday } from 'date-fns';

interface TransactionWithUsers extends Transaction {
  senderUser?: User;
  receiverUser?: User;
}

export default function WalletScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuthStore();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithUsers[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string>('');
  
  // Send Money Modal
  const [showSendModal, setShowSendModal] = useState(false);
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedContact, setSelectedContact] = useState<User | null>(null);
  const [sendAmount, setSendAmount] = useState('');
  const [sendNote, setSendNote] = useState('');
  const [sendStep, setSendStep] = useState<'select' | 'amount' | 'confirm'>('select');
  const [sending, setSending] = useState(false);
  
  // Transaction Detail Modal
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<TransactionWithUsers | null>(null);

  const loadWallet = async () => {
    try {
      const [walletRes, transactionsRes, meRes, contactsRes] = await Promise.all([
        api.get('/wallet'),
        api.get('/wallet/transactions'),
        api.get('/auth/me'),
        api.get('/contacts'),
      ]);
      
      setWallet(walletRes.data);
      setCurrentUserId(meRes.data.id);
      setContacts(contactsRes.data);
      
      // Fetch user info for transactions
      const transactionsWithUsers = await Promise.all(
        transactionsRes.data.map(async (tx: Transaction) => {
          try {
            const otherUserId = tx.sender_id === meRes.data.id ? tx.receiver_id : tx.sender_id;
            const userRes = await api.get(`/users/${otherUserId}`);
            return {
              ...tx,
              senderUser: tx.sender_id === meRes.data.id ? meRes.data : userRes.data,
              receiverUser: tx.receiver_id === meRes.data.id ? meRes.data : userRes.data,
            };
          } catch {
            return tx;
          }
        })
      );
      
      setTransactions(transactionsWithUsers);
    } catch (error) {
      console.error('Error loading wallet:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadWallet();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWallet();
    setRefreshing(false);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    if (isToday(date)) {
      return `Today, ${format(date, 'h:mm a')}`;
    } else if (isYesterday(date)) {
      return `Yesterday, ${format(date, 'h:mm a')}`;
    }
    return format(date, 'MMM dd, yyyy h:mm a');
  };

  const handleSendMoney = async () => {
    if (!selectedContact || !sendAmount) return;
    
    const amount = parseFloat(sendAmount);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount');
      return;
    }

    if (wallet && amount > wallet.balance) {
      Alert.alert('Insufficient Balance', 'You do not have enough balance for this transaction');
      return;
    }

    setSending(true);
    try {
      await api.post('/wallet/send', {
        receiver_id: selectedContact.id,
        amount,
        note: sendNote || undefined,
      });
      
      Alert.alert(
        'Success!',
        `$${amount.toFixed(2)} sent to ${selectedContact.display_name}`,
        [{ text: 'Done', onPress: resetSendModal }]
      );
      await loadWallet();
    } catch (error: any) {
      Alert.alert('Transfer Failed', error.response?.data?.detail || 'Please try again');
    } finally {
      setSending(false);
    }
  };

  const resetSendModal = () => {
    setShowSendModal(false);
    setSelectedContact(null);
    setSendAmount('');
    setSendNote('');
    setSendStep('select');
  };

  const renderTransaction = ({ item }: { item: TransactionWithUsers }) => {
    const isSent = item.sender_id === currentUserId;
    const otherUser = isSent ? item.receiverUser : item.senderUser;
    
    return (
      <TouchableOpacity 
        style={[styles.transactionItem, { backgroundColor: theme.surface }]}
        onPress={() => {
          setSelectedTransaction(item);
          setShowDetailModal(true);
        }}
      >
        <View style={[
          styles.transactionIcon,
          { backgroundColor: isSent ? '#FFEBEE' : '#E8F5E9' }
        ]}>
          <Ionicons
            name={isSent ? 'arrow-up' : 'arrow-down'}
            size={20}
            color={isSent ? '#E53935' : '#43A047'}
          />
        </View>
        <View style={styles.transactionContent}>
          <Text style={[styles.transactionUser, { color: theme.text }]}>
            {isSent ? `To ${otherUser?.display_name || 'Unknown'}` : `From ${otherUser?.display_name || 'Unknown'}`}
          </Text>
          {item.note && (
            <Text style={[styles.transactionNote, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.note}
            </Text>
          )}
          <Text style={[styles.transactionDate, { color: theme.textSecondary }]}>
            {formatDate(item.created_at)}
          </Text>
        </View>
        <Text style={[
          styles.transactionAmount,
          { color: isSent ? '#E53935' : '#43A047' }
        ]}>
          {isSent ? '-' : '+'}${item.amount.toFixed(2)}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderContactItem = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.contactSelectItem, { backgroundColor: theme.surface }]}
      onPress={() => {
        setSelectedContact(item);
        setSendStep('amount');
      }}
    >
      <Avatar source={item.profile_photo} name={item.display_name} size={48} />
      <View style={styles.contactSelectInfo}>
        <Text style={[styles.contactSelectName, { color: theme.text }]}>
          {item.display_name}
        </Text>
        <Text style={[styles.contactSelectUsername, { color: theme.textSecondary }]}>
          @{item.username}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
    </TouchableOpacity>
  );

  const QuickAmountButton = ({ amount }: { amount: number }) => (
    <TouchableOpacity
      style={[styles.quickAmountBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}
      onPress={() => setSendAmount(amount.toString())}
    >
      <Text style={[styles.quickAmountText, { color: theme.text }]}>${amount}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Wallet</Text>
        <TouchableOpacity>
          <Ionicons name="settings-outline" size={24} color={theme.text} />
        </TouchableOpacity>
      </View>

      {/* Balance Card */}
      <View style={[styles.balanceCard, { backgroundColor: theme.primary }]}>
        <View style={styles.balanceHeader}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <View style={[styles.mockBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
            <Text style={styles.mockBadgeText}>MOCK</Text>
          </View>
        </View>
        <Text style={styles.balanceAmount}>
          ${wallet?.balance.toFixed(2) || '0.00'}
        </Text>
        <Text style={styles.balanceSubtext}>
          {user?.display_name}'s Wallet
        </Text>
        
        <View style={styles.balanceActions}>
          <TouchableOpacity
            style={styles.balanceButton}
            onPress={() => setShowSendModal(true)}
          >
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="send" size={22} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>Send</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.balanceButton}>
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="download" size={22} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>Request</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.balanceButton}>
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="add" size={22} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>Top Up</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.balanceButton}>
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="qr-code" size={22} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>QR Code</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Transactions */}
      <View style={styles.transactionsSection}>
        <View style={styles.transactionsHeader}>
          <Text style={[styles.transactionsTitle, { color: theme.text }]}>
            Recent Transactions
          </Text>
          {transactions.length > 0 && (
            <TouchableOpacity>
              <Text style={[styles.seeAllText, { color: theme.primary }]}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.surface }]}>
              <Ionicons name="receipt-outline" size={48} color={theme.textSecondary} />
            </View>
            <Text style={[styles.emptyText, { color: theme.text }]}>
              No transactions yet
            </Text>
            <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
              Send or receive money to see your transactions here
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: theme.primary }]}
              onPress={() => setShowSendModal(true)}
            >
              <Ionicons name="send" size={18} color="#FFFFFF" />
              <Text style={styles.emptyButtonText}>Send Money</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={transactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
            }
          />
        )}
      </View>

      {/* Send Money Modal */}
      <Modal
        visible={showSendModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={resetSendModal}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={sendStep === 'select' ? resetSendModal : () => {
              if (sendStep === 'confirm') setSendStep('amount');
              else setSendStep('select');
            }}>
              <Ionicons 
                name={sendStep === 'select' ? 'close' : 'arrow-back'} 
                size={24} 
                color={theme.text} 
              />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {sendStep === 'select' ? 'Send Money' : sendStep === 'amount' ? 'Enter Amount' : 'Confirm Transfer'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          {sendStep === 'select' && (
            <View style={styles.modalContent}>
              <Text style={[styles.selectLabel, { color: theme.textSecondary }]}>
                SELECT RECIPIENT
              </Text>
              {contacts.length === 0 ? (
                <View style={styles.noContactsContainer}>
                  <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
                  <Text style={[styles.noContactsText, { color: theme.textSecondary }]}>
                    No contacts to send money to
                  </Text>
                  <Text style={[styles.noContactsSubtext, { color: theme.textSecondary }]}>
                    Add contacts first to send them money
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={contacts}
                  renderItem={renderContactItem}
                  keyExtractor={(item) => item.id}
                  contentContainerStyle={styles.contactsList}
                />
              )}
            </View>
          )}

          {sendStep === 'amount' && selectedContact && (
            <View style={styles.amountContainer}>
              <View style={styles.recipientBanner}>
                <Avatar source={selectedContact.profile_photo} name={selectedContact.display_name} size={56} />
                <Text style={[styles.recipientName, { color: theme.text }]}>
                  {selectedContact.display_name}
                </Text>
                <Text style={[styles.recipientUsername, { color: theme.textSecondary }]}>
                  @{selectedContact.username}
                </Text>
              </View>

              <View style={styles.amountInputSection}>
                <View style={styles.amountRow}>
                  <Text style={[styles.currencySymbol, { color: theme.text }]}>$</Text>
                  <TextInput
                    style={[styles.amountInput, { color: theme.text }]}
                    placeholder="0.00"
                    placeholderTextColor={theme.textSecondary}
                    value={sendAmount}
                    onChangeText={setSendAmount}
                    keyboardType="decimal-pad"
                    autoFocus
                  />
                </View>
                <Text style={[styles.balanceHint, { color: theme.textSecondary }]}>
                  Available: ${wallet?.balance.toFixed(2) || '0.00'}
                </Text>
              </View>

              <View style={styles.quickAmountsRow}>
                <QuickAmountButton amount={10} />
                <QuickAmountButton amount={25} />
                <QuickAmountButton amount={50} />
                <QuickAmountButton amount={100} />
              </View>

              <View style={[styles.noteInputContainer, { backgroundColor: theme.surface }]}>
                <Ionicons name="create-outline" size={20} color={theme.textSecondary} />
                <TextInput
                  style={[styles.noteInput, { color: theme.text }]}
                  placeholder="Add a note (optional)"
                  placeholderTextColor={theme.textSecondary}
                  value={sendNote}
                  onChangeText={setSendNote}
                  maxLength={100}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.continueButton,
                  { backgroundColor: theme.primary },
                  (!sendAmount || parseFloat(sendAmount) <= 0) && styles.buttonDisabled
                ]}
                onPress={() => setSendStep('confirm')}
                disabled={!sendAmount || parseFloat(sendAmount) <= 0}
              >
                <Text style={styles.continueButtonText}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {sendStep === 'confirm' && selectedContact && (
            <View style={styles.confirmContainer}>
              <View style={[styles.confirmCard, { backgroundColor: theme.surface }]}>
                <Text style={[styles.confirmLabel, { color: theme.textSecondary }]}>
                  You are sending
                </Text>
                <Text style={[styles.confirmAmount, { color: theme.text }]}>
                  ${parseFloat(sendAmount).toFixed(2)}
                </Text>
                <Text style={[styles.confirmLabel, { color: theme.textSecondary }]}>to</Text>
                <View style={styles.confirmRecipient}>
                  <Avatar source={selectedContact.profile_photo} name={selectedContact.display_name} size={64} />
                  <Text style={[styles.confirmRecipientName, { color: theme.text }]}>
                    {selectedContact.display_name}
                  </Text>
                </View>
                {sendNote && (
                  <View style={[styles.confirmNoteBox, { borderColor: theme.border }]}>
                    <Text style={[styles.confirmNoteLabel, { color: theme.textSecondary }]}>Note:</Text>
                    <Text style={[styles.confirmNoteText, { color: theme.text }]}>{sendNote}</Text>
                  </View>
                )}
              </View>

              <View style={styles.confirmSummary}>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Amount</Text>
                  <Text style={[styles.summaryValue, { color: theme.text }]}>${parseFloat(sendAmount).toFixed(2)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Fee</Text>
                  <Text style={[styles.summaryValue, { color: theme.success }]}>Free</Text>
                </View>
                <View style={[styles.summaryRow, styles.summaryTotal]}>
                  <Text style={[styles.summaryLabel, { color: theme.text, fontWeight: '600' }]}>Total</Text>
                  <Text style={[styles.summaryValue, { color: theme.text, fontWeight: '700' }]}>${parseFloat(sendAmount).toFixed(2)}</Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.confirmButton, { backgroundColor: theme.primary }]}
                onPress={handleSendMoney}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
                    <Text style={styles.confirmButtonText}>Confirm & Send</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Transaction Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Transaction Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedTransaction && (
            <View style={styles.detailContainer}>
              <View style={[styles.detailCard, { backgroundColor: theme.surface }]}>
                <View style={[
                  styles.detailIcon,
                  { backgroundColor: selectedTransaction.sender_id === currentUserId ? '#FFEBEE' : '#E8F5E9' }
                ]}>
                  <Ionicons
                    name={selectedTransaction.sender_id === currentUserId ? 'arrow-up' : 'arrow-down'}
                    size={32}
                    color={selectedTransaction.sender_id === currentUserId ? '#E53935' : '#43A047'}
                  />
                </View>
                <Text style={[styles.detailAmount, { 
                  color: selectedTransaction.sender_id === currentUserId ? '#E53935' : '#43A047' 
                }]}>
                  {selectedTransaction.sender_id === currentUserId ? '-' : '+'}${selectedTransaction.amount.toFixed(2)}
                </Text>
                <Text style={[styles.detailStatus, { color: theme.success }]}>
                  {selectedTransaction.status.charAt(0).toUpperCase() + selectedTransaction.status.slice(1)}
                </Text>
              </View>

              <View style={[styles.detailInfoCard, { backgroundColor: theme.surface }]}>
                <View style={styles.detailInfoRow}>
                  <Text style={[styles.detailInfoLabel, { color: theme.textSecondary }]}>
                    {selectedTransaction.sender_id === currentUserId ? 'To' : 'From'}
                  </Text>
                  <View style={styles.detailInfoUser}>
                    <Avatar 
                      source={selectedTransaction.sender_id === currentUserId 
                        ? selectedTransaction.receiverUser?.profile_photo 
                        : selectedTransaction.senderUser?.profile_photo
                      }
                      name={selectedTransaction.sender_id === currentUserId 
                        ? selectedTransaction.receiverUser?.display_name || '' 
                        : selectedTransaction.senderUser?.display_name || ''
                      }
                      size={32}
                    />
                    <Text style={[styles.detailInfoValue, { color: theme.text }]}>
                      {selectedTransaction.sender_id === currentUserId 
                        ? selectedTransaction.receiverUser?.display_name 
                        : selectedTransaction.senderUser?.display_name}
                    </Text>
                  </View>
                </View>

                <View style={[styles.detailInfoRow, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                  <Text style={[styles.detailInfoLabel, { color: theme.textSecondary }]}>Date</Text>
                  <Text style={[styles.detailInfoValue, { color: theme.text }]}>
                    {formatDate(selectedTransaction.created_at)}
                  </Text>
                </View>

                <View style={[styles.detailInfoRow, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                  <Text style={[styles.detailInfoLabel, { color: theme.textSecondary }]}>Transaction ID</Text>
                  <Text style={[styles.detailInfoValue, { color: theme.text, fontSize: 12 }]}>
                    {selectedTransaction.id.slice(0, 18)}...
                  </Text>
                </View>

                {selectedTransaction.note && (
                  <View style={[styles.detailInfoRow, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
                    <Text style={[styles.detailInfoLabel, { color: theme.textSecondary }]}>Note</Text>
                    <Text style={[styles.detailInfoValue, { color: theme.text }]}>
                      {selectedTransaction.note}
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </SafeAreaView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  balanceCard: {
    marginHorizontal: 16,
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  balanceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  mockBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  mockBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: 'bold',
    marginTop: 8,
  },
  balanceSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    marginTop: 4,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 28,
  },
  balanceButton: {
    alignItems: 'center',
  },
  balanceButtonIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  transactionsSection: {
    flex: 1,
    paddingHorizontal: 16,
  },
  transactionsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    paddingBottom: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    marginBottom: 10,
  },
  transactionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionContent: {
    flex: 1,
    marginLeft: 14,
  },
  transactionUser: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionNote: {
    fontSize: 13,
    marginTop: 2,
  },
  transactionDate: {
    fontSize: 12,
    marginTop: 4,
  },
  transactionAmount: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  emptyButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Modal Styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  selectLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 12,
  },
  contactsList: {
    paddingBottom: 20,
  },
  contactSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    marginBottom: 10,
  },
  contactSelectInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactSelectName: {
    fontSize: 16,
    fontWeight: '600',
  },
  contactSelectUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  noContactsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noContactsText: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
  },
  noContactsSubtext: {
    fontSize: 14,
    marginTop: 8,
  },
  // Amount Step
  amountContainer: {
    flex: 1,
    padding: 24,
  },
  recipientBanner: {
    alignItems: 'center',
    marginBottom: 32,
  },
  recipientName: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 12,
  },
  recipientUsername: {
    fontSize: 14,
    marginTop: 4,
  },
  amountInputSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencySymbol: {
    fontSize: 48,
    fontWeight: '300',
  },
  amountInput: {
    fontSize: 48,
    fontWeight: '300',
    minWidth: 120,
    textAlign: 'center',
  },
  balanceHint: {
    fontSize: 13,
    marginTop: 8,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },
  quickAmountBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '500',
  },
  noteInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 24,
  },
  noteInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 16,
  },
  continueButton: {
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  // Confirm Step
  confirmContainer: {
    flex: 1,
    padding: 24,
  },
  confirmCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  confirmLabel: {
    fontSize: 14,
  },
  confirmAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  confirmRecipient: {
    alignItems: 'center',
    marginTop: 16,
  },
  confirmRecipientName: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 12,
  },
  confirmNoteBox: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    width: '100%',
  },
  confirmNoteLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  confirmNoteText: {
    fontSize: 14,
  },
  confirmSummary: {
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    marginTop: 8,
    paddingTop: 16,
  },
  summaryLabel: {
    fontSize: 15,
  },
  summaryValue: {
    fontSize: 15,
  },
  confirmButton: {
    flexDirection: 'row',
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
  // Detail Modal
  detailContainer: {
    padding: 24,
  },
  detailCard: {
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  detailIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailAmount: {
    fontSize: 40,
    fontWeight: 'bold',
  },
  detailStatus: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  detailInfoCard: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  detailInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  detailInfoLabel: {
    fontSize: 14,
  },
  detailInfoValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  detailInfoUser: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
});
