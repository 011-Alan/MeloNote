import React from 'react';
import { View, Text, StyleSheet, Pressable, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Defs, LinearGradient as SvgGradient, Stop, Ellipse } from 'react-native-svg';
import { useSettings } from '@/context/SettingsContext';
import { useOnboarding } from '@/context/OnboardingContext';

const MeloLogo = () => (
  <Svg viewBox="0 0 120 120" width={32} height={32}>
    <Defs>
      <SvgGradient id="logoMGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <Stop offset="0%" stopColor="#FF8A00" />
        <Stop offset="50%" stopColor="#FF4FA3" />
        <Stop offset="100%" stopColor="#7B61FF" />
      </SvgGradient>
    </Defs>
    {/* Noteheads (side notes are long, middle is higher) */}
    <Ellipse cx="25" cy="90" rx="9" ry="6" fill="url(#logoMGrad)" transform="rotate(-15, 25, 90)" />
    <Ellipse cx="60" cy="65" rx="9" ry="6" fill="url(#logoMGrad)" transform="rotate(-15, 60, 65)" />
    <Ellipse cx="95" cy="90" rx="9" ry="6" fill="url(#logoMGrad)" transform="rotate(-15, 95, 90)" />

    {/* Stems */}
    <Path
      d="M 31 90 L 31 30 M 66 65 L 66 30 M 101 90 L 101 30"
      stroke="url(#logoMGrad)"
      strokeWidth="4"
      strokeLinecap="round"
    />

    {/* Flat Connecting Beam */}
    <Path
      d="M 31 30 L 101 30"
      fill="none"
      stroke="url(#logoMGrad)"
      strokeWidth="9"
      strokeLinecap="round"
    />
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
  const { theme } = useSettings();
  const { userName } = useOnboarding();
  const isDark = theme === 'dark';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  const bgColors = isDark ? ['#0F0F12', '#0A0A0C'] : ['#FFFFFF', '#F5F5F7'];
  const sidebarBorderColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.08)';
  const logoTitleColor = isDark ? '#FFFFFF' : '#121212';
  const greetingTitleColor = isDark ? '#FFFFFF' : '#121212';
  const greetingSubColor = isDark ? '#60646C' : '#555555';
  const menuItemActiveBg = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)';
  const menuLabelColor = isDark ? '#8E929A' : '#555555';
  const menuLabelActiveColor = isDark ? '#FFFFFF' : '#121212';
  const dividerColor = isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.08)';
  const bottomBg = isDark ? '#0F0F12' : '#FFFFFF';
  const bottomLabelColor = isDark ? '#8E929A' : '#555555';
  const aboutTextColor = isDark ? '#40444C' : '#888888';

  const navItems: NavItem[] = [
    { icon: '🏠', name: 'Home', route: '/' },
    { icon: '✍️', name: 'Compose', route: '/create' },
    { icon: '🎤', name: 'Record', route: '/record' },
    { icon: '📄', name: 'Scan Sheet', route: '/scan' },
    { icon: '📂', name: 'Projects', route: '/projects' },
    { icon: '🎼', name: 'Music Basics', route: '/basics' },
  ];

  return (
    <View style={[styles.sidebarContainer, { backgroundColor: isDark ? '#0F0F12' : '#FFFFFF', borderColor: sidebarBorderColor }]}>
      <LinearGradient
        colors={bgColors as any}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.logoRow}>
            <MeloLogo />
            <View style={styles.logoTextWrapper}>
              <Text style={[styles.logoTitle, { color: logoTitleColor }]}>MeloNote</Text>
              <Text style={styles.logoSubtitle}>AI Music Workspace</Text>
            </View>
          </View>
          
          <View style={styles.greetingBox}>
            <Text style={[styles.greetingTitle, { color: greetingTitleColor }]}>
              {getGreeting()}{userName ? `, ${userName}` : ''}
            </Text>
            <Text style={[styles.greetingSub, { color: greetingSubColor }]}>Ready to create some music?</Text>
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
                  isActive && { backgroundColor: menuItemActiveBg },
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
                <Text style={[styles.menuLabel, { color: isActive ? menuLabelActiveColor : menuLabelColor }, isActive && styles.menuLabelActive]}>
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
      <View style={[styles.bottomSection, { backgroundColor: bottomBg }]}>
        <View style={[styles.divider, { backgroundColor: dividerColor }]} />
        
        <Pressable
          onPress={() => {
            onNavigate('/settings', 'Settings');
            onClose();
          }}
          style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
        >
          <Text style={styles.bottomIcon}>⚙️</Text>
          <Text style={[styles.bottomLabel, { color: bottomLabelColor }]}>Settings</Text>
        </Pressable>
        
        <Text style={{ fontSize: 10, color: aboutTextColor, textAlign: 'center', marginTop: 10, opacity: 0.8 }}>
          © MeloNote 2026. All rights reserved.
        </Text>
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
