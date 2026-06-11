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
  SectionList,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../src/hooks/useTheme';
import { Avatar } from '../../src/components/Avatar';
import api from '../../src/services/api';
import { User } from '../../src/types';

export default function ContactsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [appContacts, setAppContacts] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const loadAppContacts = async () => {
    try {
      const response = await api.get('/contacts');
      setAppContacts(response.data);
    } catch (error) {
      console.error('Error loading app contacts:', error);
    }
  };

  const loadData = async () => {
    setLoading(true);
    await loadAppContacts();
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAppContacts();
    setRefreshing(false);
  };

  // Search users on the platform
  const searchUsers = async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await api.get(`/users/search?query=${encodeURIComponent(query)}`);
      // Filter out users already in contacts
      const contactIds = new Set(appContacts.map(c => c.id));
      const filtered = response.data.filter((u: User) => !contactIds.has(u.id));
      setSearchResults(filtered);
    } catch (error) {
      console.error('Error searching users:', error);
    } finally {
      setSearching(false);
    }
  };

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        searchUsers(searchQuery);
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, appContacts]);

  const addContact = async (userId: string) => {
    try {
      await api.post('/contacts/add', { user_id: userId });
      await loadAppContacts();
      setSearchResults(prev => prev.filter(u => u.id !== userId));
      Alert.alert('Contact Added', 'You can now chat with this person!');
    } catch (error: any) {
      const msg = error.response?.data?.detail;
      if (msg === 'Already in contacts') {
        Alert.alert('Already Added', 'This person is already in your contacts.');
      } else {
        Alert.alert('Error', msg || 'Failed to add contact');
      }
    }
  };

  const addAndChat = async (userId: string) => {
    try {
      await api.post('/contacts/add', { user_id: userId });
      await loadAppContacts();
    } catch {
      // May already be a contact
    }
    router.push(`/chat/${userId}`);
  };

  // Filter contacts based on search
  const filteredContacts = appContacts.filter(contact => {
    if (!searchQuery) return true;
    const name = (contact.display_name || contact.username || '').toLowerCase();
    const phone = (contact.phone_number || '').toLowerCase();
    const email = (contact.email || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || phone.includes(q) || email.includes(q);
  });

  // Build sections
  const getSections = () => {
    const sections: { title: string; data: any[]; type: string }[] = [];

    // My contacts section
    if (filteredContacts.length > 0 && !isSearchFocused) {
      sections.push({
        title: `My Contacts (${filteredContacts.length})`,
        data: filteredContacts,
        type: 'contact',
      });
    } else if (filteredContacts.length > 0 && searchQuery.length >= 2) {
      // Show matching contacts even when search focused
      const matching = filteredContacts.filter(c => {
        const q = searchQuery.toLowerCase();
        return (c.display_name || '').toLowerCase().includes(q) ||
               (c.username || '').toLowerCase().includes(q);
      });
      if (matching.length > 0) {
        sections.push({
          title: 'In Your Contacts',
          data: matching,
          type: 'contact',
        });
      }
    }

    // Search results from platform
    if (searchQuery.length >= 2 && searchResults.length > 0) {
      sections.push({
        title: 'People on ConnectX',
        data: searchResults,
        type: 'search_result',
      });
    }

    return sections;
  };

  const renderContactItem = (item: User) => (
    <TouchableOpacity
      style={[styles.contactItem, { backgroundColor: theme.surface }]}
      onPress={() => router.push(`/chat/${item.id}`)}
      activeOpacity={0.7}
    >
      <Avatar
        source={item.profile_photo}
        name={item.display_name || item.username}
        size={50}
        isOnline={item.is_online}
      />
      <View style={styles.contactContent}>
        <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
          {item.display_name || item.username}
        </Text>
        <Text style={[styles.contactSub, { color: theme.textSecondary }]} numberOfLines={1}>
          @{item.username}
          {item.phone_number ? ` · ${item.phone_number}` : ''}
        </Text>
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.primary + '15' }]}
          onPress={() => router.push(`/chat/${item.id}`)}
        >
          <Ionicons name="chatbubble" size={18} color={theme.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.iconBtn, { backgroundColor: theme.primary + '15' }]}
          onPress={() => router.push(`/call/${item.id}?type=voice`)}
        >
          <Ionicons name="call" size={18} color={theme.primary} />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderSearchResultItem = (item: User) => (
    <TouchableOpacity
      style={[styles.contactItem, { backgroundColor: theme.surface }]}
      onPress={() => addAndChat(item.id)}
      activeOpacity={0.7}
    >
      <Avatar
        source={item.profile_photo}
        name={item.display_name || item.username}
        size={50}
      />
      <View style={styles.contactContent}>
        <Text style={[styles.contactName, { color: theme.text }]} numberOfLines={1}>
          {item.display_name || item.username}
        </Text>
        <Text style={[styles.contactSub, { color: theme.textSecondary }]} numberOfLines={1}>
          @{item.username}
          {item.phone_number ? ` · ${item.phone_number}` : ''}
        </Text>
      </View>
      <View style={styles.contactActions}>
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: theme.primary }]}
          onPress={() => addContact(item.id)}
        >
          <Ionicons name="person-add" size={16} color="#FFF" />
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderItem = ({ item, section }: { item: User; section: any }) => {
    if (section.type === 'search_result') {
      return renderSearchResultItem(item);
    }
    return renderContactItem(item);
  };

  const renderSectionHeader = ({ section }: any) => (
    <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {section.title}
      </Text>
    </View>
  );

  const renderEmpty = () => {
    if (searchQuery.length >= 2 && !searching && searchResults.length === 0 && filteredContacts.length === 0) {
      return (
        <View style={styles.emptySearch}>
          <Ionicons name="search" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyTitle, { color: theme.textSecondary }]}>
            No users found for "{searchQuery}"
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Try searching by username, email, or phone number
          </Text>
        </View>
      );
    }

    if (!searchQuery && appContacts.length === 0 && !loading) {
      return (
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.primary + '15' }]}>
            <Ionicons name="people" size={48} color={theme.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            Find People to Chat With
          </Text>
          <Text style={[styles.emptySubtext, { color: theme.textSecondary }]}>
            Search for friends by their username, email, or phone number above
          </Text>
          <View style={styles.tipContainer}>
            <View style={[styles.tipCard, { backgroundColor: theme.surface }]}>
              <Ionicons name="search" size={20} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.tipTitle, { color: theme.text }]}>Search Users</Text>
                <Text style={[styles.tipSub, { color: theme.textSecondary }]}>
                  Type a name, email, or phone in the search bar
                </Text>
              </View>
            </View>
            <View style={[styles.tipCard, { backgroundColor: theme.surface }]}>
              <Ionicons name="person-add" size={20} color={theme.primary} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.tipTitle, { color: theme.text }]}>Add & Chat</Text>
                <Text style={[styles.tipSub, { color: theme.textSecondary }]}>
                  Tap on a user to add them and start chatting instantly
                </Text>
              </View>
            </View>
          </View>
        </View>
      );
    }
    return null;
  };

  const sections = getSections();

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
        <View style={styles.header}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Contacts</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Contacts</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.contactCount, { color: theme.textSecondary }]}>
            {appContacts.length} contacts
          </Text>
        </View>
      </View>

      {/* Search bar - always visible and prominent */}
      <View style={[styles.searchContainer, { backgroundColor: theme.surface }]}>
        <Ionicons name="search" size={20} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search by name, email, or phone..."
          placeholderTextColor={theme.textSecondary}
          value={searchQuery}
          onChangeText={setSearchQuery}
          onFocus={() => setIsSearchFocused(true)}
          onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => { setSearchQuery(''); setSearchResults([]); }}>
            <Ionicons name="close-circle" size={20} color={theme.textSecondary} />
          </TouchableOpacity>
        )}
        {searching && <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 8 }} />}
      </View>

      {/* Search hint */}
      {searchQuery.length > 0 && searchQuery.length < 2 && (
        <View style={styles.searchHint}>
          <Text style={[styles.searchHintText, { color: theme.textSecondary }]}>
            Type at least 2 characters to search users...
          </Text>
        </View>
      )}

      {/* Content */}
      {sections.length > 0 ? (
        <SectionList
          sections={sections}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={true}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />
          }
        />
      ) : (
        <FlatList
          data={[]}
          renderItem={() => null}
          ListHeaderComponent={renderEmpty}
          contentContainerStyle={styles.emptyListContent}
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  contactCount: {
    fontSize: 13,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 8,
    paddingVertical: 8,
  },
  searchHint: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  searchHintText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  listContent: {
    paddingBottom: 100,
  },
  emptyListContent: {
    flexGrow: 1,
  },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  contactContent: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
  },
  contactSub: {
    fontSize: 13,
    marginTop: 2,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  addBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 40,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 28,
  },
  emptySearch: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 60,
    gap: 8,
  },
  tipContainer: {
    width: '100%',
    gap: 12,
  },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
  },
  tipTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  tipSub: {
    fontSize: 13,
    marginTop: 2,
  },
});
