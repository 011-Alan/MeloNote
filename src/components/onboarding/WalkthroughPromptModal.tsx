import React from 'react';
import { StyleSheet, View, Text, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/context/SettingsContext';

interface WalkthroughPromptModalProps {
  visible: boolean;
  userName: string;
  onStart: () => void;
  onSkip: () => void;
}

export function WalkthroughPromptModal({ visible, userName, onStart, onSkip }: WalkthroughPromptModalProps) {
  const { theme } = useSettings();
  const isDark = theme === 'dark';

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: isDark ? '#1c1c1e' : '#ffffff', borderTopColor: isDark ? '#2c2c2e' : '#E0E1E6' }]}>
          <Ionicons name="sparkles" size={48} color="#FF8A00" style={{ marginBottom: 16 }} />
          <Text style={[styles.title, { color: isDark ? '#ffffff' : '#121212' }]}>Welcome, {userName}!</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#8e8e93' : '#60646C' }]}>
            Would you like a quick walkthrough of MeloNote?{"\n\n"}
            It only takes about a minute and will introduce all the main features.
          </Text>
          
          <View style={styles.buttonContainer}>
            <Pressable onPress={onStart} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Start Walkthrough</Text>
            </Pressable>
            <Pressable onPress={onSkip} style={[styles.secondaryButton, { backgroundColor: isDark ? '#3a3a3c' : '#E0E1E6' }]}>
              <Text style={[styles.secondaryButtonText, { color: isDark ? '#ffffff' : '#121212' }]}>Skip</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  content: {
    width: '100%',
    maxWidth: 400,
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    width: '100%',
    height: 50,
    backgroundColor: '#FF8A00',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryButton: {
    width: '100%',
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
