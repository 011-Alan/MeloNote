import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Animated,
  StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export type QualityScores = {
  pitch_accuracy?: number;      // 0-100
  pitchAccuracy?: number;
  rhythm_accuracy?: number;     // 0-100
  rhythmAccuracy?: number;
  tempo_accuracy?: number;      // 0-100
  tempoAccuracy?: number;
  chroma_similarity?: number;   // 0-100
  chromaSimilarity?: number;
  overall_score?: number;       // 0-100
  overallScore?: number;
  best_tempo?: number;
  bestTempo?: number;
  best_gap_threshold?: number;
  bestGapThreshold?: number;
  best_grid_resolution?: number;
  bestGridResolution?: number;
};

type Props = {
  scores: QualityScores;
};

function getGrade(score: number): string {
  if (score >= 90) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 80) return 'B+';
  if (score >= 75) return 'B';
  if (score >= 65) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

function getScoreColor(score: number): string {
  if (score >= 80) return '#22c55e';   // green
  if (score >= 65) return '#f59e0b';   // amber
  return '#ef4444';                     // red
}

function getScoreGradient(score: number): [string, string] {
  if (score >= 80) return ['#16a34a', '#22c55e'];
  if (score >= 65) return ['#d97706', '#f59e0b'];
  return ['#dc2626', '#ef4444'];
}

type MetricBarProps = {
  label: string;
  icon: string;
  score: number;
  delay: number;
};

function MetricBar({ label, icon, score, delay }: MetricBarProps) {
  const barWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(barWidth, {
      toValue: score,
      duration: 900,
      delay,
      useNativeDriver: false,
    }).start();
  }, [score, delay]);

  const color = getScoreColor(score);

  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLabelRow}>
        <Text style={styles.metricIcon}>{icon}</Text>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={[styles.metricValue, { color }]}>
          {score.toFixed(1)}%
        </Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              width: barWidth.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
                extrapolate: 'clamp',
              }),
              backgroundColor: color,
            },
          ]}
        />
      </View>
    </View>
  );
}

export default function TranscriptionQualityCard({ scores }: Props) {
  const overall = scores.overall_score !== undefined ? scores.overall_score : (scores.overallScore || 0.0);
  const grade   = getGrade(overall);
  const gradientColors = getScoreGradient(overall);

  const bestTempo = scores.best_tempo !== undefined ? scores.best_tempo : scores.bestTempo;
  const bestGap = scores.best_gap_threshold !== undefined ? scores.best_gap_threshold : scores.bestGapThreshold;
  const bestGrid = scores.best_grid_resolution !== undefined ? scores.best_grid_resolution : scores.bestGridResolution;

  const pitchAcc = scores.pitch_accuracy !== undefined ? scores.pitch_accuracy : (scores.pitchAccuracy || 0.0);
  const rhythmAcc = scores.rhythm_accuracy !== undefined ? scores.rhythm_accuracy : (scores.rhythmAccuracy || 0.0);
  const tempoAcc = scores.tempo_accuracy !== undefined ? scores.tempo_accuracy : (scores.tempoAccuracy || 0.0);
  const chromaSim = scores.chroma_similarity !== undefined ? scores.chroma_similarity : (scores.chromaSimilarity || 0.0);

  // Animate the displayed score number using a state + useEffect
  const [displayedScore, setDisplayedScore] = React.useState(0);

  useEffect(() => {
    let start = 0;
    const end = Math.round(overall);
    if (start === end) {
      setDisplayedScore(end);
      return;
    }
    const duration = 1200;
    const stepTime = Math.max(Math.floor(duration / (end - start)), 10);
    const timer = setInterval(() => {
      start += 1;
      setDisplayedScore(start);
      if (start >= end) clearInterval(timer);
    }, stepTime);
    return () => clearInterval(timer);
  }, [overall]);

  const metrics: MetricBarProps[] = [
    { label: 'Pitch Accuracy',    icon: '🎵', score: pitchAcc,    delay: 200 },
    { label: 'Rhythm Accuracy',   icon: '🥁', score: rhythmAcc,   delay: 350 },
    { label: 'Tempo Accuracy',    icon: '⏱️', score: tempoAcc,    delay: 500 },
    { label: 'Chroma Similarity', icon: '🎼', score: chromaSim,   delay: 650 },
  ];

  const getGridLabel = (gridVal?: number) => {
    if (!gridVal) return 'automatic';
    if (Math.abs(gridVal - 0.25) < 0.01) return '16th note';
    if (Math.abs(gridVal - 0.50) < 0.01) return '8th note';
    return `${gridVal} beat`;
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>🔬 Transcription Quality</Text>
        <Text style={styles.subtitle}>Round-trip self-evaluation score</Text>
      </View>

      {/* Overall Score Circle */}
      <LinearGradient
        colors={['#1a1a2e', '#16213e']}
        style={styles.scoreSection}
      >
        <View style={styles.scoreCircleContainer}>
          {/* Outer ring */}
          <LinearGradient
            colors={gradientColors}
            style={styles.scoreCircleRing}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.scoreCircleInner}>
              <Text style={[styles.scoreNumber, { color: gradientColors[1] }]}>
                {displayedScore}
              </Text>
              <Text style={styles.scorePercent}>%</Text>
              <Text style={styles.scoreGrade}>{grade}</Text>
            </View>
          </LinearGradient>

          {/* Labels */}
          <View style={styles.scoreLabels}>
            <Text style={styles.overallLabel}>Overall Score</Text>
            {bestTempo ? (
              <Text style={styles.bestTempo}>
                Best BPM: <Text style={{ color: '#ff9500' }}>{bestTempo}</Text>
              </Text>
            ) : null}
          </View>
        </View>
      </LinearGradient>

      {/* Individual Metrics */}
      <View style={styles.metricsSection}>
        {metrics.map((m) => (
          <MetricBar
            key={m.label}
            label={m.label}
            icon={m.icon}
            score={m.score}
            delay={m.delay}
          />
        ))}
      </View>

      {/* Info Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          🔄 MeloNote self-tuned {bestGap
            ? `(merge gap: ${(bestGap * 1000).toFixed(0)}ms, grid: ${getGridLabel(bestGrid)})`
            : 'parameters automatically'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111111',
    borderRadius: 24,
    overflow: 'hidden',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f1f1f',
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  scoreSection: {
    padding: 24,
    alignItems: 'center',
  },
  scoreCircleContainer: {
    alignItems: 'center',
    gap: 16,
  },
  scoreCircleRing: {
    width: 140,
    height: 140,
    borderRadius: 70,
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreCircleInner: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: '#0a0a0a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreNumber: {
    fontSize: 44,
    fontWeight: '800',
    lineHeight: 48,
  },
  scorePercent: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
    marginTop: -4,
  },
  scoreGrade: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 1,
  },
  scoreLabels: {
    alignItems: 'center',
  },
  overallLabel: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  bestTempo: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  metricsSection: {
    padding: 20,
    gap: 16,
  },
  metricRow: {
    gap: 8,
  },
  metricLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metricIcon: {
    fontSize: 14,
  },
  metricLabel: {
    flex: 1,
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'right',
  },
  barTrack: {
    height: 6,
    backgroundColor: '#1f2937',
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#1f1f1f',
    padding: 16,
    alignItems: 'center',
  },
  footerText: {
    color: '#4b5563',
    fontSize: 11,
    textAlign: 'center',
  },
});
