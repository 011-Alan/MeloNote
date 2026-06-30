import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';

interface FloatingNoteProps {
  symbol: string;
  left: string;
  delay: number;
  duration: number;
  scale: number;
}

function FloatingNote({ symbol, left, delay, duration, scale }: FloatingNoteProps) {
  const translateY = useSharedValue(250);
  const opacity = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withTiming(-150, { duration, easing: Easing.linear }),
        -1,
        false
      )
    );

    opacity.value = withDelay(
      delay,
      withRepeat(
        withTiming(0.6, { duration: duration * 0.2 }),
        -1,
        true
      )
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale }],
    opacity: translateY.value < 0 ? (translateY.value + 150) / 150 * 0.6 : opacity.value,
  }));

  return (
    <Animated.Text style={[styles.floatingNote, { left: left as any }, animatedStyle]}>
      {symbol}
    </Animated.Text>
  );
}

interface FinalCTASectionProps {
  onStartCreating: () => void;
}

export function FinalCTASection({ onStartCreating }: FinalCTASectionProps) {
  const notes = [
    { symbol: '♩', left: '10%', delay: 0, duration: 6000, scale: 1 },
    { symbol: '♪', left: '25%', delay: 1500, duration: 7500, scale: 1.3 },
    { symbol: '♫', left: '40%', delay: 500, duration: 5500, scale: 1.1 },
    { symbol: '♬', left: '60%', delay: 2000, duration: 8000, scale: 1.4 },
    { symbol: '♩', left: '75%', delay: 1000, duration: 6500, scale: 1.2 },
    { symbol: '♪', left: '90%', delay: 3000, duration: 7000, scale: 1 },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.cardWrapper}>
        <LinearGradient
          colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBg}
        />

        {/* Floating notes in background */}
        <View style={StyleSheet.absoluteFill}>
          {notes.map((note, idx) => (
            <FloatingNote
              key={idx}
              symbol={note.symbol}
              left={note.left}
              delay={note.delay}
              duration={note.duration}
              scale={note.scale}
            />
          ))}
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>Bring Your Music to Life</Text>
          <Text style={styles.subtitle}>
            Create, Transcribe, Edit and Learn — All in One Place.
          </Text>

          <Pressable onPress={onStartCreating} style={styles.button}>
            <Text style={styles.buttonText}>Start Creating</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 100,
    paddingHorizontal: 24,
    alignItems: 'center',
    backgroundColor: '#0F0F12',
  },
  cardWrapper: {
    width: '100%',
    maxWidth: 1000,
    borderRadius: 28,
    overflow: 'hidden',
    position: 'relative',
    paddingVertical: 80,
    paddingHorizontal: 36,
    alignItems: 'center',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
  },
  gradientBg: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    alignItems: 'center',
    zIndex: 10,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 40,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 16,
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
    fontFamily: 'var(--font-display)',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 36,
    maxWidth: 550,
  },
  button: {
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingVertical: 16,
    paddingHorizontal: 36,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 15,
    elevation: 4,
    ...Platform.select({
      web: {
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        cursor: 'pointer',
        ':hover': {
          transform: 'scale(1.05)',
          boxShadow: '0 12px 24px rgba(0,0,0,0.3)',
        },
      },
    }),
  },
  buttonText: {
    color: '#FF4FA3',
    fontWeight: '800',
    fontSize: 16,
  },
  floatingNote: {
    position: 'absolute',
    bottom: -50,
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    zIndex: 1,
  },
});
