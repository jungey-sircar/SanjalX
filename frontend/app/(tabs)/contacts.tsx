import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Modal,
  Alert,
  SectionList,
  ActivityIndicator,
  Platform,
  Share,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import { useAuthStore } from '../../src/store/authStore';
import api from '../../src/services/api';
import { User } from '../../src/types';

interface ContactSection {
  title: string;
  data: User[];
}

interface DeviceContact {
  id: string;
  name: string;
  phoneNumbers: string[];
}

export default function ContactsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuthStore();
  const [contacts, setContacts] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showPhoneContactsModal, setShowPhoneContactsModal] = useState(false);
  const [showAddByPhoneModal, setShowAddByPhoneModal] = useState(false);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [addSearchQuery, setAddSearchQuery] = useState('');
  const [starredContacts, setStarredContacts] = useState<User[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [matchedUsers, setMatchedUsers] = useState<User[]>([]);
  const [loadingPhoneContacts, setLoadingPhoneContacts] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [phoneSearchResults, setPhoneSearchResults] = useState<User[]>([]);
  const [searchingByPhone, setSearchingByPhone] = useState(false);
  const sectionListRef = useRef<SectionList>(null);

  const loadContacts = async () => {
    try {
      const response = await api.get('/contacts');
      setContacts(response.data);
      // For demo, first contact is starred
      if (response.data.length > 0) {
        setStarredContacts([response.data[0]]);
      }
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadContacts();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContacts();
    setRefreshing(false);
  };

  const handleSearch = async (query: string) => {
    setAddSearchQuery(query);
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
      // Filter out current user and existing contacts
      const filtered = response.data.filter(
        (u: User) => u.id !== user?.id && !contacts.find((c) => c.id === u.id)
      );
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  const handleAddContact = async (contactUser: User) => {
    try {
      await api.post('/contacts/add', { user_id: contactUser.id });
      Alert.alert('Success', `${contactUser.display_name} added to contacts!`);
      setShowAddModal(false);
      setShowPhoneContactsModal(false);
      setShowAddByPhoneModal(false);
      setAddSearchQuery('');
      setSearchResults([]);
      setPhoneNumber('');
      setPhoneSearchResults([]);
      loadContacts();
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add contact');
    }
  };

  // Load device contacts
  const loadDeviceContacts = async () => {
    setLoadingPhoneContacts(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Please grant contacts permission to find friends from your phone contacts.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() }
          ]
        );
        setLoadingPhoneContacts(false);
        return;
      }

      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name],
      });

      // Process device contacts
      const processedContacts: DeviceContact[] = [];
      const allPhoneNumbers: string[] = [];

      data.forEach((contact) => {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
          const phones = contact.phoneNumbers
            .map((p) => p.number || '')
            .filter((p) => p.length > 0);
          
          if (phones.length > 0) {
            processedContacts.push({
              id: contact.id || Math.random().toString(),
              name: contact.name || 'Unknown',
              phoneNumbers: phones,
            });
            allPhoneNumbers.push(...phones);
          }
        }
      });

      setDeviceContacts(processedContacts);

      // Search for matching users on the platform
      if (allPhoneNumbers.length > 0) {
        try {
          const response = await api.post('/users/search-by-phones', {
            phone_numbers: allPhoneNumbers.slice(0, 100), // Limit to prevent too large request
          });
          // Filter out existing contacts
          const filtered = response.data.filter(
            (u: User) => u.id !== user?.id && !contacts.find((c) => c.id === u.id)
          );
          setMatchedUsers(filtered);
        } catch (error) {
          console.error('Error searching by phone numbers:', error);
        }
      }
    } catch (error) {
      console.error('Error loading device contacts:', error);
      Alert.alert('Error', 'Failed to load phone contacts');
    } finally {
      setLoadingPhoneContacts(false);
    }
  };

  const handleOpenPhoneContacts = () => {
    setShowPhoneContactsModal(true);
    loadDeviceContacts();
  };

  // Search by phone number
  const handleSearchByPhone = async (phone: string) => {
    setPhoneNumber(phone);
    if (phone.length < 7) {
      setPhoneSearchResults([]);
      return;
    }

    setSearchingByPhone(true);
    try {
      const response = await api.get(`/users/search?query=${encodeURIComponent(phone)}`);
      // Filter out current user and existing contacts
      const filtered = response.data.filter(
        (u: User) => u.id !== user?.id && !contacts.find((c) => c.id === u.id)
      );
      setPhoneSearchResults(filtered);
    } catch (error) {
      console.error('Error searching by phone:', error);
    } finally {
      setSearchingByPhone(false);
    }
  };

  const handleShareProfile = async () => {
    try {
      await Share.share({
        message: `Add me on ConnectX! My username: @${user?.username}\n\nDownload: https://connectx.app/download`,
        title: 'Share My Profile',
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  // Group contacts alphabetically
  const getGroupedContacts = (): ContactSection[] => {
    const filtered = contacts.filter(
      (c) =>
        c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Remove starred contacts from main list
    const nonStarred = filtered.filter(
      (c) => !starredContacts.find((s) => s.id === c.id)
    );

    // Group by first letter
    const grouped: { [key: string]: User[] } = {};
    nonStarred.forEach((contact) => {
      const firstChar = contact.display_name.charAt(0).toUpperCase();
      const key = /[A-Z]/.test(firstChar) ? firstChar : '#';
      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(contact);
    });

    // Sort each group
    Object.keys(grouped).forEach((key) => {
      grouped[key].sort((a, b) => a.display_name.localeCompare(b.display_name));
    });

    // Convert to sections array
    const sections: ContactSection[] = [];

    // Add starred section if there are starred contacts
    if (starredContacts.length > 0 && !searchQuery) {
      sections.push({ title: 'Starred', data: starredContacts });
    }

    // Add alphabetical sections
    const sortedKeys = Object.keys(grouped).sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    });

    sortedKeys.forEach((key) => {
      sections.push({ title: key, data: grouped[key] });
    });

    return sections;
  };

  const sections = getGroupedContacts();

  // Get all section letters for the index
  const getIndexLetters = () => {
    return ['☆', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '#'];
  };

  const scrollToSection = (letter: string) => {
    const sectionTitle = letter === '☆' ? 'Starred' : letter;
    const sectionIndex = sections.findIndex((s) => s.title === sectionTitle);
    if (sectionIndex !== -1 && sectionListRef.current) {
      sectionListRef.current.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewOffset: 0,
        animated: true,
      });
    }
  };

  const QuickAccessItem = ({
    icon,
    label,
    color,
    onPress,
  }: {
    icon: string;
    label: string;
    color: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.quickAccessItem} onPress={onPress}>
      <View style={[styles.quickAccessIcon, { backgroundColor: color }]}>
        <Ionicons name={icon as any} size={24} color="#FFFFFF" />
      </View>
      <Text style={[styles.quickAccessLabel, { color: theme.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderSectionHeader = ({ section }: { section: ContactSection }) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
      <Text style={[styles.sectionHeaderText, { color: theme.textSecondary }]}>
        {section.title}
      </Text>
    </View>
  );

  const renderContact = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={[styles.contactItem, { backgroundColor: theme.background }]}
      onPress={() => router.push(`/chat/${item.id}`)}
    >
      <Avatar
        source={item.profile_photo}
        name={item.display_name}
        size={44}
        isOnline={item.is_online}
      />
      <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
        {item.display_name}
      </Text>
    </TouchableOpacity>
  );

  const ListHeader = () => (
    <View>
      {/* Quick Access Section */}
      <View style={styles.quickAccessSection}>
        <QuickAccessItem
          icon="person-add"
          label="New Friends"
          color="#FF9500"
          onPress={() => setShowAddModal(true)}
        />
        <QuickAccessItem
          icon="people"
          label="Group Chats"
          color="#FF9500"
          onPress={() => router.push('/new-group')}
        />
        <QuickAccessItem
          icon="pricetag"
          label="Tags"
          color="#34C759"
          onPress={() => Alert.alert('Tags', 'Organize contacts with tags')}
        />
        <QuickAccessItem
          icon="at"
          label="Official Accounts"
          color="#007AFF"
          onPress={() => Alert.alert('Official Accounts', 'Follow official accounts for updates')}
        />
        <QuickAccessItem
          icon="diamond"
          label="Service Accounts"
          color="#5856D6"
          onPress={() => Alert.alert('Service Accounts', 'Access service providers')}
        />
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Contacts</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowSearchModal(true)}
          >
            <Ionicons name="search" size={22} color={theme.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={() => setShowAddModal(true)}
          >
            <Ionicons name="add-circle-outline" size={24} color={theme.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        <SectionList
          ref={sectionListRef}
          sections={sections}
          keyExtractor={(item) => item.id}
          renderItem={renderContact}
          renderSectionHeader={renderSectionHeader}
          ListHeaderComponent={ListHeader}
          stickySectionHeadersEnabled={true}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={64} color={theme.textSecondary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No contacts yet
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
                Add friends to start chatting
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={() => {}}
        />

        {/* Alphabetical Index */}
        <View style={styles.indexContainer}>
          {getIndexLetters().map((letter) => (
            <TouchableOpacity
              key={letter}
              style={styles.indexItem}
              onPress={() => scrollToSection(letter)}
            >
              <Text style={[styles.indexLetter, { color: theme.textSecondary }]}>
                {letter}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Search Modal */}
      <Modal
        visible={showSearchModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowSearchModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowSearchModal(false)}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Search Contacts</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by name or username..."
              placeholderTextColor={theme.textSecondary}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={contacts.filter(
              (c) =>
                c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                c.username.toLowerCase().includes(searchQuery.toLowerCase())
            )}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                onPress={() => {
                  setShowSearchModal(false);
                  router.push(`/chat/${item.id}`);
                }}
              >
                <Avatar source={item.profile_photo} name={item.display_name} size={44} />
                <View style={styles.contactInfo}>
                  <Text style={[styles.contactNameList, { color: theme.text }]}>
                    {item.display_name}
                  </Text>
                  <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
                    @{item.username}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.searchResults}
          />
        </SafeAreaView>
      </Modal>

      {/* Add Contact Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>New Friends</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
            <Ionicons name="search" size={20} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by username or email..."
              placeholderTextColor={theme.textSecondary}
              value={addSearchQuery}
              onChangeText={handleSearch}
            />
            {addSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => {
                setAddSearchQuery('');
                setSearchResults([]);
              }}>
                <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {searching ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Searching...
              </Text>
            </View>
          ) : searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                  onPress={() => handleAddContact(item)}
                >
                  <Avatar source={item.profile_photo} name={item.display_name} size={48} />
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactNameList, { color: theme.text }]}>
                      {item.display_name}
                    </Text>
                    <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
                      @{item.username}
                    </Text>
                  </View>
                  <View style={[styles.addButton, { backgroundColor: theme.primary }]}>
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchResults}
            />
          ) : addSearchQuery.length >= 2 ? (
            <View style={styles.noResultsContainer}>
              <Ionicons name="search" size={48} color={theme.textSecondary} />
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                No users found
              </Text>
            </View>
          ) : (
            /* Quick Add Options */
            <View style={styles.quickAddOptions}>
              <TouchableOpacity 
                style={[styles.quickAddItem, { backgroundColor: theme.surface }]}
                onPress={() => Alert.alert('Scan QR Code', 'Open camera to scan QR code')}
              >
                <View style={[styles.quickAddIcon, { backgroundColor: '#FF9500' }]}>
                  <Ionicons name="qr-code" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.quickAddLabel, { color: theme.text }]}>Scan QR Code</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.quickAddItem, { backgroundColor: theme.surface }]}
                onPress={handleOpenPhoneContacts}
              >
                <View style={[styles.quickAddIcon, { backgroundColor: '#34C759' }]}>
                  <Ionicons name="phone-portrait" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.quickAddLabel, { color: theme.text }]}>Add from Phone Contacts</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.quickAddItem, { backgroundColor: theme.surface }]}
                onPress={() => setShowAddByPhoneModal(true)}
              >
                <View style={[styles.quickAddIcon, { backgroundColor: '#5856D6' }]}>
                  <Ionicons name="call" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.quickAddLabel, { color: theme.text }]}>Add by Phone Number</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.quickAddItem, { backgroundColor: theme.surface }]}
                onPress={handleShareProfile}
              >
                <View style={[styles.quickAddIcon, { backgroundColor: '#007AFF' }]}>
                  <Ionicons name="share-social" size={24} color="#FFFFFF" />
                </View>
                <Text style={[styles.quickAddLabel, { color: theme.text }]}>Share My Profile</Text>
                <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Phone Contacts Modal */}
      <Modal
        visible={showPhoneContactsModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowPhoneContactsModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowPhoneContactsModal(false)}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Phone Contacts</Text>
            <View style={{ width: 60 }} />
          </View>

          {loadingPhoneContacts ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Scanning your contacts...
              </Text>
            </View>
          ) : matchedUsers.length > 0 ? (
            <View style={{ flex: 1 }}>
              <View style={styles.matchedHeader}>
                <Text style={[styles.matchedTitle, { color: theme.text }]}>
                  Friends on ConnectX
                </Text>
                <Text style={[styles.matchedSubtitle, { color: theme.textSecondary }]}>
                  {matchedUsers.length} contact{matchedUsers.length > 1 ? 's' : ''} found from your phone
                </Text>
              </View>
              <FlatList
                data={matchedUsers}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                    onPress={() => handleAddContact(item)}
                  >
                    <Avatar source={item.profile_photo} name={item.display_name} size={48} />
                    <View style={styles.contactInfo}>
                      <Text style={[styles.contactNameList, { color: theme.text }]}>
                        {item.display_name}
                      </Text>
                      <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
                        @{item.username} • {item.phone_number}
                      </Text>
                    </View>
                    <View style={[styles.addButton, { backgroundColor: theme.primary }]}>
                      <Ionicons name="add" size={20} color="#FFFFFF" />
                    </View>
                  </TouchableOpacity>
                )}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.searchResults}
              />
            </View>
          ) : (
            <View style={styles.noResultsContainer}>
              <Ionicons name="people-outline" size={64} color={theme.textSecondary} />
              <Text style={[styles.noResultsTitle, { color: theme.text }]}>
                No matches found
              </Text>
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                None of your phone contacts are using ConnectX yet.
                Invite them to join!
              </Text>
              <TouchableOpacity
                style={[styles.inviteButton, { backgroundColor: theme.primary }]}
                onPress={handleShareProfile}
              >
                <Ionicons name="share-social" size={20} color="#FFFFFF" />
                <Text style={styles.inviteButtonText}>Invite Friends</Text>
              </TouchableOpacity>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      {/* Add by Phone Number Modal */}
      <Modal
        visible={showAddByPhoneModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddByPhoneModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => {
              setShowAddByPhoneModal(false);
              setPhoneNumber('');
              setPhoneSearchResults([]);
            }}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add by Phone</Text>
            <View style={{ width: 60 }} />
          </View>

          <View style={styles.phoneInputSection}>
            <Text style={[styles.phoneInputLabel, { color: theme.textSecondary }]}>
              Enter phone number
            </Text>
            <View style={[styles.phoneInputContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Ionicons name="call" size={20} color={theme.textSecondary} />
              <TextInput
                style={[styles.phoneInput, { color: theme.text }]}
                placeholder="+1 234 567 8900"
                placeholderTextColor={theme.textSecondary}
                value={phoneNumber}
                onChangeText={handleSearchByPhone}
                keyboardType="phone-pad"
                autoFocus
              />
              {phoneNumber.length > 0 && (
                <TouchableOpacity onPress={() => {
                  setPhoneNumber('');
                  setPhoneSearchResults([]);
                }}>
                  <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={[styles.phoneInputHint, { color: theme.textSecondary }]}>
              Include country code for best results
            </Text>
          </View>

          {searchingByPhone ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
                Searching...
              </Text>
            </View>
          ) : phoneSearchResults.length > 0 ? (
            <FlatList
              data={phoneSearchResults}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.searchResultItem, { backgroundColor: theme.surface }]}
                  onPress={() => handleAddContact(item)}
                >
                  <Avatar source={item.profile_photo} name={item.display_name} size={48} />
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactNameList, { color: theme.text }]}>
                      {item.display_name}
                    </Text>
                    <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
                      @{item.username}
                    </Text>
                  </View>
                  <View style={[styles.addButton, { backgroundColor: theme.primary }]}>
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </View>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.searchResults}
            />
          ) : phoneNumber.length >= 7 ? (
            <View style={styles.noResultsContainer}>
              <Ionicons name="person-outline" size={48} color={theme.textSecondary} />
              <Text style={[styles.noResultsText, { color: theme.textSecondary }]}>
                No user found with this number
              </Text>
              <TouchableOpacity
                style={[styles.inviteButton, { backgroundColor: theme.primary }]}
                onPress={() => {
                  const message = `Hey! Join me on ConnectX - the best messaging app!\n\nDownload: https://connectx.app/download`;
                  Linking.openURL(`sms:${phoneNumber}?body=${encodeURIComponent(message)}`);
                }}
              >
                <Ionicons name="chatbubble" size={20} color="#FFFFFF" />
                <Text style={styles.inviteButtonText}>Send Invite SMS</Text>
              </TouchableOpacity>
            </View>
          ) : null}
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
    borderBottomWidth: 0.5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  headerButton: {
    padding: 4,
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
  },
  listContent: {
    paddingBottom: 20,
  },
  quickAccessSection: {
    paddingTop: 8,
  },
  quickAccessItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  quickAccessIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAccessLabel: {
    fontSize: 16,
    marginLeft: 16,
    fontWeight: '400',
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '500',
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '400',
    marginLeft: 12,
    flex: 1,
  },
  contactNameList: {
    fontSize: 16,
    fontWeight: '500',
  },
  contactUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  indexContainer: {
    position: 'absolute',
    right: 2,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
  },
  indexItem: {
    paddingVertical: 1,
    paddingHorizontal: 4,
  },
  indexLetter: {
    fontSize: 10,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    marginTop: 60,
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
  // Modal styles
  modalContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 0.5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  searchResults: {
    paddingHorizontal: 16,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  addButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 16,
    marginTop: 12,
  },
  noResultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  noResultsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginTop: 16,
  },
  noResultsText: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  quickAddOptions: {
    padding: 16,
  },
  quickAddItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  quickAddIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickAddLabel: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  // Phone Contacts Modal
  matchedHeader: {
    padding: 16,
    borderBottomWidth: 0.5,
  },
  matchedTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  matchedSubtitle: {
    fontSize: 13,
    marginTop: 4,
  },
  inviteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 24,
    marginTop: 24,
    gap: 8,
  },
  inviteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  // Phone Input
  phoneInputSection: {
    padding: 16,
  },
  phoneInputLabel: {
    fontSize: 13,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  phoneInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
  },
  phoneInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 18,
    letterSpacing: 1,
  },
  phoneInputHint: {
    fontSize: 12,
    marginTop: 8,
  },
});
