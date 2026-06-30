import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface ActionItem {
  icon: string;
  colors: [string, string];
  title: string;
  subtitle: string;
  route: string;
}

interface PrimaryActionsProps {
  onPressAction: (route: string) => void;
}

export function PrimaryActions({ onPressAction }: PrimaryActionsProps) {
  const actions: ActionItem[] = [
    {
      icon: '🎤',
      colors: ['#FF8A00', '#FF4FA3'],
      title: 'Audio to Sheet',
      subtitle: 'Convert recordings into editable sheet music.',
      route: '/record',
    },
    {
      icon: '✍️',
      colors: ['#FF4FA3', '#7B61FF'],
      title: 'Compose Music',
      subtitle: 'Create digital sheet music from scratch.',
      route: '/create',
    },
    {
      icon: '📄',
      colors: ['#7B61FF', '#FF8A00'],
      title: 'Scan Sheet',
      subtitle: 'Scan printed sheet music into notation.',
      route: '/record', // For demo OMR scanning
    },
  ];

  return (
    <View style={styles.container}>
      {actions.map((action, idx) => (
        <Pressable
          key={idx}
          onPress={() => onPressAction(action.route)}
          style={({ pressed }) => [
            styles.card,
            pressed && styles.cardPressed,
          ]}
        >
          <LinearGradient
            colors={action.colors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconCircle}
          >
            <Text style={styles.iconText}>{action.icon}</Text>
          </LinearGradient>

          <View style={styles.textContainer}>
            <Text style={styles.cardTitle}>{action.title}</Text>
            <Text style={styles.cardSubtitle}>{action.subtitle}</Text>
          </View>

          <View style={styles.arrowCircle}>
            <Text style={styles.arrowText}>→</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 14,
    marginTop: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        transition: 'transform 0.2s ease, border-color 0.2s ease, background-color 0.2s ease',
        cursor: 'pointer',
        ':hover': {
          transform: 'translateY(-3px)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      },
    }),
  },
  cardPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.9,
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  iconText: {
    fontSize: 22,
  },
  textContainer: {
    flex: 1,
    marginLeft: 16,
    paddingRight: 8,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  cardSubtitle: {
    color: '#B0B4BA',
    fontSize: 12,
    lineHeight: 16,
  },
  arrowCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arrowText: {
    color: '#B0B4BA',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
