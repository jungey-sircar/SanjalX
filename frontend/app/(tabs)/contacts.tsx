import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Alert,
  Modal,
  SectionList,
  Platform,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import * as SMS from 'expo-sms';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import api from '../../src/services/api';
import { User, DeviceContact, MatchedContact } from '../../src/types';

interface ContactSection {
  title: string;
  data: MatchedContact[];
}

export default function ContactsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [appContacts, setAppContacts] = useState<User[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [matchedContacts, setMatchedContacts] = useState<MatchedContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hasContactPermission, setHasContactPermission] = useState<boolean | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [addSearchQuery, setAddSearchQuery] = useState('');

  const requestContactPermission = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    setHasContactPermission(status === 'granted');
    return status === 'granted';
  };

  const loadDeviceContacts = async () => {
    if (Platform.OS === 'web') {
      // Web doesn't support contacts
      return [];
    }

    const hasPermission = await requestContactPermission();
    if (!hasPermission) {
      return [];
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Image],
    });

    const contacts: DeviceContact[] = data
      .filter(contact => contact.phoneNumbers && contact.phoneNumbers.length > 0)
      .map(contact => ({
        id: contact.id || String(Math.random()),
        name: contact.name || 'Unknown',
        phoneNumbers: contact.phoneNumbers?.map(p => p.number || '').filter(p => p) || [],
        image: contact.image?.uri,
      }));

    // Cache contacts locally
    await AsyncStorage.setItem('deviceContacts', JSON.stringify(contacts));
    
    return contacts;
  };

  const matchContactsWithServer = async (contacts: DeviceContact[]) => {
    if (contacts.length === 0) return [];

    // Get all phone numbers
    const allPhoneNumbers = contacts.flatMap(c => c.phoneNumbers);
    
    try {
      const response = await api.post('/contacts/match-phones', {
        phone_numbers: allPhoneNumbers,
      });

      // Map results back to device contacts
      const matchResults: MatchedContact[] = [];
      const phoneToMatch = new Map(response.data.map((r: any) => [r.phone_number, r]));

      for (const contact of contacts) {
        let matched = false;
        for (const phone of contact.phoneNumbers) {
          const match = phoneToMatch.get(phone);
          if (match && match.is_registered) {
            matchResults.push({
              phone_number: phone,
              is_registered: true,
              user: match.user,
              deviceContact: contact,
            });
            matched = true;
            break;
          }
        }
        if (!matched && contact.phoneNumbers.length > 0) {
          matchResults.push({
            phone_number: contact.phoneNumbers[0],
            is_registered: false,
            user: null,
            deviceContact: contact,
          });
        }
      }

      return matchResults;
    } catch (error) {
      console.error('Error matching contacts:', error);
      // Return all as unregistered on error
      return contacts.map(c => ({
        phone_number: c.phoneNumbers[0] || '',
        is_registered: false,
        user: null,
        deviceContact: c,
      }));
    }
  };

  const loadAppContacts = async () => {
    try {
      const response = await api.get('/contacts');
      setAppContacts(response.data);
    } catch (error) {
      console.error('Error loading app contacts:', error);
    }
  };

  const loadAllContacts = async () => {
    setLoading(true);
    try {
      // Load app contacts and device contacts in parallel
      const [_, deviceContactsData] = await Promise.all([
        loadAppContacts(),
        loadDeviceContacts(),
      ]);

      setDeviceContacts(deviceContactsData);

      // Match device contacts with server
      const matched = await matchContactsWithServer(deviceContactsData);
      setMatchedContacts(matched);
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadAllContacts();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllContacts();
    setRefreshing(false);
  };

  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await api.get(`/users/search?query=${query}`);
      const results = response.data.filter(
        (user: User) => !appContacts.find(c => c.id === user.id)
      );
      setSearchResults(results);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  const addContact = async (userId: string) => {
    try {
      await api.post('/contacts/add', { user_id: userId });
      await loadAppContacts();
      setShowAddModal(false);
      setAddSearchQuery('');
      setSearchResults([]);
      Alert.alert('Success', 'Contact added!');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add contact');
    }
  };

  const inviteContact = async (contact: MatchedContact) => {
    const isAvailable = await SMS.isAvailableAsync();
    if (isAvailable) {
      const { result } = await SMS.sendSMSAsync(
        [contact.phone_number],
        `Hey! Join me on ConnectX - the best messaging app! Download now: https://connectx.app/download`
      );
      if (result === 'sent') {
        Alert.alert('Invite Sent', `Invitation sent to ${contact.deviceContact?.name}`);
      }
    } else {
      // Fallback to sharing
      Alert.alert(
        'Invite',
        `SMS not available. Share this link with ${contact.deviceContact?.name}: https://connectx.app/download`
      );
    }
  };

  const handleContactPress = (contact: MatchedContact) => {
    if (contact.is_registered && contact.user) {
      router.push(`/chat/${contact.user.id}`);
    } else {
      Alert.alert(
        'Invite to ConnectX',
        `${contact.deviceContact?.name} is not on ConnectX yet. Would you like to invite them?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Invite', onPress: () => inviteContact(contact) },
        ]
      );
    }
  };

  // Get sections for the list
  const getSections = (): ContactSection[] => {
    const filtered = matchedContacts.filter(contact => {
      const name = contact.deviceContact?.name || contact.user?.display_name || '';
      return name.toLowerCase().includes(searchQuery.toLowerCase());
    });

    const registered = filtered.filter(c => c.is_registered);
    const notRegistered = filtered.filter(c => !c.is_registered);

    const sections: ContactSection[] = [];
    
    if (registered.length > 0) {
      sections.push({
        title: 'On ConnectX',
        data: registered,
      });
    }
    
    if (notRegistered.length > 0) {
      sections.push({
        title: 'Invite to ConnectX',
        data: notRegistered,
      });
    }

    return sections;
  };

  const renderContact = ({ item }: { item: MatchedContact }) => (
    <TouchableOpacity
      style={[styles.contactItem, { backgroundColor: theme.surface }]}
      onPress={() => handleContactPress(item)}
    >
      <Avatar
        source={item.user?.profile_photo || undefined}
        name={item.deviceContact?.name || item.user?.display_name || ''}
        size={50}
        isOnline={item.user?.is_online}
      />
      <View style={styles.contactContent}>
        <Text style={[styles.userName, { color: theme.text }]}>
          {item.deviceContact?.name || item.user?.display_name}
        </Text>
        {item.is_registered ? (
          <View style={styles.statusRow}>
            <Ionicons name="checkmark-circle" size={14} color={theme.success} />
            <Text style={[styles.statusText, { color: theme.success }]}>
              Available on ConnectX
            </Text>
          </View>
        ) : (
          <Text style={[styles.phoneNumber, { color: theme.textSecondary }]}>
            {item.phone_number}
          </Text>
        )}
      </View>
      <View style={styles.actions}>
        {item.is_registered ? (
          <>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/chat/${item.user!.id}`)}
            >
              <Ionicons name="chatbubble" size={20} color={theme.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => router.push(`/call/${item.user!.id}?type=voice`)}
            >
              <Ionicons name="call" size={20} color={theme.primary} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.inviteButton, { backgroundColor: theme.primary }]}
            onPress={() => inviteContact(item)}
          >
            <Text style={styles.inviteButtonText}>Invite</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: { section: ContactSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {section.title} ({section.data.length})
      </Text>
    </View>
  );

  const renderSearchResult = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.contactItem, { backgroundColor: theme.surface }]}
      onPress={() => addContact(item.id)}
    >
      <Avatar
        source={item.profile_photo}
        name={item.display_name}
        size={50}
      />
      <View style={styles.contactContent}>
        <Text style={[styles.userName, { color: theme.text }]}>
          {item.display_name}
        </Text>
        <Text style={[styles.statusMessage, { color: theme.textSecondary }]}>
          @{item.username}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.addButton, { backgroundColor: theme.primary }]}
        onPress={() => addContact(item.id)}
      >
        <Ionicons name="add" size={20} color="#FFFFFF" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const renderPermissionRequest = () => (
    <View style={styles.permissionContainer}>
      <Ionicons name="people-outline" size={64} color={theme.textSecondary} />
      <Text style={[styles.permissionTitle, { color: theme.text }]}>
        Access Your Contacts
      </Text>
      <Text style={[styles.permissionText, { color: theme.textSecondary }]}>
        To find friends on ConnectX, we need access to your contacts. Your contacts are processed securely and never shared publicly.
      </Text>
      <TouchableOpacity
        style={[styles.permissionButton, { backgroundColor: theme.primary }]}
        onPress={async () => {
          const granted = await requestContactPermission();
          if (granted) {
            loadAllContacts();
          }
        }}
      >
        <Text style={styles.permissionButtonText}>Allow Access</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Contacts</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Loading contacts...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Contacts</Text>
        <TouchableOpacity onPress={() => setShowAddModal(true)}>
          <Ionicons name="person-add" size={24} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search contacts..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {Platform.OS !== 'web' && hasContactPermission === false ? (
        renderPermissionRequest()
      ) : getSections().length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            {searchQuery ? 'No contacts found' : 'No contacts yet'}
          </Text>
          <TouchableOpacity
            style={[styles.addContactButton, { backgroundColor: theme.primary }]}
            onPress={() => setShowAddModal(true)}
          >
            <Text style={styles.addContactButtonText}>Add Contacts</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <SectionList
          sections={getSections()}
          renderItem={renderContact}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.phone_number + (item.user?.id || '')}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        />
      )}

      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Contact</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by username or email..."
              placeholderTextColor={theme.textSecondary}
              value={addSearchQuery}
              onChangeText={(text) => {
                setAddSearchQuery(text);
                searchUsers(text);
              }}
              autoFocus
            />
          </View>

          {searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              renderItem={renderSearchResult}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContent}
            />
          ) : addSearchQuery.length >= 2 ? (
            <View style={styles.noResultsContainer}>
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                No users found
              </Text>
            </View>
          ) : (
            <View style={styles.noResultsContainer}>
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                Enter at least 2 characters to search
              </Text>
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  listContent: {
    paddingBottom: 16,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
  },
  contactContent: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  statusText: {
    fontSize: 13,
  },
  statusMessage: {
    fontSize: 13,
    marginTop: 2,
  },
  phoneNumber: {
    fontSize: 13,
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    padding: 8,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  inviteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  inviteButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
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
    marginBottom: 24,
  },
  addContactButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
  },
  addContactButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  permissionText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
    lineHeight: 20,
  },
  permissionButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 24,
  },
  permissionButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  cancelText: {
    fontSize: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noResultsText: {
    fontSize: 16,
  },
});
