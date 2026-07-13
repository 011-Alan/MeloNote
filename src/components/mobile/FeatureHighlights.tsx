import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';
import { useSettings } from '@/context/SettingsContext';

interface Highlight {
  icon: string;
  label: string;
}

const highlights: Highlight[] = [
  { icon: '🤖', label: 'AI Music Transcription' },
  { icon: '🎼', label: 'Digital Sheet Editing' },
  { icon: '📄', label: 'Optical Music Recognition' },
  { icon: '▶', label: 'Real-time Playback' },
  { icon: '💾', label: 'Project Workspace' },
];

export function FeatureHighlights() {
  const { theme } = useSettings();
  const isDark = theme === 'dark';

  return (
    <View style={styles.container}>
      <Text style={[styles.sectionTitle, { color: isDark ? '#FFFFFF' : '#121212' }]}>Built with MeloAI</Text>
      <View style={styles.flexWrapContainer}>
        {highlights.map((item, idx) => (
          <Animated.View
            key={idx}
            entering={FadeInUp.delay(idx * 120).duration(500)}
            style={[styles.pill, { backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : '#FFFFFF', borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)' }]}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={[styles.label, { color: isDark ? '#FFFFFF' : '#121212' }]}>{item.label}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 32,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  flexWrapContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    width: '100%',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    paddingVertical: 10,
    paddingHorizontal: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        transition: 'transform 0.2s ease, border-color 0.2s ease',
        ':hover': {
          transform: 'scale(1.03)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
        },
      },
    }),
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
});
