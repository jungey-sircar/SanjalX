import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import api from '../services/api';

interface TranslationBubbleProps {
  messageId: string;
  originalText: string;
  theme: any;
}

interface TranslationData {
  original: string;
  translated: string;
  source_language: string;
  target_language: string;
  direction: string;
  cached: boolean;
}

export function TranslationBubble({
  messageId,
  originalText,
  theme,
}: TranslationBubbleProps) {
  const [isTranslating, setIsTranslating] = useState(false);
  const [englishTranslation, setEnglishTranslation] = useState<TranslationData | null>(null);
  const [reverseTranslation, setReverseTranslation] = useState<TranslationData | null>(null);
  const [currentView, setCurrentView] = useState<'original' | 'english' | 'reverse'>('original');
  const [error, setError] = useState<string | null>(null);

  const languageNames: Record<string, string> = {
    en: 'English',
    ne: 'Nepali',
    hi: 'Hindi',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    zh: 'Chinese',
    ja: 'Japanese',
    ko: 'Korean',
    ar: 'Arabic',
    ru: 'Russian',
    pt: 'Portuguese',
  };

  const translateToEnglish = async () => {
    if (englishTranslation) {
      // Already translated, just toggle view
      setCurrentView('english');
      return;
    }

    setIsTranslating(true);
    setError(null);

    try {
      const response = await api.post('/translate/bidirectional', {
        text: originalText,
        message_id: messageId,
        direction: 'to_english',
      });

      setEnglishTranslation(response.data);
      setCurrentView('english');
    } catch (err: any) {
      setError('Translation failed');
      console.error('Translation error:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  const translateBack = async () => {
    if (reverseTranslation) {
      // Already translated, just toggle view
      setCurrentView('reverse');
      return;
    }

    if (!englishTranslation) {
      return;
    }

    setIsTranslating(true);
    setError(null);

    try {
      const response = await api.post('/translate/bidirectional', {
        text: englishTranslation.translated,
        message_id: messageId,
        direction: 'to_original',
      });

      setReverseTranslation(response.data);
      setCurrentView('reverse');
    } catch (err: any) {
      setError('Reverse translation failed');
      console.error('Reverse translation error:', err);
    } finally {
      setIsTranslating(false);
    }
  };

  const showOriginal = () => {
    setCurrentView('original');
  };

  const getCurrentText = () => {
    switch (currentView) {
      case 'english':
        return englishTranslation?.translated || originalText;
      case 'reverse':
        return reverseTranslation?.translated || originalText;
      default:
        return originalText;
    }
  };

  const getLabel = () => {
    switch (currentView) {
      case 'english':
        const sourceLang = englishTranslation?.source_language || 'unknown';
        return `Translated from ${languageNames[sourceLang] || sourceLang} ${englishTranslation?.cached ? '(cached)' : ''}`;
      case 'reverse':
        const targetLang = reverseTranslation?.target_language || 'unknown';
        return `Translated back to ${languageNames[targetLang] || targetLang} ${reverseTranslation?.cached ? '(cached)' : ''}`;
      default:
        return 'Original';
    }
  };

  return (
    <View style={styles.container}>
      {/* Message Text */}
      <Text style={[styles.messageText, { color: theme.text }]}>
        {getCurrentText()}
      </Text>

      {/* Translation Label */}
      {currentView !== 'original' && (
        <Text style={[styles.translationLabel, { color: theme.primary }]}>
          {getLabel()}
        </Text>
      )}

      {/* Error Message */}
      {error && (
        <Text style={[styles.errorText, { color: theme.error }]}>{error}</Text>
      )}

      {/* Loading Indicator */}
      {isTranslating && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[styles.loadingText, { color: theme.textSecondary }]}>
            Translating...
          </Text>
        </View>
      )}

      {/* Translation Actions */}
      <View style={styles.actionsContainer}>
        {currentView === 'original' && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: theme.surface }]}
            onPress={translateToEnglish}
            disabled={isTranslating}
          >
            <Ionicons name="language" size={14} color={theme.primary} />
            <Text style={[styles.actionText, { color: theme.primary }]}>
              Translate to English
            </Text>
          </TouchableOpacity>
        )}

        {currentView === 'english' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface }]}
              onPress={showOriginal}
            >
              <Ionicons name="arrow-undo" size={14} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                Original
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface }]}
              onPress={translateBack}
              disabled={isTranslating}
            >
              <Ionicons name="swap-horizontal" size={14} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.primary }]}>
                Translate Back
              </Text>
            </TouchableOpacity>
          </>
        )}

        {currentView === 'reverse' && (
          <>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface }]}
              onPress={showOriginal}
            >
              <Ionicons name="arrow-undo" size={14} color={theme.textSecondary} />
              <Text style={[styles.actionText, { color: theme.textSecondary }]}>
                Original
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.surface }]}
              onPress={() => setCurrentView('english')}
            >
              <Ionicons name="language" size={14} color={theme.primary} />
              <Text style={[styles.actionText, { color: theme.primary }]}>
                English
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  translationLabel: {
    fontSize: 10,
    fontStyle: 'italic',
    marginTop: 6,
    opacity: 0.8,
  },
  errorText: {
    fontSize: 11,
    marginTop: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
  },
  loadingText: {
    fontSize: 12,
  },
  actionsContainer: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
    flexWrap: 'wrap',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
