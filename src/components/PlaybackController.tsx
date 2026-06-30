import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable, Platform, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface PlaybackControllerProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onPlayPause: () => void;
  onRestart: () => void;
  onSeek: (time: number) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  renderRightSide?: () => React.ReactNode;
}

export default function PlaybackController({
  currentTime,
  duration,
  isPlaying,
  onPlayPause,
  onRestart,
  onSeek,
  onDragStart,
  onDragEnd,
  renderRightSide,
}: PlaybackControllerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [progressBarWidth, setProgressBarWidth] = useState(0);

  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const roundedSec = Math.round(sec);
    const minutes = Math.floor(roundedSec / 60);
    const seconds = roundedSec % 60;
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };

  const handleTouch = (e: any) => {
    if (duration <= 0 || progressBarWidth <= 0) return;
    const touchX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX ?? 0;
    const ratio = Math.max(0, Math.min(1, touchX / progressBarWidth));
    const targetTime = ratio * duration;
    setDragTime(targetTime);
  };

  const activeProgress = isDragging ? dragTime : currentTime;
  const progressPercent = duration > 0 ? (activeProgress / duration) * 100 : 0;
  const displayProgress = Math.min(100, Math.max(0, progressPercent));

  return (
    <View style={styles.container}>
      {/* Clickable and Draggable Progress Bar with Pointer Ball */}
      <View style={styles.sliderWrapper}>
        <View
          onLayout={(e) => setProgressBarWidth(e.nativeEvent.layout.width)}
          onTouchStart={(e) => {
            setIsDragging(true);
            if (onDragStart) onDragStart();
            handleTouch(e);
          }}
          onTouchMove={(e) => {
            handleTouch(e);
          }}
          onTouchEnd={() => {
            setIsDragging(false);
            if (onDragEnd) onDragEnd();
            onSeek(dragTime);
          }}
          style={styles.touchArea}
        >
          <View style={styles.trackBackground}>
            <View 
              style={[
                styles.trackFill, 
                { width: `${displayProgress}%` }
              ]} 
            />
            {/* Moving Ball Knob */}
            <View
              style={[
                styles.knob,
                { left: `${displayProgress}%` }
              ]}
            />
          </View>
        </View>
      </View>

      {/* Buttons & Info Row */}
      <View style={styles.controlsRow}>
        <View style={styles.timeLeftContainer}>
          <Text style={styles.timeText}>
            {formatTime(activeProgress)} / {formatTime(duration)}
          </Text>
        </View>

        <View style={styles.buttonsContainer}>
          <Pressable
            disabled={currentTime === 0}
            onPress={onRestart}
            style={({ pressed }) => [
              styles.restartBtn,
              currentTime === 0 && { opacity: 0.4 },
              pressed && currentTime > 0 && { transform: [{ scale: 0.9 }] }
            ]}
          >
            <Ionicons name="play-skip-back" size={18} color="white" />
          </Pressable>

          <Pressable
            onPress={onPlayPause}
            style={({ pressed }) => [
              styles.playPauseBtn,
              pressed && { opacity: 0.8, transform: [{ scale: 0.92 }] }
            ]}
          >
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={24}
              color="white"
            />
          </Pressable>
        </View>

        <View style={styles.rightSideContainer}>
          {renderRightSide ? renderRightSide() : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#121214',
    borderTopWidth: 1,
    borderTopColor: '#1c1c1e',
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  sliderWrapper: {
    width: '100%',
    height: 24,
    justifyContent: 'center',
  },
  touchArea: {
    width: '100%',
    height: 24,
    justifyContent: 'center',
  },
  trackBackground: {
    height: 6,
    backgroundColor: '#2c2c2e',
    borderRadius: 3,
    width: '100%',
    position: 'relative',
    pointerEvents: 'none',
  },
  trackFill: {
    height: 6,
    backgroundColor: '#ff9500',
    borderRadius: 3,
    position: 'absolute',
    left: 0,
    top: 0,
  },
  knob: {
    position: 'absolute',
    top: -4,
    marginLeft: -7,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#ff9500',
    elevation: 3,
  },
  controlsRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  timeLeftContainer: {
    minWidth: 100,
    justifyContent: 'flex-start',
  },
  timeText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  buttonsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  restartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1c1c1e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPauseBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#ff9500',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightSideContainer: {
    minWidth: 100,
    alignItems: 'flex-end',
  },
});
