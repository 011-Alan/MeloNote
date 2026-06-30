import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

const MiniTrebleClef = () => (
  <Svg viewBox="0 0 100 150" width={22} height={33}>
    <Path
      d="M35 135 C35 145, 50 145, 50 135 C50 120, 38 115, 30 110 C20 102, 15 90, 15 75 C15 45, 40 20, 50 5 C52 2, 55 2, 55 5 L55 125 C55 135, 62 140, 70 140 C80 140, 85 130, 85 120 C85 105, 72 98, 65 98 C60 98, 55 100, 55 105 C55 110, 58 112, 60 112 C62 112, 65 110, 65 106 C65 103, 62 101, 58 101 L58 55 C65 65, 75 75, 75 88 C75 102, 65 115, 52 118 L52 35 C42 45, 30 60, 30 78 C30 92, 38 102, 45 108 C48 110, 52 112, 52 115 L52 128 C45 128, 35 125, 35 135 Z"
      fill="url(#miniClefGrad)"
    />
    <Defs>
      <SvgGradient id="miniClefGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A00" />
        <Stop offset="100%" stopColor="#7B61FF" />
      </SvgGradient>
    </Defs>
  </Svg>
);

interface NavItem {
  icon: string;
  name: string;
  route: string;
  isComingSoon?: boolean;
}

interface SidebarNavProps {
  activeTab: string;
  onNavigate: (route: string, tabName: string) => void;
  onClose: () => void;
}

export function SidebarNav({ activeTab, onNavigate, onClose }: SidebarNavProps) {
  const navItems: NavItem[] = [
    { icon: '🏠', name: 'Home', route: '/' },
    { icon: '🎼', name: 'Compose', route: '/create' },
    { icon: '🎤', name: 'Record', route: '/record' },
    { icon: '📄', name: 'Scan Sheet', route: '/scan' },
    { icon: '📂', name: 'Projects', route: '/projects' },
  ];

  return (
    <View style={styles.sidebarContainer}>
      <LinearGradient
        colors={['#0F0F12', '#0A0A0C']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <MiniTrebleClef />
            <View style={styles.logoTextWrapper}>
              <Text style={styles.logoTitle}>MeloNote</Text>
              <Text style={styles.logoSubtitle}>AI Music Workspace</Text>
            </View>
          </View>
          
          <View style={styles.greetingBox}>
            <Text style={styles.greetingTitle}>Good Evening</Text>
            <Text style={styles.greetingSub}>Ready to create some music?</Text>
          </View>
        </View>

        {/* Navigation Items */}
        <View style={styles.menuList}>
          {navItems.map((item, idx) => {
            const isActive = activeTab === item.name;

            return (
              <Pressable
                key={idx}
                disabled={item.isComingSoon}
                onPress={() => {
                  onNavigate(item.route, item.name);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.menuItem,
                  isActive && styles.menuItemActive,
                  pressed && styles.pressed,
                ]}
              >
                {/* Glowing Gradient Active Line */}
                {isActive && (
                  <LinearGradient
                    colors={['#FF8A00', '#FF4FA3', '#7B61FF']}
                    style={styles.activeLineGlow}
                  />
                )}

                <Text style={styles.menuIcon}>{item.icon}</Text>
                <Text style={[styles.menuLabel, isActive && styles.menuLabelActive]}>
                  {item.name}
                </Text>

                {item.isComingSoon && (
                  <View style={styles.comingSoonBadge}>
                    <Text style={styles.comingSoonText}>SOON</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Fixed Bottom Section */}
      <View style={styles.bottomSection}>
        <View style={styles.divider} />
        
        <Pressable
          onPress={() => onNavigate('/settings', 'Settings')}
          style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
        >
          <Text style={styles.bottomIcon}>⚙️</Text>
          <Text style={styles.bottomLabel}>Settings</Text>
        </Pressable>



        <View style={styles.aboutBox}>
          <Text style={styles.aboutText}>MeloNote Mobile Workspace v1.2</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebarContainer: {
    width: 280,
    height: '100%',
    backgroundColor: '#0F0F12',
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    shadowColor: '#000000',
    shadowOffset: { width: 10, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    overflow: 'hidden',
    position: 'relative',
    ...Platform.select({
      web: {
        backdropFilter: 'blur(30px)',
      },
    }),
  },
  scrollContent: {
    paddingTop: 40,
    paddingBottom: 160, // Clear bottom section
  },
  header: {
    paddingHorizontal: 24,
    marginBottom: 32,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoTextWrapper: {
    justifyContent: 'center',
  },
  logoTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: -0.5,
    fontFamily: Platform.OS === 'web' ? 'var(--font-rounded)' : 'System',
  },
  logoSubtitle: {
    color: '#7B61FF',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 1,
  },
  greetingBox: {
    marginTop: 24,
    gap: 4,
  },
  greetingTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  greetingSub: {
    color: '#60646C',
    fontSize: 12,
    fontWeight: '500',
  },
  menuList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    position: 'relative',
    ...Platform.select({
      web: {
        transition: 'background-color 0.2s ease',
        cursor: 'pointer',
        ':hover': {
          backgroundColor: 'rgba(255, 255, 255, 0.03)',
        },
      },
    }),
  },
  menuItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  activeLineGlow: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    width: 3.5,
    borderRadius: 2,
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 2, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  menuIcon: {
    fontSize: 18,
    marginRight: 14,
  },
  menuLabel: {
    color: '#8E929A',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  menuLabelActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  comingSoonBadge: {
    backgroundColor: 'rgba(255, 138, 0, 0.1)',
    paddingVertical: 3,
    paddingHorizontal: 6,
    borderRadius: 6,
  },
  comingSoonText: {
    color: '#FF8A00',
    fontSize: 8,
    fontWeight: 'bold',
  },
  bottomSection: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingBottom: 24,
    backgroundColor: '#0F0F12',
    gap: 12,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    width: '100%',
    marginBottom: 8,
  },
  bottomItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  bottomIcon: {
    fontSize: 16,
    marginRight: 14,
  },
  bottomLabel: {
    color: '#8E929A',
    fontSize: 14,
    fontWeight: '600',
  },
  aboutBox: {
    marginTop: 8,
    alignItems: 'center',
  },
  aboutText: {
    color: '#40444C',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
