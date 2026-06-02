import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../../../src/hooks/useTheme';
import { Avatar } from '../../../src/components/Avatar';
import { useAuthStore } from '../../../src/store/authStore';
import api from '../../../src/services/api';
import { User } from '../../../src/types';

interface GroupMember {
  id: string;
  username: string;
  display_name: string;
  profile_photo?: string;
  is_admin: boolean;
  is_online: boolean;
}

interface GroupInfo {
  id: string;
  name: string;
  creator_id: string;
  admin_ids: string[];
  member_ids: string[];
  group_photo?: string;
  created_at: string;
  members: GroupMember[];
}

export default function GroupInfoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { user } = useAuthStore();
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhoto, setEditPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contacts, setContacts] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadGroupInfo();
  }, [id]);

  const loadGroupInfo = async () => {
    try {
      const response = await api.get(`/groups/${id}`);
      setGroup(response.data);
      setEditName(response.data.name);
      setEditPhoto(response.data.group_photo);
    } catch (error) {
      console.error('Error loading group:', error);
      Alert.alert('Error', 'Failed to load group info');
      router.back();
    } finally {
      setLoading(false);
    }
  };

  const loadContacts = async () => {
    try {
      const response = await api.get('/contacts');
      // Filter out users already in group
      const filtered = response.data.filter(
        (c: User) => !group?.member_ids.includes(c.id)
      );
      setContacts(filtered);
    } catch (error) {
      console.error('Error loading contacts:', error);
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      setEditPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) {
      Alert.alert('Error', 'Group name is required');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/groups/${id}`, {
        name: editName.trim(),
        group_photo: editPhoto,
      });
      await loadGroupInfo();
      setShowEditModal(false);
      Alert.alert('Success', 'Group updated successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to update group');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    try {
      await api.post(`/groups/${id}/members/${userId}`);
      await loadGroupInfo();
      setShowAddMemberModal(false);
      Alert.alert('Success', 'Member added successfully');
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to add member');
    }
  };

  const handleRemoveMember = (member: GroupMember) => {
    const isCurrentUser = member.id === user?.id;
    const title = isCurrentUser ? 'Leave Group' : 'Remove Member';
    const message = isCurrentUser
      ? 'Are you sure you want to leave this group?'
      : `Are you sure you want to remove ${member.display_name} from the group?`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isCurrentUser ? 'Leave' : 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/groups/${id}/members/${member.id}`);
            if (isCurrentUser) {
              Alert.alert('Left Group', 'You have left the group');
              router.replace('/(tabs)/chats');
            } else {
              await loadGroupInfo();
              Alert.alert('Success', 'Member removed successfully');
            }
          } catch (error: any) {
            Alert.alert('Error', error.response?.data?.detail || 'Failed to remove member');
          }
        },
      },
    ]);
  };

  const handleMakeAdmin = async (member: GroupMember) => {
    try {
      await api.post(`/groups/${id}/admins/${member.id}`);
      await loadGroupInfo();
      Alert.alert('Success', `${member.display_name} is now an admin`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to make admin');
    }
  };

  const handleRemoveAdmin = async (member: GroupMember) => {
    try {
      await api.delete(`/groups/${id}/admins/${member.id}`);
      await loadGroupInfo();
      Alert.alert('Success', `${member.display_name} is no longer an admin`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to remove admin');
    }
  };

  const showMemberOptions = (member: GroupMember) => {
    const isCurrentUser = member.id === user?.id;
    const isCurrentUserAdmin = group?.admin_ids?.includes(user?.id || '');
    const options: { text: string; onPress?: () => void; style?: 'cancel' | 'destructive' }[] = [];

    if (!isCurrentUser) {
      options.push({
        text: 'View Profile',
        onPress: () => router.push(`/chat/${member.id}`),
      });
      options.push({
        text: 'Message',
        onPress: () => router.push(`/chat/${member.id}`),
      });
    }

    if (isCurrentUserAdmin && !isCurrentUser) {
      if (member.is_admin) {
        options.push({
          text: 'Remove Admin',
          onPress: () => handleRemoveAdmin(member),
        });
      } else {
        options.push({
          text: 'Make Admin',
          onPress: () => handleMakeAdmin(member),
        });
      }
      options.push({
        text: 'Remove from Group',
        style: 'destructive',
        onPress: () => handleRemoveMember(member),
      });
    }

    if (isCurrentUser) {
      options.push({
        text: 'Leave Group',
        style: 'destructive',
        onPress: () => handleRemoveMember(member),
      });
    }

    options.push({ text: 'Cancel', style: 'cancel' });

    Alert.alert(member.display_name, `@${member.username}`, options);
  };

  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
      </View>
    );
  }

  const isAdmin = group?.admin_ids?.includes(user?.id || '');
  const filteredContacts = contacts.filter(
    (c) =>
      c.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} edges={['top']}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Group Info</Text>
        {isAdmin && (
          <TouchableOpacity onPress={() => setShowEditModal(true)} style={styles.headerButton}>
            <Ionicons name="create-outline" size={24} color={theme.primary} />
          </TouchableOpacity>
        )}
        {!isAdmin && <View style={styles.headerButton} />}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Group Header */}
        <View style={styles.groupHeader}>
          <Avatar
            source={group?.group_photo}
            name={group?.name || ''}
            size={100}
          />
          <Text style={[styles.groupName, { color: theme.text }]}>{group?.name}</Text>
          <Text style={[styles.memberCount, { color: theme.textSecondary }]}>
            {group?.member_ids?.length} members
          </Text>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.surface }]}
            onPress={() => router.push(`/group/${id}`)}
          >
            <Ionicons name="chatbubbles" size={24} color={theme.primary} />
            <Text style={[styles.actionText, { color: theme.text }]}>Chat</Text>
          </TouchableOpacity>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface }]}
              onPress={() => {
                loadContacts();
                setShowAddMemberModal(true);
              }}
            >
              <Ionicons name="person-add" size={24} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.text }]}>Add</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Members Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            Members ({group?.members?.length})
          </Text>
          {group?.members?.map((member) => (
            <TouchableOpacity
              key={member.id}
              style={[styles.memberItem, { backgroundColor: theme.surface }]}
              onPress={() => showMemberOptions(member)}
            >
              <Avatar
                source={member.profile_photo}
                name={member.display_name}
                size={48}
                isOnline={member.is_online}
              />
              <View style={styles.memberInfo}>
                <View style={styles.memberNameRow}>
                  <Text style={[styles.memberName, { color: theme.text }]}>
                    {member.display_name}
                    {member.id === user?.id && ' (You)'}
                  </Text>
                  {member.is_admin && (
                    <View style={[styles.adminBadge, { backgroundColor: theme.primary }]}>
                      <Text style={styles.adminBadgeText}>Admin</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.memberUsername, { color: theme.textSecondary }]}>
                  @{member.username}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Leave Group Button */}
        <TouchableOpacity
          style={[styles.leaveButton, { backgroundColor: theme.surface }]}
          onPress={() => handleRemoveMember({ id: user?.id || '', display_name: 'You' } as GroupMember)}
        >
          <Ionicons name="exit-outline" size={24} color={theme.error} />
          <Text style={[styles.leaveButtonText, { color: theme.error }]}>Leave Group</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Group Modal */}
      <Modal
        visible={showEditModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowEditModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowEditModal(false)}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Edit Group</Text>
            <TouchableOpacity onPress={handleSaveEdit} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text style={[styles.saveText, { color: theme.primary }]}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.editContent}>
            <TouchableOpacity style={styles.editPhotoSection} onPress={handlePickImage}>
              <Avatar source={editPhoto} name={editName} size={100} />
              <Text style={[styles.changePhotoText, { color: theme.primary }]}>Change Photo</Text>
            </TouchableOpacity>

            <Text style={[styles.label, { color: theme.textSecondary }]}>Group Name</Text>
            <TextInput
              style={[
                styles.input,
                { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border },
              ]}
              value={editName}
              onChangeText={setEditName}
              placeholder="Enter group name"
              placeholderTextColor={theme.textSecondary}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Add Member Modal */}
      <Modal
        visible={showAddMemberModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddMemberModal(false)}
      >
        <SafeAreaView style={[styles.modalContainer, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
              <Text style={[styles.cancelText, { color: theme.primary }]}>Cancel</Text>
            </TouchableOpacity>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Add Members</Text>
            <View style={{ width: 60 }} />
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

          {filteredContacts.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                No contacts to add
              </Text>
            </View>
          ) : (
            <FlatList
              data={filteredContacts}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.contactItem, { backgroundColor: theme.surface }]}
                  onPress={() => handleAddMember(item.id)}
                >
                  <Avatar source={item.profile_photo} name={item.display_name} size={48} />
                  <View style={styles.contactInfo}>
                    <Text style={[styles.contactName, { color: theme.text }]}>
                      {item.display_name}
                    </Text>
                    <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
                      @{item.username}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.addButton, { backgroundColor: theme.primary }]}
                    onPress={() => handleAddMember(item.id)}
                  >
                    <Ionicons name="add" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                </TouchableOpacity>
              )}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.contactsList}
            />
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
    paddingHorizontal: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    padding: 8,
    width: 48,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  content: {
    padding: 16,
  },
  groupHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  groupName: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
  },
  memberCount: {
    fontSize: 14,
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 16,
    marginBottom: 24,
  },
  actionButton: {
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    minWidth: 80,
  },
  actionText: {
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  memberItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  memberInfo: {
    flex: 1,
    marginLeft: 12,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
  },
  memberUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  adminBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '600',
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    marginTop: 8,
  },
  leaveButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  cancelText: {
    fontSize: 16,
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  editContent: {
    padding: 24,
  },
  editPhotoSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  changePhotoText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 12,
    height: 40,
    borderRadius: 10,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  contactsList: {
    padding: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  contactInfo: {
    flex: 1,
    marginLeft: 12,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
  },
  contactUsername: {
    fontSize: 13,
    marginTop: 2,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
  },
});
