import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Switch,
  RefreshControl,
  Share,
  Modal,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { ProfilePhotoPicker } from '../../src/components/ProfilePhotoPicker';
import { useAuthStore } from '../../src/store/authStore';
import { socketService } from '../../src/services/socket';
import api from '../../src/services/api';

export default function ProfileScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user, logout, updateUser } = useAuthStore();
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showAppearanceModal, setShowAppearanceModal] = useState(false);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showAboutModal, setShowAboutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const refreshProfile = async () => {
    try {
      const response = await api.get('/auth/me');
      updateUser(response.data);
    } catch (error) {
      console.error('Error refreshing profile:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      refreshProfile();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  const handlePhotoSelected = async (base64Data: string) => {
    try {
      const response = await api.put('/users/profile', {
        profile_photo: base64Data,
      });
      updateUser({ profile_photo: response.data.profile_photo });
      Alert.alert('Success', 'Profile photo updated successfully!');
    } catch (error: any) {
      console.error('Error uploading photo:', error);
      throw new Error(error.response?.data?.detail || 'Failed to upload photo');
    }
  };

  const handleRemovePhoto = async () => {
    try {
      const response = await api.put('/users/profile', {
        profile_photo: null,
      });
      updateUser({ profile_photo: null });
      Alert.alert('Success', 'Profile photo removed successfully!');
    } catch (error: any) {
      console.error('Error removing photo:', error);
      throw new Error(error.response?.data?.detail || 'Failed to remove photo');
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            setLoggingOut(true);
            try {
              // Disconnect WebSocket
              socketService.disconnect();
              // Clear auth state
              await logout();
              // Navigate to login
              router.replace('/(auth)/login');
            } catch (error) {
              console.error('Logout error:', error);
              // Force navigate even on error
              router.replace('/(auth)/login');
            } finally {
              setLoggingOut(false);
            }
          },
        },
      ]
    );
  };

  const handleInviteFriends = async () => {
    try {
      const result = await Share.share({
        message: `Hey! Join me on ConnectX - the best messaging app for staying connected with friends and family! 🚀\n\nDownload now: https://connectx.app/download\n\nMy username: @${user?.username}`,
        title: 'Invite friends to ConnectX',
      });
      
      if (result.action === Share.sharedAction) {
        if (result.activityType) {
          console.log('Shared via:', result.activityType);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to share invite');
    }
  };

  const handleMyQRCode = () => {
    setShowQRModal(true);
  };

  const handleCopyUsername = async () => {
    if (user?.username) {
      await Clipboard.setStringAsync(`@${user.username}`);
      Alert.alert('Copied!', 'Username copied to clipboard');
    }
  };

  const handleAppearance = () => {
    setShowAppearanceModal(true);
  };

  const handleLanguage = () => {
    setShowLanguageModal(true);
  };

  const handleHelpCenter = () => {
    Alert.alert(
      'Help Center',
      'How can we help you?',
      [
        { text: 'FAQs', onPress: () => Linking.openURL('https://connectx.app/faq') },
        { text: 'Contact Support', onPress: handleContactUs },
        { text: 'Report a Bug', onPress: () => handleContactUs('bug') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const handleContactUs = (type?: string) => {
    const subject = type === 'bug' ? 'Bug Report' : 'Support Request';
    const body = type === 'bug' 
      ? `Bug Report from @${user?.username}\n\nDescribe the bug:\n\n\nSteps to reproduce:\n\n\nExpected behavior:\n\n`
      : `Support request from @${user?.username}\n\nHow can we help?\n\n`;
    
    Linking.openURL(`mailto:support@connectx.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleRateApp = () => {
    Alert.alert(
      'Rate ConnectX ⭐',
      'Enjoying ConnectX? Please take a moment to rate us!',
      [
        { text: 'Maybe Later', style: 'cancel' },
        { 
          text: 'Rate Now', 
          onPress: () => {
            // In production, this would open the app store
            Linking.openURL('https://connectx.app/rate');
          }
        },
      ]
    );
  };

  const handleAbout = () => {
    setShowAboutModal(true);
  };

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications_enabled', JSON.stringify(value));
    // In a real app, you'd also update push notification settings
  };

  const MenuItem = ({ icon, label, value, onPress, showArrow = true, rightComponent, iconColor }: {
    icon: string;
    label: string;
    value?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightComponent?: React.ReactNode;
    iconColor?: string;
  }) => (
    <TouchableOpacity
      style={[styles.menuItem, { backgroundColor: theme.surface }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[styles.menuIcon, { backgroundColor: theme.background }]}>
        <Ionicons name={icon as any} size={20} color={iconColor || theme.primary} />
      </View>
      <View style={styles.menuContent}>
        <Text style={[styles.menuLabel, { color: theme.text }]}>{label}</Text>
        {value && (
          <Text style={[styles.menuValue, { color: theme.textSecondary }]}>{value}</Text>
        )}
      </View>
      {rightComponent || (showArrow && onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      ))}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
        }
      >
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Profile</Text>
          <TouchableOpacity onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.profileCard, { backgroundColor: theme.surface }]}
          onPress={() => router.push('/edit-profile')}
          activeOpacity={0.7}
        >
          <TouchableOpacity onPress={() => setShowPhotoPicker(true)} style={styles.avatarContainer}>
            <Avatar
              source={user?.profile_photo}
              name={user?.display_name || ''}
              size={80}
            />
            <View style={[styles.editBadge, { backgroundColor: theme.primary }]}>
              <Ionicons name="camera" size={14} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <View style={styles.profileInfo}>
            <Text style={[styles.displayName, { color: theme.text }]}>
              {user?.display_name}
            </Text>
            <Text style={[styles.username, { color: theme.textSecondary }]}>
              @{user?.username}
            </Text>
            <Text style={[styles.statusMessage, { color: theme.textSecondary }]} numberOfLines={2}>
              {user?.status_message || 'Tap to edit profile'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={24} color={theme.textSecondary} />
        </TouchableOpacity>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Account</Text>
          <MenuItem 
            icon="person-outline" 
            label="Edit Profile" 
            onPress={() => router.push('/edit-profile')} 
          />
          <MenuItem 
            icon="camera-outline" 
            label="Change Photo" 
            onPress={() => setShowPhotoPicker(true)} 
          />
          <MenuItem icon="mail-outline" label="Email" value={user?.email} showArrow={false} />
          {user?.phone_number && (
            <MenuItem icon="call-outline" label="Phone" value={user.phone_number} showArrow={false} />
          )}
          <MenuItem icon="qr-code" label="My QR Code" onPress={handleMyQRCode} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Preferences</Text>
          <MenuItem
            icon="notifications-outline"
            label="Notifications"
            showArrow={false}
            rightComponent={
              <Switch
                value={notificationsEnabled}
                onValueChange={handleNotificationsToggle}
                trackColor={{ false: theme.border, true: theme.primary }}
              />
            }
          />
          <MenuItem icon="moon-outline" label="Appearance" value="System" onPress={handleAppearance} />
          <MenuItem icon="language-outline" label="Language" value="English" onPress={handleLanguage} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Social</Text>
          <MenuItem icon="people-outline" label="Invite Friends" onPress={handleInviteFriends} />
          <MenuItem icon="add-circle-outline" label="New Group" onPress={() => router.push('/new-group')} />
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Support</Text>
          <MenuItem icon="help-circle-outline" label="Help Center" onPress={handleHelpCenter} />
          <MenuItem icon="chatbubble-outline" label="Contact Us" onPress={() => handleContactUs()} />
          <MenuItem icon="star-outline" label="Rate the App" onPress={handleRateApp} />
          <MenuItem icon="information-circle-outline" label="About" onPress={handleAbout} />
        </View>

        <TouchableOpacity
          style={[styles.logoutButton, { backgroundColor: theme.surface }]}
          onPress={handleLogout}
          disabled={loggingOut}
        >
          {loggingOut ? (
            <ActivityIndicator size="small" color={theme.error} />
          ) : (
            <>
              <Ionicons name="log-out-outline" size={20} color={theme.error} />
              <Text style={[styles.logoutText, { color: theme.error }]}>Logout</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={[styles.version, { color: theme.textSecondary }]}>
          ConnectX v1.0.0
        </Text>
      </ScrollView>

      {/* Profile Photo Picker Modal */}
      <ProfilePhotoPicker
        visible={showPhotoPicker}
        onClose={() => setShowPhotoPicker(false)}
        onPhotoSelected={handlePhotoSelected}
        onRemovePhoto={handleRemovePhoto}
        currentPhoto={user?.profile_photo}
        theme={theme}
      />

      {/* QR Code Modal */}
      <Modal
        visible={showQRModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowQRModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowQRModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>My QR Code</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <View style={styles.qrContent}>
            <View style={[styles.qrContainer, { backgroundColor: '#FFFFFF' }]}>
              {/* QR Code placeholder - in production use react-native-qrcode-svg */}
              <View style={styles.qrPlaceholder}>
                <Ionicons name="qr-code" size={150} color={theme.primary} />
              </View>
            </View>
            <Text style={[styles.qrUsername, { color: theme.text }]}>@{user?.username}</Text>
            <Text style={[styles.qrHint, { color: theme.textSecondary }]}>
              Scan this code to add me on ConnectX
            </Text>
            
            <View style={styles.qrActions}>
              <TouchableOpacity
                style={[styles.qrButton, { backgroundColor: theme.surface }]}
                onPress={handleCopyUsername}
              >
                <Ionicons name="copy-outline" size={20} color={theme.primary} />
                <Text style={[styles.qrButtonText, { color: theme.primary }]}>Copy Username</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.qrButton, { backgroundColor: theme.primary }]}
                onPress={handleInviteFriends}
              >
                <Ionicons name="share-outline" size={20} color="#FFFFFF" />
                <Text style={[styles.qrButtonText, { color: '#FFFFFF' }]}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Appearance Modal */}
      <Modal
        visible={showAppearanceModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAppearanceModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowAppearanceModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Appearance</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <View style={styles.optionsList}>
            {['System', 'Light', 'Dark'].map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.optionItem, { backgroundColor: theme.surface }]}
                onPress={() => {
                  Alert.alert('Theme Changed', `Theme set to ${option}`);
                  setShowAppearanceModal(false);
                }}
              >
                <Ionicons 
                  name={option === 'Dark' ? 'moon' : option === 'Light' ? 'sunny' : 'phone-portrait'} 
                  size={24} 
                  color={theme.primary} 
                />
                <Text style={[styles.optionText, { color: theme.text }]}>{option}</Text>
                {option === 'System' && (
                  <Ionicons name="checkmark" size={24} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* Language Modal */}
      <Modal
        visible={showLanguageModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowLanguageModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowLanguageModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Language</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <View style={styles.optionsList}>
            {[
              { code: 'en', name: 'English', native: 'English' },
              { code: 'es', name: 'Spanish', native: 'Español' },
              { code: 'fr', name: 'French', native: 'Français' },
              { code: 'de', name: 'German', native: 'Deutsch' },
              { code: 'zh', name: 'Chinese', native: '中文' },
              { code: 'hi', name: 'Hindi', native: 'हिन्दी' },
              { code: 'ne', name: 'Nepali', native: 'नेपाली' },
            ].map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[styles.optionItem, { backgroundColor: theme.surface }]}
                onPress={() => {
                  Alert.alert('Language Changed', `Language set to ${lang.name}`);
                  setShowLanguageModal(false);
                }}
              >
                <Text style={[styles.langNative, { color: theme.text }]}>{lang.native}</Text>
                <Text style={[styles.langName, { color: theme.textSecondary }]}>{lang.name}</Text>
                {lang.code === 'en' && (
                  <Ionicons name="checkmark" size={24} color={theme.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>

      {/* About Modal */}
      <Modal
        visible={showAboutModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAboutModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowAboutModal(false)}>
              <Ionicons name="close" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>About</Text>
            <View style={{ width: 24 }} />
          </View>
          
          <ScrollView contentContainerStyle={styles.aboutContent}>
            <View style={[styles.aboutLogo, { backgroundColor: theme.primary }]}>
              <Ionicons name="chatbubbles" size={60} color="#FFFFFF" />
            </View>
            <Text style={[styles.aboutAppName, { color: theme.text }]}>ConnectX</Text>
            <Text style={[styles.aboutVersion, { color: theme.textSecondary }]}>Version 1.0.0</Text>
            
            <Text style={[styles.aboutDescription, { color: theme.textSecondary }]}>
              ConnectX is your all-in-one messaging app for staying connected with friends, 
              family, and colleagues. Enjoy secure messaging, voice & video calls, 
              and seamless file sharing.
            </Text>
            
            <View style={styles.aboutLinks}>
              <TouchableOpacity
                style={[styles.aboutLink, { backgroundColor: theme.surface }]}
                onPress={() => Linking.openURL('https://connectx.app/privacy')}
              >
                <Ionicons name="shield-checkmark-outline" size={20} color={theme.primary} />
                <Text style={[styles.aboutLinkText, { color: theme.text }]}>Privacy Policy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.aboutLink, { backgroundColor: theme.surface }]}
                onPress={() => Linking.openURL('https://connectx.app/terms')}
              >
                <Ionicons name="document-text-outline" size={20} color={theme.primary} />
                <Text style={[styles.aboutLinkText, { color: theme.text }]}>Terms of Service</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.aboutLink, { backgroundColor: theme.surface }]}
                onPress={() => Linking.openURL('https://connectx.app/licenses')}
              >
                <Ionicons name="code-outline" size={20} color={theme.primary} />
                <Text style={[styles.aboutLinkText, { color: theme.text }]}>Open Source Licenses</Text>
              </TouchableOpacity>
            </View>
            
            <Text style={[styles.aboutCopyright, { color: theme.textSecondary }]}>
              © 2025 ConnectX. All rights reserved.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
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
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  avatarContainer: {
    position: 'relative',
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfo: {
    flex: 1,
    marginLeft: 16,
  },
  displayName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  username: {
    fontSize: 14,
    marginTop: 2,
  },
  statusMessage: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginHorizontal: 16,
    marginBottom: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  menuValue: {
    fontSize: 13,
    marginTop: 2,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  // QR Modal
  qrContent: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
    paddingHorizontal: 24,
  },
  qrContainer: {
    padding: 24,
    borderRadius: 20,
    marginBottom: 24,
  },
  qrPlaceholder: {
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrUsername: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  qrHint: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  qrActions: {
    flexDirection: 'row',
    gap: 12,
  },
  qrButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  qrButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  // Options List
  optionsList: {
    padding: 16,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  langNative: {
    fontSize: 16,
    fontWeight: '600',
    width: 80,
  },
  langName: {
    flex: 1,
    fontSize: 14,
    marginLeft: 12,
  },
  // About Modal
  aboutContent: {
    alignItems: 'center',
    padding: 24,
  },
  aboutLogo: {
    width: 100,
    height: 100,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  aboutAppName: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  aboutVersion: {
    fontSize: 14,
    marginBottom: 24,
  },
  aboutDescription: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 32,
  },
  aboutLinks: {
    width: '100%',
    gap: 8,
    marginBottom: 24,
  },
  aboutLink: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 12,
  },
  aboutLinkText: {
    fontSize: 16,
  },
  aboutCopyright: {
    fontSize: 12,
    marginTop: 16,
  },
});
