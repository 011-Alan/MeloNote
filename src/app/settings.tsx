import React from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Import design system components
import { GradientBackground, GlassCard } from '@/components/ui/DesignSystem';

interface SettingRowProps {
  icon: string;
  title: string;
  value?: string;
  showChevron?: boolean;
}

function SettingRow({ icon, title, value, showChevron = true }: SettingRowProps) {
  return (
    <Pressable style={({ pressed }) => [styles.settingRow, pressed && styles.rowPressed]}>
      <View style={styles.settingRowLeft}>
        <View style={styles.settingIconCircle}>
          <Ionicons name={icon as any} size={20} color="#FF4FA3" />
        </View>
        <Text style={styles.settingTitle}>{title}</Text>
      </View>
      <View style={styles.settingRowRight}>
        {value && <Text style={styles.settingValue}>{value}</Text>}
        {showChevron && <Ionicons name="chevron-forward" size={16} color="#8E929A" />}
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  return (
    <GradientBackground>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Profile Header Card */}
        <GlassCard style={styles.profileCard}>
          <View style={styles.profileAvatarCircle}>
            <Text style={styles.profileAvatarText}>A</Text>
            <View style={styles.onlineIndicator} />
          </View>
          <View style={styles.profileDetails}>
            <Text style={styles.profileName}>Alan Jackson</Text>
            <Text style={styles.profileEmail}>alanjackson@workspace.ai</Text>
          </View>
          
          <View style={styles.profileStatsDivider} />
          
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>12</Text>
              <Text style={styles.statLabel}>Projects</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>3</Text>
              <Text style={styles.statLabel}>Workspaces</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>Pro</Text>
              <Text style={styles.statLabel}>Tier Plan</Text>
            </View>
          </View>
        </GlassCard>

        {/* Workspace settings group */}
        <Text style={styles.groupTitle}>WORKSPACE CONFIG</Text>
        <GlassCard style={styles.settingsGroupCard}>
          <SettingRow icon="musical-notes-outline" title="Transcription Engine" value="MeloNet v4.2 AI" />
          <View style={styles.innerDivider} />
          <SettingRow icon="options-outline" title="Default Export Format" value="MusicXML (Editable)" />
          <View style={styles.innerDivider} />
          <SettingRow icon="volume-high-outline" title="Synthesizer Soundfont" value="FluidR3 GM" />
        </GlassCard>

        {/* Account preferences group */}
        <Text style={styles.groupTitle}>ACCOUNT & PREFERENCES</Text>
        <GlassCard style={styles.settingsGroupCard}>
          <SettingRow icon="color-palette-outline" title="Theme Mode" value="Dark Glass" />
          <View style={styles.innerDivider} />
          <SettingRow icon="notifications-outline" title="Notifications" />
          <View style={styles.innerDivider} />
          <SettingRow icon="shield-checkmark-outline" title="Security & API Keys" />
        </GlassCard>

        {/* App details bottom notice */}
        <View style={styles.appDetailsFooter}>
          <Ionicons name="sparkles" size={16} color="#FF8A00" />
          <Text style={styles.footerText}>Powered by MeloNote Advanced Audio AI</Text>
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 40,
    gap: 16,
  },
  profileCard: {
    alignItems: 'center',
    gap: 14,
    paddingVertical: 24,
  },
  profileAvatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 79, 163, 0.1)',
    borderWidth: 2,
    borderColor: '#FF4FA3',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#FF4FA3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#00E676',
    borderWidth: 2,
    borderColor: '#0F0F12',
  },
  profileDetails: {
    alignItems: 'center',
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  profileEmail: {
    color: '#8E929A',
    fontSize: 13,
    marginTop: 4,
  },
  profileStatsDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    width: '100%',
    marginVertical: 4,
  },
  statsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-around',
  },
  statBox: {
    alignItems: 'center',
    gap: 4,
  },
  statNumber: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: '#8E929A',
    fontSize: 12,
  },
  groupTitle: {
    color: '#8E929A',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginTop: 10,
    marginLeft: 4,
  },
  settingsGroupCard: {
    padding: 6,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  rowPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  settingRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 79, 163, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  settingRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingValue: {
    color: '#FF8A00',
    fontSize: 13,
    fontWeight: '600',
  },
  innerDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    marginHorizontal: 12,
  },
  appDetailsFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    opacity: 0.6,
  },
  footerText: {
    color: '#8E929A',
    fontSize: 12,
    fontWeight: '600',
  },
});
