import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Image,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';

interface ProfilePhotoPickerProps {
  visible: boolean;
  onClose: () => void;
  onPhotoSelected: (base64Data: string) => Promise<void>;
  onRemovePhoto: () => Promise<void>;
  currentPhoto?: string | null;
  theme: any;
}

export function ProfilePhotoPicker({
  visible,
  onClose,
  onPhotoSelected,
  onRemovePhoto,
  currentPhoto,
  theme,
}: ProfilePhotoPickerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in your device settings to take photos.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const requestGalleryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Gallery Permission Required',
        'Please enable photo library access in your device settings to select photos.',
        [{ text: 'OK' }]
      );
      return false;
    }
    return true;
  };

  const processImage = async (uri: string): Promise<string | null> => {
    try {
      setIsProcessing(true);

      // Resize and compress the image
      const manipulatedImage = await ImageManipulator.manipulateAsync(
        uri,
        [
          { resize: { width: 500, height: 500 } }, // Resize to max 500x500
        ],
        {
          compress: 0.7, // 70% quality
          format: ImageManipulator.SaveFormat.JPEG,
          base64: true,
        }
      );

      setIsProcessing(false);
      return manipulatedImage.base64 || null;
    } catch (error) {
      setIsProcessing(false);
      console.error('Error processing image:', error);
      Alert.alert('Error', 'Failed to process image. Please try again.');
      return null;
    }
  };

  const handleTakePhoto = async () => {
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const base64 = await processImage(result.assets[0].uri);
        if (base64) {
          setSelectedImage(`data:image/jpeg;base64,${base64}`);
        }
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const handleChooseFromGallery = async () => {
    const hasPermission = await requestGalleryPermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        const base64 = await processImage(result.assets[0].uri);
        if (base64) {
          setSelectedImage(`data:image/jpeg;base64,${base64}`);
        }
      }
    } catch (error) {
      console.error('Error selecting image:', error);
      Alert.alert('Error', 'Failed to select image. Please try again.');
    }
  };

  const handleRemovePhoto = async () => {
    Alert.alert(
      'Remove Profile Photo',
      'Are you sure you want to remove your profile photo?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setIsUploading(true);
            try {
              await onRemovePhoto();
              handleClose();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove photo. Please try again.');
            } finally {
              setIsUploading(false);
            }
          },
        },
      ]
    );
  };

  const handleConfirmUpload = async () => {
    if (!selectedImage) return;

    setIsUploading(true);
    try {
      await onPhotoSelected(selectedImage);
      handleClose();
    } catch (error) {
      Alert.alert('Error', 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedImage(null);
    setIsProcessing(false);
    setIsUploading(false);
    onClose();
  };

  const handleCancelPreview = () => {
    setSelectedImage(null);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.border }]}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={theme.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            {selectedImage ? 'Preview' : 'Profile Photo'}
          </Text>
          <View style={styles.closeButton} />
        </View>

        {/* Content */}
        {selectedImage ? (
          // Preview Mode
          <View style={styles.previewContainer}>
            <View style={styles.previewImageContainer}>
              <Image
                source={{ uri: selectedImage }}
                style={styles.previewImage}
              />
            </View>

            <Text style={[styles.previewText, { color: theme.textSecondary }]}>
              This is how your profile photo will look
            </Text>

            {isUploading ? (
              <View style={styles.uploadingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.uploadingText, { color: theme.textSecondary }]}>
                  Uploading...
                </Text>
              </View>
            ) : (
              <View style={styles.previewActions}>
                <TouchableOpacity
                  style={[styles.previewButton, { backgroundColor: theme.surface }]}
                  onPress={handleCancelPreview}
                >
                  <Ionicons name="refresh" size={20} color={theme.text} />
                  <Text style={[styles.previewButtonText, { color: theme.text }]}>
                    Choose Another
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.previewButton, styles.confirmButton, { backgroundColor: theme.primary }]}
                  onPress={handleConfirmUpload}
                >
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                  <Text style={[styles.previewButtonText, { color: '#FFFFFF' }]}>
                    Confirm
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ) : (
          // Selection Mode
          <View style={styles.selectionContainer}>
            {/* Current Photo Preview */}
            <View style={styles.currentPhotoContainer}>
              {currentPhoto ? (
                <Image
                  source={{ uri: currentPhoto.startsWith('data:') ? currentPhoto : `data:image/jpeg;base64,${currentPhoto}` }}
                  style={styles.currentPhoto}
                />
              ) : (
                <View style={[styles.placeholderPhoto, { backgroundColor: theme.surface }]}>
                  <Ionicons name="person" size={60} color={theme.textSecondary} />
                </View>
              )}
            </View>

            {isProcessing ? (
              <View style={styles.processingContainer}>
                <ActivityIndicator size="large" color={theme.primary} />
                <Text style={[styles.processingText, { color: theme.textSecondary }]}>
                  Processing image...
                </Text>
              </View>
            ) : (
              <View style={styles.optionsContainer}>
                {/* Camera Option */}
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: theme.surface }]}
                  onPress={handleTakePhoto}
                >
                  <View style={[styles.optionIconContainer, { backgroundColor: theme.primary }]}>
                    <Ionicons name="camera" size={28} color="#FFFFFF" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={[styles.optionTitle, { color: theme.text }]}>
                      Take Photo
                    </Text>
                    <Text style={[styles.optionSubtitle, { color: theme.textSecondary }]}>
                      Use your camera to capture a new photo
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>

                {/* Gallery Option */}
                <TouchableOpacity
                  style={[styles.optionButton, { backgroundColor: theme.surface }]}
                  onPress={handleChooseFromGallery}
                >
                  <View style={[styles.optionIconContainer, { backgroundColor: '#4ECDC4' }]}>
                    <Ionicons name="images" size={28} color="#FFFFFF" />
                  </View>
                  <View style={styles.optionTextContainer}>
                    <Text style={[styles.optionTitle, { color: theme.text }]}>
                      Choose from Gallery
                    </Text>
                    <Text style={[styles.optionSubtitle, { color: theme.textSecondary }]}>
                      Select an existing photo from your library
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                </TouchableOpacity>

                {/* Remove Photo Option - only show if there's a current photo */}
                {currentPhoto && (
                  <TouchableOpacity
                    style={[styles.optionButton, { backgroundColor: theme.surface }]}
                    onPress={handleRemovePhoto}
                    disabled={isUploading}
                  >
                    <View style={[styles.optionIconContainer, { backgroundColor: '#FF6B6B' }]}>
                      <Ionicons name="trash" size={28} color="#FFFFFF" />
                    </View>
                    <View style={styles.optionTextContainer}>
                      <Text style={[styles.optionTitle, { color: theme.error || '#FF6B6B' }]}>
                        Remove Photo
                      </Text>
                      <Text style={[styles.optionSubtitle, { color: theme.textSecondary }]}>
                        Delete your current profile photo
                      </Text>
                    </View>
                    {isUploading ? (
                      <ActivityIndicator size="small" color={theme.error} />
                    ) : (
                      <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
                    )}
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* Info Text */}
            <View style={styles.infoContainer}>
              <Ionicons name="information-circle-outline" size={16} color={theme.textSecondary} />
              <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                Images will be automatically resized and optimized for best quality
              </Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  selectionContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  currentPhotoContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  currentPhoto: {
    width: 150,
    height: 150,
    borderRadius: 75,
  },
  placeholderPhoto: {
    width: 150,
    height: 150,
    borderRadius: 75,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
  },
  optionIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionTextContainer: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  optionSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  processingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  processingText: {
    marginTop: 12,
    fontSize: 14,
  },
  infoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
    paddingHorizontal: 16,
    gap: 8,
  },
  infoText: {
    fontSize: 12,
    textAlign: 'center',
    flex: 1,
  },
  previewContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 40,
  },
  previewImageContainer: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  previewImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
  },
  previewText: {
    fontSize: 14,
    marginTop: 24,
    textAlign: 'center',
  },
  previewActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
    paddingHorizontal: 16,
  },
  previewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    gap: 8,
  },
  confirmButton: {
    flex: 1.5,
  },
  previewButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  uploadingContainer: {
    alignItems: 'center',
    marginTop: 40,
  },
  uploadingText: {
    marginTop: 12,
    fontSize: 14,
  },
});
