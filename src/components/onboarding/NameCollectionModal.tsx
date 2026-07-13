import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSettings } from '@/context/SettingsContext';

interface NameCollectionModalProps {
  visible: boolean;
  onContinue: (name: string) => void;
}

export function NameCollectionModal({ visible, onContinue }: NameCollectionModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const { theme } = useSettings();
  const isDark = theme === 'dark';

  const handleContinue = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Name cannot be empty.');
      return;
    }
    onContinue(trimmed);
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.overlay}>
        <View style={[styles.content, { backgroundColor: isDark ? '#1c1c1e' : '#ffffff', borderTopColor: isDark ? '#2c2c2e' : '#E0E1E6' }]}>
          <Ionicons name="musical-notes" size={48} color="#FF4FA3" style={{ marginBottom: 16 }} />
          <Text style={[styles.title, { color: isDark ? '#ffffff' : '#121212' }]}>Welcome to MeloNote!</Text>
          <Text style={[styles.subtitle, { color: isDark ? '#8e8e93' : '#60646C' }]}>What should we call you?</Text>
          
          <TextInput
            style={[
              styles.input,
              { 
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
                borderColor: error ? '#FF4FA3' : (isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'),
                color: isDark ? '#ffffff' : '#121212'
              }
            ]}
            placeholder="Your Name"
            placeholderTextColor={isDark ? '#8e8e93' : '#a0a0a0'}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (error) setError('');
            }}
            onSubmitEditing={handleContinue}
            maxLength={25}
            autoFocus
          />
          {!!error && <Text style={styles.errorText}>{error}</Text>}

          <Pressable onPress={handleContinue} style={styles.button}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 24,
  },
  input: {
    width: '100%',
    height: 52,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  errorText: {
    color: '#FF4FA3',
    fontSize: 12,
    alignSelf: 'flex-start',
    marginBottom: 16,
    marginLeft: 4,
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#FF4FA3',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
