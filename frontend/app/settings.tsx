import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../src/hooks/useTheme';
import { useAuthStore } from '../src/store/authStore';

export default function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const { logout } = useAuthStore();
  
  const [notifications, setNotifications] = useState(true);
  const [messagePreview, setMessagePreview] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all cached data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('deviceContacts');
            Alert.alert('Done', 'Cache cleared successfully');
          },
        },
      ]
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            Alert.alert('Not Available', 'Account deletion is not available in this demo.');
          },
        },
      ]
    );
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
            await logout();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  };

  const SettingItem = ({ icon, label, value, onPress, showArrow = true, rightComponent }: {
    icon: string;
    label: string;
    value?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightComponent?: React.ReactNode;
  }) => (
    <TouchableOpacity
      style={[styles.settingItem, { backgroundColor: theme.surface }]}
      onPress={onPress}
      disabled={!onPress && !rightComponent}
    >
      <View style={[styles.settingIcon, { backgroundColor: theme.background }]}>
        <Ionicons name={icon as any} size={20} color={theme.primary} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: theme.text }]}>{label}</Text>
        {value && (
          <Text style={[styles.settingValue, { color: theme.textSecondary }]}>{value}</Text>
        )}
      </View>
      {rightComponent || (showArrow && onPress && (
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      ))}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Notifications</Text>
        <SettingItem
          icon="notifications"
          label="Push Notifications"
          showArrow={false}
          rightComponent={
            <Switch
              value={notifications}
              onValueChange={setNotifications}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          }
        />
        <SettingItem
          icon="eye"
          label="Message Preview"
          showArrow={false}
          rightComponent={
            <Switch
              value={messagePreview}
              onValueChange={setMessagePreview}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          }
        />
        <SettingItem
          icon="volume-high"
          label="Sound"
          showArrow={false}
          rightComponent={
            <Switch
              value={soundEnabled}
              onValueChange={setSoundEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          }
        />
        <SettingItem
          icon="phone-portrait"
          label="Vibration"
          showArrow={false}
          rightComponent={
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ false: theme.border, true: theme.primary }}
            />
          }
        />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Appearance</Text>
        <SettingItem
          icon="moon"
          label="Theme"
          value={colorScheme === 'dark' ? 'Dark' : 'Light'}
        />
        <SettingItem
          icon="text"
          label="Font Size"
          value="Medium"
        />
        <SettingItem
          icon="language"
          label="Language"
          value="English"
        />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Privacy</Text>
        <SettingItem
          icon="lock-closed"
          label="Privacy Settings"
          onPress={() => {}}
        />
        <SettingItem
          icon="eye-off"
          label="Blocked Users"
          onPress={() => {}}
        />
        <SettingItem
          icon="time"
          label="Last Seen"
          value="Everyone"
          onPress={() => {}}
        />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Storage</Text>
        <SettingItem
          icon="folder"
          label="Storage Usage"
          value="12.5 MB"
          onPress={() => {}}
        />
        <SettingItem
          icon="trash"
          label="Clear Cache"
          onPress={handleClearCache}
        />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>About</Text>
        <SettingItem
          icon="information-circle"
          label="App Version"
          value="1.0.0"
          showArrow={false}
        />
        <SettingItem
          icon="document-text"
          label="Terms of Service"
          onPress={() => {}}
        />
        <SettingItem
          icon="shield-checkmark"
          label="Privacy Policy"
          onPress={() => {}}
        />
        <SettingItem
          icon="help-circle"
          label="Help Center"
          onPress={() => {}}
        />

        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>Account</Text>
        <TouchableOpacity
          style={[styles.dangerButton, { backgroundColor: theme.surface }]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out" size={20} color={theme.error} />
          <Text style={[styles.dangerButtonText, { color: theme.error }]}>Logout</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dangerButton, { backgroundColor: theme.surface }]}
          onPress={handleDeleteAccount}
        >
          <Ionicons name="trash" size={20} color={theme.error} />
          <Text style={[styles.dangerButtonText, { color: theme.error }]}>Delete Account</Text>
        </TouchableOpacity>
      </ScrollView>
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
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 12,
    marginLeft: 4,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    marginBottom: 8,
  },
  settingIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingContent: {
    flex: 1,
    marginLeft: 12,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingValue: {
    fontSize: 13,
    marginTop: 2,
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    gap: 8,
  },
  dangerButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
