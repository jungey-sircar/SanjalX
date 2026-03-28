import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import api from '../../src/services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface GiftPacket {
  id: string;
  sender_id: string;
  sender_name: string;
  chat_id: string;
  total_amount: number;
  remaining_amount: number;
  gift_type: string;
  total_slots: number;
  claimed_slots: number;
  status: string;
  message: string;
  is_group: boolean;
  created_at: string;
  expires_at: string;
}

interface GiftClaim {
  id: string;
  packet_id: string;
  user_id: string;
  user_name: string;
  amount: number;
  created_at: string;
}

export default function GiftOpenScreen() {
  const { id: packetId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [packet, setPacket] = useState<GiftPacket | null>(null);
  const [claims, setClaims] = useState<GiftClaim[]>([]);
  const [userClaimed, setUserClaimed] = useState(false);
  const [userClaim, setUserClaim] = useState<GiftClaim | null>(null);
  const [isSender, setIsSender] = useState(false);
  const [claimResult, setClaimResult] = useState<{ success: boolean; amount: number; message: string } | null>(null);

  // Animations
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const amountAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadPacketDetails();
    // Entry animation
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: false, tension: 50, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 400, useNativeDriver: false }),
    ]).start();
  }, []);

  const loadPacketDetails = async () => {
    try {
      const response = await api.get(`/gifts/${packetId}`);
      const data = response.data;
      setPacket(data.packet);
      setClaims(data.claims || []);
      setUserClaimed(data.user_claimed);
      setUserClaim(data.user_claim);
      setIsSender(data.is_sender);
    } catch (error) {
      console.error('Error loading gift details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (claiming || userClaimed || isSender) return;

    setClaiming(true);
    try {
      const response = await api.post(`/gifts/${packetId}/claim`);
      const result = response.data;
      setClaimResult(result);

      if (result.success) {
        // Animate the amount reveal
        Animated.spring(amountAnim, { toValue: 1, useNativeDriver: false, tension: 40 }).start();
        setUserClaimed(true);
        if (result.claim) setUserClaim(result.claim);
        if (result.packet) setPacket(result.packet);
        // Reload claims
        await loadPacketDetails();
      }
    } catch (error: any) {
      setClaimResult({
        success: false,
        amount: 0,
        message: error?.response?.data?.detail || 'Failed to claim gift',
      });
    } finally {
      setClaiming(false);
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const giftTypeLabel = () => {
    if (!packet) return '';
    switch (packet.gift_type) {
      case 'direct': return 'Direct Gift';
      case 'equal': return 'Equal Split';
      case 'first_claim': return 'First to Open Gets All';
      default: return 'Gift';
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FFD700" />
          <Text style={styles.loadingText}>Loading gift...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!packet) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Ionicons name="alert-circle" size={48} color="#FF3B30" />
          <Text style={styles.errorText}>Gift not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const canClaim = !userClaimed && !isSender && packet.status === 'active';
  const totalClaimed = claims.reduce((sum, c) => sum + c.amount, 0);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
        {/* Close button */}
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Ionicons name="close" size={24} color="#FFF" />
        </TouchableOpacity>

        {/* Packet Visual */}
        <Animated.View style={[styles.packetCard, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}>
          <View style={styles.packetHeader}>
            <Text style={styles.giftEmoji}>🧧</Text>
            <View style={styles.senderInfo}>
              <Text style={styles.senderName}>{packet.sender_name}</Text>
              <Text style={styles.giftMessage}>{packet.message}</Text>
            </View>
          </View>

          {/* Status badge */}
          <View style={[
            styles.statusBadge,
            packet.status === 'completed' && styles.statusCompleted,
            packet.status === 'expired' && styles.statusExpired,
          ]}>
            <Text style={styles.statusText}>
              {packet.status === 'active' ? '🟢 Active' : packet.status === 'completed' ? '✅ Completed' : '⏰ Expired'}
            </Text>
          </View>

          {/* Amount display */}
          {(userClaimed || isSender) && (
            <View style={styles.amountSection}>
              {userClaimed && userClaim && (
                <Animated.View style={[styles.claimedAmount, { opacity: claimResult ? amountAnim : opacityAnim }]}>
                  <Text style={styles.youReceived}>You received</Text>
                  <Text style={styles.amountValue}>${userClaim.amount.toFixed(2)}</Text>
                </Animated.View>
              )}
              {isSender && (
                <View style={styles.senderSummary}>
                  <Text style={styles.totalLabel}>Total Sent</Text>
                  <Text style={styles.amountValue}>${packet.total_amount.toFixed(2)}</Text>
                </View>
              )}
            </View>
          )}

          {/* Claim result message */}
          {claimResult && !claimResult.success && (
            <View style={styles.errorBanner}>
              <Ionicons name="close-circle" size={20} color="#FF6B6B" />
              <Text style={styles.errorBannerText}>{claimResult.message}</Text>
            </View>
          )}

          {/* Open Button */}
          {canClaim && !claimResult?.success && (
            <TouchableOpacity
              style={styles.openButton}
              onPress={handleClaim}
              disabled={claiming}
              activeOpacity={0.8}
            >
              {claiming ? (
                <ActivityIndicator color="#C41E3A" />
              ) : (
                <>
                  <Text style={styles.openButtonText}>Open</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Gift info */}
          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Type</Text>
              <Text style={styles.infoValue}>{giftTypeLabel()}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Claimed</Text>
              <Text style={styles.infoValue}>
                {packet.claimed_slots}/{packet.gift_type === 'first_claim' ? 1 : packet.total_slots}
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Remaining</Text>
              <Text style={styles.infoValue}>${packet.remaining_amount.toFixed(2)}</Text>
            </View>
          </View>
        </Animated.View>

        {/* Claims List */}
        {claims.length > 0 && (
          <View style={styles.claimsSection}>
            <Text style={styles.claimsSectionTitle}>
              {claims.length} {claims.length === 1 ? 'person' : 'people'} claimed (${totalClaimed.toFixed(2)})
            </Text>
            {claims.map((claim) => (
              <View key={claim.id} style={styles.claimRow}>
                <View style={styles.claimLeft}>
                  <View style={styles.claimAvatar}>
                    <Text style={styles.claimAvatarText}>
                      {(claim.user_name || '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.claimName}>{claim.user_name}</Text>
                    <Text style={styles.claimTime}>{formatTime(claim.created_at)}</Text>
                  </View>
                </View>
                <Text style={styles.claimAmount}>${claim.amount.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Created info */}
        <Text style={styles.createdText}>
          Sent on {formatTime(packet.created_at)}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#C41E3A',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: '#FFD700',
    fontSize: 16,
  },
  errorText: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '600',
  },
  backBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: '600',
  },
  closeBtn: {
    alignSelf: 'flex-start',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  packetCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  packetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  giftEmoji: {
    fontSize: 44,
  },
  senderInfo: {
    flex: 1,
  },
  senderName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  giftMessage: {
    fontSize: 14,
    color: '#666',
    marginTop: 3,
  },
  statusBadge: {
    backgroundColor: 'rgba(0,200,83,0.1)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  statusCompleted: {
    backgroundColor: 'rgba(100,100,100,0.1)',
  },
  statusExpired: {
    backgroundColor: 'rgba(255,0,0,0.08)',
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  amountSection: {
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  claimedAmount: {
    alignItems: 'center',
  },
  youReceived: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 40,
    fontWeight: '800',
    color: '#C41E3A',
  },
  senderSummary: {
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#888',
    marginBottom: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,59,48,0.08)',
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  errorBannerText: {
    color: '#FF3B30',
    fontSize: 14,
    flex: 1,
  },
  openButton: {
    backgroundColor: '#FFD700',
    paddingVertical: 16,
    borderRadius: 50,
    alignItems: 'center',
    marginBottom: 20,
    elevation: 4,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  openButtonText: {
    color: '#C41E3A',
    fontSize: 20,
    fontWeight: '800',
  },
  infoGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoItem: {
    alignItems: 'center',
    flex: 1,
  },
  infoLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  claimsSection: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  claimsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  claimRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  claimLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  claimAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#C41E3A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  claimAvatarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15,
  },
  claimName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  claimTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  claimAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C41E3A',
  },
  createdText: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 20,
  },
});
