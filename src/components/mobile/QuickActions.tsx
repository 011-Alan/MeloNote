import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface QuickItem {
  icon: string;
  label: string;
  colors: [string, string];
  route: string;
}

interface QuickActionsProps {
  onPressAction: (route: string) => void;
}

export function QuickActions({ onPressAction }: QuickActionsProps) {
  const items: QuickItem[] = [
    {
      icon: '🎤',
      label: 'Record',
      colors: ['#FF8A00', '#FF4FA3'],
      route: '/record',
    },
    {
      icon: '📂',
      label: 'Projects',
      colors: ['#FF4FA3', '#7B61FF'],
      route: '/projects',
    },
    {
      icon: '▶',
      label: 'Playback',
      colors: ['#7B61FF', '#FF8A00'],
      route: '/projects', // links to active playback project
    },
    {
      icon: '🎼',
      label: 'Library',
      colors: ['#FF8A00', '#7B61FF'],
      route: '/projects', // links to library/projects
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.row}>
        {items.map((item, idx) => (
          <Pressable
            key={idx}
            onPress={() => onPressAction(item.route)}
            style={({ pressed }) => [
              styles.actionItem,
              pressed && styles.pressed,
            ]}
          >
            <LinearGradient
              colors={item.colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.circle}
            >
              <Text style={styles.icon}>{item.icon}</Text>
            </LinearGradient>
            <Text style={styles.label}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  actionItem: {
    alignItems: 'center',
    width: '22%',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  pressed: {
    transform: [{ scale: 0.93 }],
    opacity: 0.9,
  },
  circle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    ...Platform.select({
      web: {
        transition: 'transform 0.2s ease',
        ':hover': {
          transform: 'translateY(-2px)',
        },
      },
    }),
  },
  icon: {
    fontSize: 24,
  },
  label: {
    color: '#B0B4BA',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
});
