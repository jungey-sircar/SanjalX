import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../src/hooks/useTheme';
import { Avatar } from '../src/components/Avatar';
import api from '../src/services/api';
import { User } from '../src/types';

export default function NewGroupScreen() {
  const router = useRouter();
  const theme = useTheme();
  
  const [step, setStep] = useState<'select' | 'details'>('select');
  const [contacts, setContacts] = useState<User[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [groupPhoto, setGroupPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const response = await api.get('/contacts');
      setContacts(response.data);
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (user: User) => {
    if (selectedMembers.find(m => m.id === user.id)) {
      setSelectedMembers(selectedMembers.filter(m => m.id !== user.id));
    } else {
      setSelectedMembers([...selectedMembers, user]);
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
      setGroupPhoto(`data:image/jpeg;base64,${result.assets[0].base64}`);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      Alert.alert('Error', 'Please enter a group name');
      return;
    }

    setCreating(true);
    try {
      const response = await api.post('/groups', {
        name: groupName.trim(),
        member_ids: selectedMembers.map(m => m.id),
        group_photo: groupPhoto,
      });
      
      Alert.alert('Success', 'Group created successfully!');
      // Navigate to the new group chat
      router.replace(`/group/${response.data.id}`);
    } catch (error: any) {
      Alert.alert('Error', error.response?.data?.detail || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const renderContact = ({ item }: { item: User }) => {
    const isSelected = selectedMembers.find(m => m.id === item.id);
    
    return (
      <TouchableOpacity
        style={[styles.contactItem, { backgroundColor: theme.surface }]}
        onPress={() => toggleMember(item)}
      >
        <Avatar
          source={item.profile_photo}
          name={item.display_name}
          size={48}
        />
        <View style={styles.contactInfo}>
          <Text style={[styles.contactName, { color: theme.text }]}>
            {item.display_name}
          </Text>
          <Text style={[styles.contactUsername, { color: theme.textSecondary }]}>
            @{item.username}
          </Text>
        </View>
        <View style={[
          styles.checkbox,
          { borderColor: isSelected ? theme.primary : theme.border },
          isSelected && { backgroundColor: theme.primary }
        ]}>
          {isSelected && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
        </View>
      </TouchableOpacity>
    );
  };

  const renderSelectedMember = ({ item }: { item: User }) => (
    <TouchableOpacity
      style={styles.selectedMember}
      onPress={() => toggleMember(item)}
    >
      <Avatar source={item.profile_photo} name={item.display_name} size={56} />
      <View style={[styles.removeBadge, { backgroundColor: theme.error }]}>
        <Ionicons name="close" size={12} color="#FFFFFF" />
      </View>
      <Text style={[styles.selectedMemberName, { color: theme.text }]} numberOfLines={1}>
        {item.display_name.split(' ')[0]}
      </Text>
    </TouchableOpacity>
  );

  if (step === 'details') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.header, { borderBottomColor: theme.border }]}>
            <TouchableOpacity onPress={() => setStep('select')}>
              <Ionicons name="arrow-back" size={24} color={theme.text} />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: theme.text }]}>New Group</Text>
            <TouchableOpacity onPress={handleCreateGroup} disabled={creating}>
              {creating ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <Text style={[styles.createText, { color: theme.primary }]}>Create</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.detailsContent}>
            <TouchableOpacity style={styles.groupPhotoSection} onPress={handlePickImage}>
              {groupPhoto ? (
                <Avatar source={groupPhoto} name={groupName} size={100} />
              ) : (
                <View style={[styles.groupPhotoPlaceholder, { backgroundColor: theme.surface }]}>
                  <Ionicons name="camera" size={40} color={theme.textSecondary} />
                </View>
              )}
              <Text style={[styles.changePhotoText, { color: theme.primary }]}>
                {groupPhoto ? 'Change Photo' : 'Add Group Photo'}
              </Text>
            </TouchableOpacity>

            <View style={styles.inputSection}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>Group Name</Text>
              <TextInput
                style={[styles.input, { backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }]}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="Enter group name"
                placeholderTextColor={theme.textSecondary}
                autoFocus
              />
            </View>

            <View style={styles.membersSection}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Members ({selectedMembers.length})
              </Text>
              <FlatList
                data={selectedMembers}
                renderItem={renderSelectedMember}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.selectedList}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={theme.text} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.text }]}>Add Members</Text>
        <TouchableOpacity
          onPress={() => setStep('details')}
          disabled={selectedMembers.length === 0}
        >
          <Text style={[
            styles.nextText,
            { color: selectedMembers.length > 0 ? theme.primary : theme.textSecondary }
          ]}>
            Next
          </Text>
        </TouchableOpacity>
      </View>

      {selectedMembers.length > 0 && (
        <View style={[styles.selectedSection, { borderBottomColor: theme.border }]}>
          <FlatList
            data={selectedMembers}
            renderItem={renderSelectedMember}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.selectedList}
          />
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
        Select contacts to add
      </Text>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
        </View>
      ) : contacts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={48} color={theme.textSecondary} />
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            No contacts to add
          </Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          renderItem={renderContact}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.contactsList}
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
    padding: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  nextText: {
    fontSize: 16,
    fontWeight: '600',
  },
  createText: {
    fontSize: 16,
    fontWeight: '600',
  },
  selectedSection: {
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  selectedList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  selectedMember: {
    alignItems: 'center',
    width: 70,
  },
  removeBadge: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedMemberName: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 16,
  },
  contactsList: {
    padding: 16,
    paddingTop: 8,
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
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
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
    marginTop: 12,
  },
  // Details step
  detailsContent: {
    padding: 24,
  },
  groupPhotoSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  groupPhotoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePhotoText: {
    marginTop: 12,
    fontSize: 16,
    fontWeight: '500',
  },
  inputSection: {
    marginBottom: 24,
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
  membersSection: {
    marginTop: 8,
  },
});
