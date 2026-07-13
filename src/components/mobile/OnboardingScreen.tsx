import React, { useState } from 'react';
import { StyleSheet, View, Text, TextInput, Platform, ViewStyle, TextStyle } from 'react-native';
import { GradientBackground, GlassCard, PrimaryButton } from '../ui/DesignSystem';

interface OnboardingScreenProps {
  onComplete: (name: string) => void;
}

export function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Please enter your name to continue.');
      return;
    }
    onComplete(name.trim());
  };

  return (
    <GradientBackground style={styles.container}>
      <View style={styles.contentWrapper}>
        <GlassCard style={styles.card}>
          <Text style={styles.title}>Welcome to MeloNote</Text>
          <Text style={styles.subtitle}>
            Let's personalize your music workspace. What should we call you?
          </Text>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                isFocused && styles.inputFocused,
                error ? styles.inputError : null
              ]}
              placeholder="Enter your name"
              placeholderTextColor="#8E929A"
              value={name}
              onChangeText={(text) => {
                setName(text);
                if (error) setError('');
              }}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onSubmitEditing={handleSubmit}
              autoFocus
              maxLength={25}
            />
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </View>

          <PrimaryButton
            title="Get Started"
            onPress={handleSubmit}
            style={styles.button}
            disabled={!name.trim()}
          />
        </GlassCard>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  contentWrapper: {
    width: '100%',
    maxWidth: 400,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  } as ViewStyle,
  card: {
    width: '100%',
    padding: 28,
    alignItems: 'center',
    gap: 20,
  } as ViewStyle,
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    color: '#8E929A',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 10,
  },
  inputContainer: {
    width: '100%',
    marginVertical: 10,
  } as ViewStyle,
  input: {
    height: 52,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 14,
    color: '#FFFFFF',
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
  } as TextStyle,
  inputFocused: {
    borderColor: '#FF4FA3',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  } as TextStyle,
  inputError: {
    borderColor: '#FF4FA3',
  } as TextStyle,
  errorText: {
    color: '#FF4FA3',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
    marginLeft: 4,
  },
  button: {
    width: '100%',
  } as ViewStyle,
});
