import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInUp } from 'react-native-reanimated';
import Svg, { Path, Rect, Line, Circle } from 'react-native-svg';

const AudioToSheetIcon = () => (
  <Svg viewBox="0 0 80 80" width={60} height={60}>
    <LinearGradient id="iconGrad1" colors={['#FF8A00', '#FF4FA3']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Path
        d="M 10 40 L 15 25 L 20 55 L 25 30 L 30 50 L 35 35 L 40 45 L 45 40"
        fill="none"
        stroke="url(#iconGrad1)"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M 46 40 L 52 40"
        fill="none"
        stroke="#FF4FA3"
        strokeWidth={2}
        strokeDasharray="4 3"
      />
      <Circle cx={62} cy={42} r={6} fill="#FF4FA3" />
      <Path d="M 68 42 L 68 22 L 76 25 L 76 35 L 68 32" fill="#FF4FA3" />
    </LinearGradient>
    <Rect width={80} height={80} rx={16} fill="rgba(255, 138, 0, 0.08)" stroke="rgba(255, 138, 0, 0.15)" strokeWidth={1} />
  </Svg>
);

const ComposeIcon = () => (
  <Svg viewBox="0 0 80 80" width={60} height={60}>
    <LinearGradient id="iconGrad2" colors={['#FF4FA3', '#7B61FF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      {/* Musical staff lines */}
      <Line x1={15} y1={25} x2={50} y2={25} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={2} />
      <Line x1={15} y1={33} x2={50} y2={33} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={2} />
      <Line x1={15} y1={41} x2={55} y2={41} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={2} />
      <Line x1={15} y1={49} x2={55} y2={49} stroke="rgba(255, 255, 255, 0.2)" strokeWidth={2} />
      
      {/* Note */}
      <Circle cx={28} cy={49} r={5} fill="url(#iconGrad2)" />
      <Path d="M 33 49 L 33 29 M 33 29 L 43 31" fill="none" stroke="url(#iconGrad2)" strokeWidth={2} />

      {/* Pencil */}
      <Path
        d="M 52 48 L 70 30 L 64 24 L 46 42 L 44 48 Z"
        fill="url(#iconGrad2)"
        stroke="#7B61FF"
        strokeWidth={1}
      />
    </LinearGradient>
    <Rect width={80} height={80} rx={16} fill="rgba(255, 79, 163, 0.08)" stroke="rgba(255, 79, 163, 0.15)" strokeWidth={1} />
  </Svg>
);

const ScanIcon = () => (
  <Svg viewBox="0 0 80 80" width={60} height={60}>
    <LinearGradient id="iconGrad3" colors={['#7B61FF', '#FF8A00']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      {/* Paper sheet */}
      <Rect x={18} y={15} width={44} height={50} rx={4} fill="none" stroke="url(#iconGrad3)" strokeWidth={2.5} />
      <Line x1={26} y1={28} x2={54} y2={28} stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
      <Line x1={26} y1={38} x2={54} y2={38} stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
      <Line x1={26} y1={48} x2={44} y2={48} stroke="rgba(255,255,255,0.2)" strokeWidth={2} />
      
      {/* Laser scanning line */}
      <Line x1={10} y1={33} x2={70} y2={33} stroke="#FF8A00" strokeWidth={2} />
      <Path d="M 8 30 L 8 36 M 72 30 L 72 36" fill="none" stroke="#FF8A00" strokeWidth={2.5} />
    </LinearGradient>
    <Rect width={80} height={80} rx={16} fill="rgba(123, 97, 255, 0.08)" stroke="rgba(123, 97, 255, 0.15)" strokeWidth={1} />
  </Svg>
);

export function ThreeWaysSection() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 900;
  const isTablet = width >= 600 && width < 900;

  const cards = [
    {
      title: 'Audio → Sheet Music',
      description:
        'Upload or record music and let AI generate editable sheet music by detecting pitch, rhythm, tempo, and note duration.',
      icon: <AudioToSheetIcon />,
      delay: 100,
    },
    {
      title: 'Create from Scratch',
      description:
        'Compose original music using the built-in sheet music editor with real-time editing and playback.',
      icon: <ComposeIcon />,
      delay: 300,
    },
    {
      title: 'Scan Music Sheets',
      description:
        'Scan printed or handwritten sheet music using Optical Music Recognition (OMR) and convert it into editable digital notation.',
      icon: <ScanIcon />,
      delay: 500,
    },
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Three Ways to Create Music</Text>
      <Text style={styles.sectionSubtitle}>
        MeloNote simplifies your composition workflow. Whether you perform it, write it, or scan it, we handle the notation.
      </Text>

      <View style={[styles.cardsGrid, isDesktop ? styles.row : styles.column]}>
        {cards.map((card, idx) => (
          <Animated.View
            key={idx}
            entering={FadeInUp.delay(card.delay).duration(600)}
            style={[
              styles.card,
              isDesktop ? styles.width30 : isTablet ? styles.width45 : styles.width100,
            ]}
          >
            <View style={styles.iconContainer}>{card.icon}</View>
            <Text style={styles.cardTitle}>{card.title}</Text>
            <Text style={styles.cardDesc}>{card.description}</Text>
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: 80,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'var(--font-display)',
  },
  sectionSubtitle: {
    color: '#B0B4BA',
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    maxWidth: 600,
    marginBottom: 50,
  },
  cardsGrid: {
    width: '100%',
    maxWidth: 1200,
    justifyContent: 'center',
    gap: 24,
  },
  row: {
    flexDirection: 'row',
  },
  column: {
    flexDirection: 'column',
    alignItems: 'center',
  },
  width30: {
    width: '30%',
    maxWidth: 360,
  },
  width45: {
    width: '45%',
  },
  width100: {
    width: '100%',
    maxWidth: 400,
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 32,
    alignItems: 'flex-start',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        transition: 'transform 0.3s ease, border-color 0.3s ease, background-color 0.3s ease',
        cursor: 'pointer',
        ':hover': {
          transform: 'translateY(-8px)',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
        },
      },
    }),
  },
  iconContainer: {
    marginBottom: 24,
  },
  cardTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 12,
    fontFamily: 'var(--font-display)',
  },
  cardDesc: {
    color: '#B0B4BA',
    fontSize: 15,
    lineHeight: 22,
  },
});
