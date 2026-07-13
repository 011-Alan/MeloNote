import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useSettings } from '@/context/SettingsContext';
import { EDUCATIONAL_TIPS, EducationalTip } from '@/constants/EducationalTips';
import { GlassCard } from '../ui/DesignSystem';
import { Ionicons } from '@expo/vector-icons';

// Fisher-Yates Shuffle
function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function EducationalTipsRotator() {
  const { theme } = useSettings();
  const isDark = theme === 'dark';
  
  // States
  const [shuffledTips, setShuffledTips] = useState<EducationalTip[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Shared values for fade transition
  const opacity = useSharedValue(1);

  // Initialize shuffled tips on mount
  useEffect(() => {
    setShuffledTips(shuffle(EDUCATIONAL_TIPS));
  }, []);

  const changeTip = () => {
    opacity.value = withTiming(0, { duration: 400 }, (finished) => {
      if (finished) {
        runOnJS(nextIndex)();
      }
    });
  };

  const nextIndex = () => {
    setCurrentIndex((prevIndex) => {
      const nextIdx = prevIndex + 1;
      if (nextIdx >= shuffledTips.length) {
        // Reshuffle and start over when all items are used
        setShuffledTips(shuffle(EDUCATIONAL_TIPS));
        return 0;
      }
      return nextIdx;
    });
  };

  // Fade back in when index changes
  useEffect(() => {
    if (shuffledTips.length > 0) {
      opacity.value = withTiming(1, { duration: 400 });
    }
  }, [currentIndex, shuffledTips]);

  // Set up 5-second interval
  useEffect(() => {
    const timer = setInterval(() => {
      changeTip();
    }, 5000);

    return () => clearInterval(timer);
  }, [shuffledTips]);

  // Get color for category pill
  const getCategoryTheme = (cat: string) => {
    switch (cat) {
      case 'Music Facts':
        return { bg: '#FF4FA3', icon: 'musical-notes' };
      case 'Music Notation Facts':
        return { bg: '#7B61FF', icon: 'list' };
      case 'MeloNote Tips':
        return { bg: '#FF8A00', icon: 'sparkles' };
      case 'Transcription Tips':
        return { bg: '#00E676', icon: 'mic' };
      case 'Editing Tips':
        return { bg: '#00B0FF', icon: 'create' };
      default:
        return { bg: '#FF4FA3', icon: 'bulb' };
    }
  };

  const currentTip = shuffledTips[currentIndex];

  const catTheme = getCategoryTheme(currentTip?.category || 'Music Facts');
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  if (!currentTip) {
    return null;
  }

  const cardBackground = isDark ? 'rgba(20, 20, 25, 0.4)' : 'rgba(255, 255, 255, 0.4)';
  const cardBorderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';

  return (
    <GlassCard style={StyleSheet.flatten([styles.card, { backgroundColor: cardBackground, borderColor: cardBorderColor }])}>
      <Animated.View style={[styles.container, animatedStyle]}>
        <View style={styles.header}>
          <View style={[styles.categoryBadge, { backgroundColor: catTheme.bg }]}>
            <Ionicons name={catTheme.icon as any} size={12} color="#FFFFFF" style={{ marginRight: 4 }} />
            <Text style={styles.categoryText}>{currentTip.category}</Text>
          </View>
          <Text style={[styles.didYouKnow, { color: isDark ? '#8E929A' : '#60646C' }]}>Did You Know?</Text>
        </View>
        <Text style={[styles.tipText, { color: isDark ? '#FFFFFF' : '#121212' }]}>
          {currentTip.text}
        </Text>
      </Animated.View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 110,
    justifyContent: 'center',
    marginVertical: 10,
  },
  container: {
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    width: '100%',
  },
  categoryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  categoryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  didYouKnow: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tipText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
});
