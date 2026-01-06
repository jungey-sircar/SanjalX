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
import { Wallet, Transaction, User } from '../../src/types';
import { format } from 'date-fns';

interface TransactionWithUsers extends Transaction {
  senderUser?: User;
  receiverUser?: User;
}

export default function WalletScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithUsers[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>('');

  const loadWallet = async () => {
    try {
      const [walletRes, transactionsRes, meRes] = await Promise.all([
        api.get('/wallet'),
        api.get('/wallet/transactions'),
        api.get('/auth/me'),
      ]);
      
      setWallet(walletRes.data);
      setCurrentUserId(meRes.data.id);
      
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

  const renderTransaction = ({ item }: { item: TransactionWithUsers }) => {
    const isSent = item.sender_id === currentUserId;
    const otherUser = isSent ? item.receiverUser : item.senderUser;
    
    return (
      <View style={[styles.transactionItem, { backgroundColor: theme.surface }]}>
        <View style={[
          styles.transactionIcon,
          { backgroundColor: isSent ? '#FFE5E5' : '#E5FFE5' }
        ]}>
          <Ionicons
            name={isSent ? 'arrow-up' : 'arrow-down'}
            size={20}
            color={isSent ? theme.error : theme.success}
          />
        </View>
        <View style={styles.transactionContent}>
          <Text style={[styles.transactionUser, { color: theme.text }]}>
            {isSent ? `To: ${otherUser?.display_name || 'Unknown'}` : `From: ${otherUser?.display_name || 'Unknown'}`}
          </Text>
          {item.note && (
            <Text style={[styles.transactionNote, { color: theme.textSecondary }]} numberOfLines={1}>
              {item.note}
            </Text>
          )}
          <Text style={[styles.transactionDate, { color: theme.textSecondary }]}>
            {format(new Date(item.created_at), 'MMM dd, yyyy HH:mm')}
          </Text>
        </View>
        <Text style={[
          styles.transactionAmount,
          { color: isSent ? theme.error : theme.success }
        ]}>
          {isSent ? '-' : '+'}${item.amount.toFixed(2)}
        </Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Wallet</Text>
      </View>

      <View style={[styles.balanceCard, { backgroundColor: theme.primary }]}>
        <Text style={styles.balanceLabel}>Available Balance</Text>
        <Text style={styles.balanceAmount}>
          ${wallet?.balance.toFixed(2) || '0.00'}
        </Text>
        <View style={styles.balanceActions}>
          <TouchableOpacity
            style={styles.balanceButton}
            onPress={() => router.push('/send-money')}
          >
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="send" size={20} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>Send</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.balanceButton}>
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="download" size={20} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>Request</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.balanceButton}>
            <View style={styles.balanceButtonIcon}>
              <Ionicons name="qr-code" size={20} color={theme.primary} />
            </View>
            <Text style={styles.balanceButtonText}>QR Code</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.transactionsHeader}>
        <Text style={[styles.transactionsTitle, { color: theme.text }]}>
          Recent Transactions
        </Text>
      </View>

      {transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No transactions yet
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Send or receive money to see transactions
          </Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  balanceCard: {
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: 'bold',
    marginTop: 8,
  },
  balanceActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 24,
  },
  balanceButton: {
    alignItems: 'center',
  },
  balanceButtonIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
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
  transactionsHeader: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  transactionContent: {
    flex: 1,
    marginLeft: 12,
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
    fontSize: 16,
    fontWeight: '700',
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
