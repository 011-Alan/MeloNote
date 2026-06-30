import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Text, Dimensions, Platform } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSequence,
  withRepeat,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import Svg, { Path, G, Rect, Circle, Line, Defs, Stop, LinearGradient as SvgGradient } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

export function MeloNoteLogoIntro({ onComplete }: { onComplete: () => void }) {
  const [phase, setPhase] = useState<'wave' | 'clef' | 'staff' | 'wordmark'>('wave');
  
  // Reanimated shared values
  const waveScale = useSharedValue(1);
  const waveOpacity = useSharedValue(1);
  const clefScale = useSharedValue(0);
  const clefOpacity = useSharedValue(0);
  const staffWidth = useSharedValue(0);
  const staffWave = useSharedValue(0);
  const noteProgress = useSharedValue(0);
  const wordmarkOpacity = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    // Phase 1: Waveform pulse (0.8s)
    waveScale.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 250, easing: Easing.ease }),
        withTiming(0.8, { duration: 250, easing: Easing.ease })
      ),
      2,
      true
    );

    // Transition to Phase 2: Morph to Treble Clef (0.8s - 1.6s)
    const timer1 = setTimeout(() => {
      setPhase('clef');
      waveOpacity.value = withTiming(0, { duration: 400 });
      clefOpacity.value = withTiming(1, { duration: 500 });
      clefScale.value = withTiming(1.2, { duration: 500, easing: Easing.back(1.5) }, () => {
        clefScale.value = withTiming(1.0, { duration: 200 });
      });
    }, 850);

    // Transition to Phase 3: Staff Extension & Wave (1.6s - 2.4s)
    const timer2 = setTimeout(() => {
      setPhase('staff');
      staffWidth.value = withTiming(240, { duration: 600, easing: Easing.out(Easing.quad) });
      staffWave.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
          withTiming(-1, { duration: 800, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        true
      );
    }, 1700);

    // Transition to Phase 4: Notes Flow (2.3s - 3.2s)
    const timer3 = setTimeout(() => {
      noteProgress.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) });
    }, 2200);

    // Transition to Phase 5: Settle into MeloNote wordmark (3.2s - 4s)
    const timer4 = setTimeout(() => {
      setPhase('wordmark');
      wordmarkOpacity.value = withTiming(1, { duration: 600 });
    }, 3100);

    // Complete overlay fade out
    const timer5 = setTimeout(() => {
      overlayOpacity.value = withTiming(0, { duration: 500 }, (finished) => {
        if (finished) {
          runOnJS(onComplete)();
        }
      });
    }, 4200);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);
    };
  }, []);

  // Animated styles
  const waveStyle = useAnimatedStyle(() => ({
    opacity: waveOpacity.value,
    transform: [{ scaleY: waveScale.value }],
  }));

  const clefStyle = useAnimatedStyle(() => ({
    opacity: clefOpacity.value,
    transform: [{ scale: clefScale.value }],
  }));

  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
  }));

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]}>
      <LinearGradient
        colors={['#0F0F12', '#050507']}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.centerContainer}>
        {/* SVG Container for the morphing logic */}
        <View style={styles.svgContainer}>
          <Svg width={320} height={200} viewBox="0 0 320 200">
            {/* Waveform representation */}
            {phase === 'wave' && (
              <G transform="translate(160, 100)">
                <Line x1={-50} y1={0} x2={-50} y2={20} stroke="#FF8A00" strokeWidth={5} strokeLinecap="round" />
                <Line x1={-30} y1={0} x2={-30} y2={45} stroke="#FF8A00" strokeWidth={5} strokeLinecap="round" />
                <Line x1={-10} y1={0} x2={-10} y2={60} stroke="#FF4FA3" strokeWidth={5} strokeLinecap="round" />
                <Line x1={10} y1={0} x2={10} y2={70} stroke="#FF4FA3" strokeWidth={5} strokeLinecap="round" />
                <Line x1={30} y1={0} x2={30} y2={40} stroke="#7B61FF" strokeWidth={5} strokeLinecap="round" />
                <Line x1={50} y1={0} x2={50} y2={15} stroke="#7B61FF" strokeWidth={5} strokeLinecap="round" />
                {/* Mirror */}
                <Line x1={-50} y1={0} x2={-50} y2={-20} stroke="#FF8A00" strokeWidth={5} strokeLinecap="round" />
                <Line x1={-30} y1={0} x2={-30} y2={-45} stroke="#FF8A00" strokeWidth={5} strokeLinecap="round" />
                <Line x1={-10} y1={0} x2={-10} y2={-60} stroke="#FF4FA3" strokeWidth={5} strokeLinecap="round" />
                <Line x1={10} y1={0} x2={10} y2={-70} stroke="#FF4FA3" strokeWidth={5} strokeLinecap="round" />
                <Line x1={30} y1={0} x2={30} y2={-40} stroke="#7B61FF" strokeWidth={5} strokeLinecap="round" />
                <Line x1={50} y1={0} x2={50} y2={-15} stroke="#7B61FF" strokeWidth={5} strokeLinecap="round" />
              </G>
            )}

            {/* Treble Clef and Staff lines */}
            {(phase === 'clef' || phase === 'staff' || phase === 'wordmark') && (
              <G transform="translate(40, 30)">
                {/* Treble Clef Path */}
                <Path
                  d="M35 135 C35 145, 50 145, 50 135 C50 120, 38 115, 30 110 C20 102, 15 90, 15 75 C15 45, 40 20, 50 5 C52 2, 55 2, 55 5 L55 125 C55 135, 62 140, 70 140 C80 140, 85 130, 85 120 C85 105, 72 98, 65 98 C60 98, 55 100, 55 105 C55 110, 58 112, 60 112 C62 112, 65 110, 65 106 C65 103, 62 101, 58 101 L58 55 C65 65, 75 75, 75 88 C75 102, 65 115, 52 118 L52 35 C42 45, 30 60, 30 78 C30 92, 38 102, 45 108 C48 110, 52 112, 52 115 L52 128 C45 128, 35 125, 35 135 Z"
                  fill="url(#morphClefGrad)"
                  opacity={phase === 'wordmark' ? 0.3 : 1}
                />
                
                {/* Five-Line Staff */}
                {(phase === 'staff' || phase === 'wordmark') && (
                  <G opacity={phase === 'wordmark' ? 0.2 : 0.8}>
                    {[38, 52, 66, 80, 94].map((y, idx) => (
                      <Line
                        key={idx}
                        x1={75}
                        y1={y}
                        x2={75 + staffWidth.value}
                        y2={y}
                        stroke="#FF4FA3"
                        strokeWidth={1.5}
                      />
                    ))}
                  </G>
                )}

                {/* Notes Flowing Along Staff */}
                {phase === 'staff' && noteProgress.value > 0 && (
                  <G opacity={1 - noteProgress.value * 0.4}>
                    <Circle cx={85 + noteProgress.value * 120} cy={66} r={5} fill="#FF8A00" />
                    <Line x1={90 + noteProgress.value * 120} y1={66} x2={90 + noteProgress.value * 120} y2={46} stroke="#FF8A00" strokeWidth={1.5} />

                    <Circle cx={125 + noteProgress.value * 120} cy={52} r={5} fill="#7B61FF" />
                    <Line x1={130 + noteProgress.value * 120} y1={52} x2={130 + noteProgress.value * 120} y2={32} stroke="#7B61FF" strokeWidth={1.5} />
                  </G>
                )}
              </G>
            )}

            <Defs>
              <SvgGradient id="morphClefGrad" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0%" stopColor="#FF8A00" />
                <Stop offset="50%" stopColor="#FF4FA3" />
                <Stop offset="100%" stopColor="#7B61FF" />
              </SvgGradient>
            </Defs>
          </Svg>
        </View>

        {/* Brand wordmark settling */}
        {phase === 'wordmark' && (
          <Animated.View style={[styles.wordmarkContainer, wordmarkStyle]}>
            <Text style={styles.wordmarkTitle}>MeloNote</Text>
            <Text style={styles.wordmarkTagline}>AI MUSIC WORKSPACE</Text>
          </Animated.View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svgContainer: {
    width: 320,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  wordmarkContainer: {
    marginTop: 20,
    alignItems: 'center',
  },
  wordmarkTitle: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -1,
    fontFamily: Platform.OS === 'web' ? 'var(--font-rounded)' : 'System',
  },
  wordmarkTagline: {
    color: '#7B61FF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 4,
    marginTop: 4,
  },
});
