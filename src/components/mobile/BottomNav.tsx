import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

interface BottomNavProps {
  activeTab: string;
  onPressTab: (tab: string) => void;
}

export function BottomNav({ activeTab, onPressTab }: BottomNavProps) {
  const tabs = [
    { name: 'Home', icon: '🏠', route: '/' },
    { name: 'Projects', icon: '📂', route: '/projects' },
    { name: 'New', icon: '➕', route: '/create', isCenter: true },
    { name: 'Library', icon: '🎼', route: '/projects' },
    { name: 'Profile', icon: '👤', route: '/settings' },
  ];

  return (
    <View style={styles.navBarContainer}>
      <View style={styles.innerBar}>
        {tabs.map((tab, idx) => {
          if (tab.isCenter) {
            return (
              <Pressable
                key={idx}
                onPress={() => onPressTab(tab.route)}
                style={({ pressed }) => [
                  styles.centerButtonWrapper,
                  pressed && styles.pressedCenter,
                ]}
              >
                <LinearGradient
                  colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.centerCircle}
                >
                  <Text style={styles.centerIcon}>{tab.icon}</Text>
                </LinearGradient>
              </Pressable>
            );
          }

          const isActive = activeTab === tab.name;

          return (
            <Pressable
              key={idx}
              onPress={() => onPressTab(tab.route)}
              style={styles.tabItem}
            >
              <Text style={[styles.tabIcon, isActive && styles.tabIconActive]}>
                {tab.icon}
              </Text>
              <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                {tab.name}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  navBarContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(15, 15, 18, 0.85)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
    paddingTop: 10,
    zIndex: 900,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(24px)',
      },
    }),
  },
  innerBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    width: '100%',
    position: 'relative',
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '18%',
    paddingVertical: 4,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.4,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    color: '#60646C',
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  centerButtonWrapper: {
    top: -24,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  pressedCenter: {
    transform: [{ scale: 0.9 }],
  },
  centerCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  centerIcon: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },
});
