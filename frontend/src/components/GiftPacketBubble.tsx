import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface GiftPacketBubbleProps {
  packetData: {
    packet_id: string;
    message: string;
    gift_type: string;
    total_amount: number;
    total_slots: number;
    sender_name: string;
  };
  isSent: boolean;
  onOpen: (packetId: string) => void;
}

export function GiftPacketBubble({ packetData, isSent, onOpen }: GiftPacketBubbleProps) {
  const giftTypeLabel = () => {
    switch (packetData.gift_type) {
      case 'direct': return 'Direct Gift';
      case 'equal': return `Equal Split (${packetData.total_slots})`;
      case 'first_claim': return 'First to Open';
      default: return 'Gift';
    }
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={() => onOpen(packetData.packet_id)}
      activeOpacity={0.8}
    >
      {/* Red packet design */}
      <View style={styles.packetTop}>
        <View style={styles.iconCircle}>
          <Text style={styles.giftEmoji}>🧧</Text>
        </View>
        <View style={styles.textContent}>
          <Text style={styles.giftMessage} numberOfLines={2}>
            {packetData.message || 'Sent you a gift!'}
          </Text>
          <Text style={styles.tapText}>Tap to open</Text>
        </View>
      </View>

      {/* Bottom info strip */}
      <View style={styles.packetBottom}>
        <View style={styles.bottomLeft}>
          <Ionicons name="gift" size={12} color="#B8860B" />
          <Text style={styles.typeLabel}>{giftTypeLabel()}</Text>
        </View>
        <Text style={styles.brandText}>ConnectX Gift</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 260,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#C41E3A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  packetTop: {
    backgroundColor: '#C41E3A',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 12,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,215,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftEmoji: {
    fontSize: 28,
  },
  textContent: {
    flex: 1,
  },
  giftMessage: {
    color: '#FFD700',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 20,
  },
  tapText: {
    color: 'rgba(255,215,0,0.7)',
    fontSize: 12,
    marginTop: 3,
  },
  packetBottom: {
    backgroundColor: '#A61830',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bottomLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeLabel: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600',
  },
  brandText: {
    color: 'rgba(255,215,0,0.5)',
    fontSize: 10,
    fontWeight: '500',
  },
});
