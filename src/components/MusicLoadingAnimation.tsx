/**
 * MusicLoadingAnimation v3
 *
 * Premium cinematic loading screen for MeloNote's audio-to-sheet conversion.
 * Redesigned to use unified SVG Paths driven on the UI thread via useAnimatedProps
 * for smooth, lag-free 60 FPS performance.
 *
 * Visual design
 * ─────────────
 *  • Pure black background
 *  • Five staff lines tilted ~15° flowing diagonally across the screen
 *  • Smooth SVG bezier path rendering (a single path element per staff line instead of segmented rectangles)
 *  • Flowing gradient of pink, purple, and white traveling dynamically along the staff paths
 *  • Treble clef anchored to the left, bobbing naturally with the wave
 *  • Musical notes and sparkles floating along the wave trajectory
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  cancelAnimation,
  interpolate,
  interpolateColor,
  SharedValue,
} from 'react-native-reanimated';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ─── Screen ───────────────────────────────────────────────────────────────────
const { width: W, height: H } = Dimensions.get('window');

// ─── Staff geometry ───────────────────────────────────────────────────────────
const TILT_TAN       = Math.tan((15 * Math.PI) / 180); // ≈ 0.268

const STAFF_LINES    = 5;
const LINE_SPACING   = 10;   // px between adjacent staff lines (reduced from 14 for smaller size)

const CLEF_AREA_W    = 56;   // reduced width
const STAFF_LEFT     = (W - (W * 0.76)) / 2 + CLEF_AREA_W; // centered horizontally
const STAFF_SPAN     = W * 0.76 - CLEF_AREA_W;  // staff width is 76% of screen width
const LINE_H         = 2.0;   // slightly thinner lines

const STAFF_TOP_Y    =
  H * 0.40                  // middle-centered vertical anchor
  - 2 * LINE_SPACING
  - (STAFF_SPAN / 2) * TILT_TAN;

// ─── Wave parameters ──────────────────────────────────────────────────────────
const WAVE_CYCLES    = 1.4;   // full wave cycles visible across the staff
const WAVE_BASE      = 7;     // peak amplitude (px) for the centre line
const LINE_AMP: readonly number[] = [0.60, 0.80, 1.00, 0.80, 0.60];

// ─── Animation timing ─────────────────────────────────────────────────────────
const LOOP_MS        = 2800;
const NOTE_COUNT     = 5;
const NOTE_GAP_MS    = LOOP_MS / NOTE_COUNT;

const NOTE_LINES: readonly number[] = [2, 0, 4, 1, 3];
const SYMBOLS: readonly string[]    = ['♩', '♪', '♫', '♩', '♪'];

// ─── Colours ─────────────────────────────────────────────────────────────────
const PINK    = '#f472b6';
const VIOLET  = '#a78bfa';
const WHITE   = '#ffffff';
const LAVENDER = '#e9d5ff';

// ─── Status messages ──────────────────────────────────────────────────────────
const MESSAGES: readonly string[] = [
  'Listening to your music...',
  'Finding the melody...',
  'Understanding the rhythm...',
  'Refining every note...',
  'Building your music sheet...',
  'Almost done...',
];
const MSG_INTERVAL   = 2800;

// ═══════════════════════════════════════════════════════════════════════════════
// AnimatedStaffLine
// ═══════════════════════════════════════════════════════════════════════════════
interface AnimatedStaffLineProps {
  lineIndex: number;
  wavePhase: SharedValue<number>;
}

const AnimatedStaffLine: React.FC<AnimatedStaffLineProps> = React.memo(({ lineIndex, wavePhase }) => {
  const baseY = STAFF_TOP_Y + lineIndex * LINE_SPACING;
  const amp   = WAVE_BASE * LINE_AMP[lineIndex];

  // We sample 30 points to build a highly dense and perfectly smooth cubic bezier SVG path
  const animatedProps = useAnimatedProps(() => {
    let d = '';
    const pointsCount = 30;
    for (let i = 0; i <= pointsCount; i++) {
      const t = i / pointsCount;
      const x = STAFF_LEFT + t * STAFF_SPAN;
      const tiltDY = t * STAFF_SPAN * TILT_TAN;
      const wave = Math.sin(t * WAVE_CYCLES * Math.PI * 2 - wavePhase.value) * amp;
      const y = baseY + tiltDY + wave;

      if (i === 0) {
        d += `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      } else {
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
    }
    return { d };
  });

  const lineOp = 0.55 + 0.45 * (1 - Math.abs(lineIndex - 2) * 0.35);

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      fill="none"
      stroke="url(#staff-grad)"
      strokeWidth={LINE_H}
      opacity={lineOp}
      strokeLinecap="round"
    />
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// AnimatedClef
// ═══════════════════════════════════════════════════════════════════════════════
interface AnimatedClefProps {
  wavePhase:  SharedValue<number>;
  colorPhase: SharedValue<number>;
}

const AnimatedClef: React.FC<AnimatedClefProps> = ({ wavePhase, colorPhase }) => {
  const clefStyle = useAnimatedStyle(() => {
    const dy = -Math.sin(wavePhase.value) * WAVE_BASE * LINE_AMP[2];
    
    // Shift color based on colorPhase, matching the ribbon gradient colors
    const t   = (Math.sin(-colorPhase.value) + 1) * 0.5;
    const color = interpolateColor(t, [0, 0.5, 1], [PINK, VIOLET, WHITE]);
    const shadowColor = interpolateColor(t, [0, 0.5, 1], [VIOLET, PINK, VIOLET]);

    return {
      transform: [{ translateY: dy }],
      color,
      shadowColor,
    };
  });

  return (
    <Animated.View style={[styles.clefContainer, clefStyle]}>
      <Animated.Text style={[styles.trebleClef, clefStyle]}>{'𝄞'}</Animated.Text>
    </Animated.View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// NoteParticle
// ═══════════════════════════════════════════════════════════════════════════════
const NoteParticle: React.FC<{
  symbol:    string;
  delayMs:   number;
  lineIndex: number;
  wavePhase: SharedValue<number>;
}> = ({ symbol, delayMs, lineIndex, wavePhase }) => {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withRepeat(
        withTiming(1, {
          duration: LOOP_MS,
          easing:   Easing.inOut(Easing.sin),
        }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(progress);
  }, []);

  const baseLineY = STAFF_TOP_Y + lineIndex * LINE_SPACING;
  const amp       = WAVE_BASE * LINE_AMP[lineIndex];

  const noteStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const xNorm  = 1 - p;
    const xPx    = STAFF_LEFT + xNorm * STAFF_SPAN;
    const tiltDY = xNorm * STAFF_SPAN * TILT_TAN;
    const wave   = Math.sin(xNorm * WAVE_CYCLES * Math.PI * 2 - wavePhase.value) * amp;
    const y      = baseLineY + tiltDY + wave - 22;

    let morphT: number;
    if (p < 0.12)      { morphT = p / 0.12; }
    else if (p < 0.82) { morphT = 1; }
    else               { morphT = 1 - (p - 0.82) / 0.18; }

    const scale   = interpolate(morphT, [0, 0.4, 1], [0.10, 0.75, 1.0]);
    const opacity = interpolate(morphT, [0, 0.20, 1], [0,    1,    1  ]);
    const glowR   = interpolate(p,      [0, 0.75, 1], [5,    9,   22  ]);

    return {
      position:         'absolute' as const,
      left:             xPx,
      top:              y,
      opacity,
      transform:        [{ scale }],
      textShadowRadius: glowR,
    };
  });

  return (
    <Animated.Text style={[styles.noteGlyph, noteStyle]}>
      {symbol}
    </Animated.Text>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// Sparkle
// ═══════════════════════════════════════════════════════════════════════════════
const Sparkle: React.FC<{
  angle:     number;
  delayMs:   number;
  wavePhase: SharedValue<number>;
}> = ({ angle, delayMs, wavePhase }) => {
  const anim = useSharedValue(0);

  useEffect(() => {
    anim.value = 0;
    anim.value = withDelay(
      delayMs,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }),
          withTiming(0, { duration: 240, easing: Easing.in(Easing.cubic) }),
          withTiming(0, { duration: LOOP_MS - 560 }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(anim);
  }, []);

  const RADIUS = 26;
  const dx     = Math.cos(angle) * RADIUS;
  const dy     = Math.sin(angle) * RADIUS;
  const originX = STAFF_LEFT + 8;
  const originY = STAFF_TOP_Y + 2 * LINE_SPACING;

  const style = useAnimatedStyle(() => {
    const p    = anim.value;
    const wave = -Math.sin(wavePhase.value) * WAVE_BASE * LINE_AMP[2];
    return {
      position:  'absolute' as const,
      left:      originX + dx * p - 2.5,
      top:       originY + wave + dy * p - 2.5,
      opacity:   p,
      transform: [{ scale: interpolate(p, [0, 1], [0.1, 1]) }],
    };
  });

  return <Animated.View style={[styles.sparkle, style]} />;
};

// ═══════════════════════════════════════════════════════════════════════════════
// StatusMessage
// ═══════════════════════════════════════════════════════════════════════════════
const StatusMessage: React.FC = () => {
  const [msgIndex, setMsgIndex] = useState(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    let mounted = true;

    const interval = setInterval(() => {
      opacity.value = withTiming(0, {
        duration: 450,
        easing:   Easing.inOut(Easing.sin),
      });
      setTimeout(() => {
        if (!mounted) return;
        setMsgIndex(prev => (prev + 1) % MESSAGES.length);
        opacity.value = withTiming(1, {
          duration: 450,
          easing:   Easing.inOut(Easing.sin),
        });
      }, 500);
    }, MSG_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const textStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.Text style={[styles.statusMessage, textStyle]}>
      {MESSAGES[msgIndex]}
    </Animated.Text>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PulsingDot
// ═══════════════════════════════════════════════════════════════════════════════
const PulsingDot: React.FC<{ delay: number }> = ({ delay }) => {
  const op = useSharedValue(0.25);

  useEffect(() => {
    op.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.0,  { duration: 700, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(op);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: op.value }));
  return <Animated.View style={[styles.dot, style]} />;
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════════════════════
interface Props {
  subtitle?: string;
}

export default function MusicLoadingAnimation({ subtitle: _subtitle }: Props) {
  const wavePhase  = useSharedValue(0);
  const colorPhase = useSharedValue(0);

  useEffect(() => {
    wavePhase.value = withRepeat(
      withTiming(Math.PI * 2, { duration: LOOP_MS, easing: Easing.linear }),
      -1,
      false,
    );
    colorPhase.value = withRepeat(
      withTiming(Math.PI * 2, {
        duration: Math.round(LOOP_MS / 0.60),
        easing:   Easing.linear,
      }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(wavePhase);
      cancelAnimation(colorPhase);
    };
  }, []);

  // Compute moving coordinates for the traveling gradient light glow
  const gradProps = useAnimatedProps(() => {
    // The gradient traveling along the horizontal axis
    const shift = (colorPhase.value / (Math.PI * 2)) * 100;
    return {
      x1: `${shift - 30}%`,
      x2: `${shift + 70}%`,
    };
  });

  const sparkleAngles = Array.from({ length: 8 }, (_, i) => (i * Math.PI * 2) / 8);
  const sparkleDelay  = Math.round(LOOP_MS * 0.82);

  return (
    <View style={styles.container}>

      {/* ── Continuous SVG Curves Staff ───────────────────────────────────────── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={W} height={H}>
          <Defs>
            {/* Animated linear gradient reflecting flowing energy wave */}
            <AnimatedLinearGradient
              id="staff-grad"
              animatedProps={gradProps}
              y1="0%"
              y2="0%"
            >
              <Stop offset="0%" stopColor={VIOLET} />
              <Stop offset="40%" stopColor={PINK} />
              <Stop offset="70%" stopColor={WHITE} />
              <Stop offset="100%" stopColor={VIOLET} />
            </AnimatedLinearGradient>
          </Defs>

          {Array.from({ length: STAFF_LINES }, (_, li) => (
            <AnimatedStaffLine
              key={`line-${li}`}
              lineIndex={li}
              wavePhase={wavePhase}
            />
          ))}
        </Svg>
      </View>

      {/* ── Treble clef ──────────────────────────────────────────────────────── */}
      <AnimatedClef wavePhase={wavePhase} colorPhase={colorPhase} />

      {/* ── Note particles (5) ────────────────────────────────────────────────── */}
      {SYMBOLS.map((sym, i) => (
        <NoteParticle
          key={`note-${i}`}
          symbol={sym}
          delayMs={i * NOTE_GAP_MS}
          lineIndex={NOTE_LINES[i]}
          wavePhase={wavePhase}
        />
      ))}

      {/* ── Sparkle burst at clef (8 particles) ──────────────────────────────── */}
      {sparkleAngles.map((angle, i) => (
        <Sparkle
          key={`spark-${i}`}
          angle={angle}
          delayMs={sparkleDelay + i * 20}
          wavePhase={wavePhase}
        />
      ))}

      {/* ── Text block: title + cycling message + pulsing dots ───────────────── */}
      <View style={styles.textBlock}>
        <Text style={styles.title}>Analyzing Audio</Text>
        <StatusMessage />
        <View style={styles.dotsRow}>
          <PulsingDot delay={0} />
          <PulsingDot delay={200} />
          <PulsingDot delay={400} />
        </View>
      </View>

    </View>
  );
}

// ─── Workaround for Animated linear gradient in SVG ──────────────────────────
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  clefContainer: {
    position: 'absolute',
    left:      STAFF_LEFT - CLEF_AREA_W + 30,
    top:       STAFF_TOP_Y + 3 * LINE_SPACING - 154,
    overflow:  'visible',
  },
  trebleClef: {
    fontSize:         50,
    lineHeight:       280,
    color:            PINK,
    textShadowColor:  VIOLET,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  noteGlyph: {
    fontSize:         26,
    color:            LAVENDER,
    textShadowColor:  VIOLET,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  sparkle: {
    width:           5,
    height:          5,
    borderRadius:    2.5,
    backgroundColor: WHITE,
    elevation:       6,
    shadowColor:     WHITE,
    shadowOffset:    { width: 0, height: 0 },
    shadowRadius:    6,
    shadowOpacity:   1,
  },
  textBlock: {
    position:   'absolute',
    bottom:     H * 0.12,
    left:       0,
    right:      0,
    alignItems: 'center',
  },
  title: {
    color:         WHITE,
    fontSize:      22,
    fontWeight:    '700',
    letterSpacing: 0.3,
    marginBottom:  8,
  },
  statusMessage: {
    color:              '#94a3b8',
    fontSize:           14,
    fontStyle:          'italic',
    textAlign:          'center',
    paddingHorizontal:  48,
    lineHeight:         22,
    marginBottom:       20,
  },
  dotsRow: {
    flexDirection: 'row',
    gap:           10,
    alignItems:    'center',
  },
  dot: {
    width:           7,
    height:          7,
    borderRadius:    3.5,
    backgroundColor: VIOLET,
  },
});
