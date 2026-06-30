import React, { useEffect } from 'react';
import { StyleSheet, View, Pressable, Platform, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import Svg, { Line, G, Circle, Path } from 'react-native-svg';

interface FloatingNote {
  id: number;
  symbol: string;
  left: number;
  bottom: number;
  delay: number;
}

const mockNotes: FloatingNote[] = [
  { id: 1, symbol: '♪', left: -10, bottom: 20, delay: 0 },
  { id: 2, symbol: '♩', left: 10, bottom: 25, delay: 100 },
  { id: 3, symbol: '♫', left: 25, bottom: 15, delay: 200 },
];

function FloatingParticleNote({ note, active }: { note: FloatingNote; active: boolean }) {
  const y = useSharedValue(0);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.6);

  useEffect(() => {
    if (active) {
      y.value = withDelay(
        note.delay,
        withTiming(-50, { duration: 900, easing: Easing.out(Easing.quad) })
      );
      opacity.value = withDelay(
        note.delay,
        withSequence(
          withTiming(0.8, { duration: 200 }),
          withTiming(0, { duration: 700 })
        )
      );
      scale.value = withDelay(
        note.delay,
        withTiming(1.2, { duration: 900 })
      );
    } else {
      y.value = 0;
      opacity.value = 0;
      scale.value = 0.6;
    }
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <Animated.Text
      style={[
        styles.floatingNote,
        { left: note.left, bottom: note.bottom },
        animatedStyle,
      ]}
    >
      {note.symbol}
    </Animated.Text>
  );
}

interface MobileMenuButtonProps {
  isOpen: boolean;
  onPress: () => void;
}

export function MobileMenuButton({ isOpen, onPress }: MobileMenuButtonProps) {
  // Shared values for staff line unfolding
  const lineWidth1 = useSharedValue(24);
  const lineWidth2 = useSharedValue(24);
  const lineWidth3 = useSharedValue(24);
  const lineWidth4 = useSharedValue(24);
  const lineWidth5 = useSharedValue(24);
  const [triggerParticles, setTriggerParticles] = React.useState(false);

  useEffect(() => {
    if (isOpen) {
      // Unfold staff lines: expand them horizontally and stagger
      lineWidth1.value = withTiming(32, { duration: 250 });
      lineWidth2.value = withDelay(50, withTiming(38, { duration: 250 }));
      lineWidth3.value = withDelay(100, withTiming(34, { duration: 250 }));
      lineWidth4.value = withDelay(150, withTiming(40, { duration: 250 }));
      lineWidth5.value = withDelay(200, withTiming(30, { duration: 250 }));
    } else {
      // Reset back to standard hamburger staff widths
      lineWidth1.value = withTiming(24, { duration: 200 });
      lineWidth2.value = withTiming(24, { duration: 200 });
      lineWidth3.value = withTiming(24, { duration: 200 });
      lineWidth4.value = withTiming(24, { duration: 200 });
      lineWidth5.value = withTiming(24, { duration: 200 });
    }
  }, [isOpen]);

  const handlePress = () => {
    // Fire floating notes
    setTriggerParticles(true);
    setTimeout(() => setTriggerParticles(false), 1000);
    onPress();
  };

  // Animated line styles
  const lineStyle1 = useAnimatedStyle(() => ({ width: lineWidth1.value }));
  const lineStyle2 = useAnimatedStyle(() => ({ width: lineWidth2.value }));
  const lineStyle3 = useAnimatedStyle(() => ({ width: lineWidth3.value }));
  const lineStyle4 = useAnimatedStyle(() => ({ width: lineWidth4.value }));
  const lineStyle5 = useAnimatedStyle(() => ({ width: lineWidth5.value }));

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed,
      ]}
    >
      {/* Floating note particles */}
      {mockNotes.map((note) => (
        <FloatingParticleNote key={note.id} note={note} active={triggerParticles} />
      ))}

      {/* 5-Line Musical Staff Custom Menu Icon */}
      <View style={styles.iconWrapper}>
        <Animated.View style={[styles.staffLine, lineStyle1]} />
        <Animated.View style={[styles.staffLine, lineStyle2]} />
        <Animated.View style={[styles.staffLine, lineStyle3]} />
        <Animated.View style={[styles.staffLine, lineStyle4]} />
        <Animated.View style={[styles.staffLine, lineStyle5]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
    ...Platform.select({
      web: {
        cursor: 'pointer',
        transition: 'background-color 0.2s ease',
        ':hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.08)',
        },
      },
    }),
  },
  pressed: {
    transform: [{ scale: 0.94 }],
  },
  iconWrapper: {
    width: 32,
    height: 20,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  staffLine: {
    height: 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 1,
  },
  floatingNote: {
    position: 'absolute',
    color: '#FF4FA3',
    fontSize: 16,
    fontWeight: 'bold',
    zIndex: 10,
    textShadowColor: 'rgba(255, 79, 163, 0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
});
