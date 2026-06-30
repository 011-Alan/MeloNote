import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Platform } from 'react-native';
import Svg, { Line, Circle, Path } from 'react-native-svg';

interface Project {
  id: string;
  name: string;
  editedDate: string;
  notesCount: number;
}

const mockProjects: Project[] = [
  { id: '1', name: 'Moonlight Sonata', editedDate: '2 hours ago', notesCount: 42 },
  { id: '2', name: 'Synth Wave Melody', editedDate: 'Yesterday', notesCount: 88 },
  { id: '3', name: 'Jazz Improvisation', editedDate: '3 days ago', notesCount: 104 },
  { id: '4', name: 'Classical Prelude', editedDate: '1 week ago', notesCount: 56 },
];

const SheetMusicThumbnail = ({ colors }: { colors: string[] }) => (
  <View style={styles.thumbnailContainer}>
    <Svg width="100%" height="100%" viewBox="0 0 100 50">
      {/* Staff lines */}
      {[5, 13, 21, 29, 37].map((y) => (
        <Line key={y} x1={5} y1={y} x2={95} y2={y} stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
      ))}
      
      {/* Custom notes */}
      <Circle cx={25} cy={21} r={3} fill={colors[0]} />
      <Line x1={28} y1={21} x2={28} y2={9} stroke={colors[0]} strokeWidth={1} />

      <Circle cx={45} cy={13} r={3} fill={colors[1]} />
      <Line x1={48} y1={13} x2={48} y2={1} stroke={colors[1]} strokeWidth={1} />

      <Circle cx={65} cy={29} r={3} fill={colors[2]} />
      <Line x1={68} y1={29} x2={68} y2={17} stroke={colors[2]} strokeWidth={1} />
    </Svg>
  </View>
);

interface RecentProjectsProps {
  onContinueProject: (projectId: string) => void;
}

export function RecentProjects({ onContinueProject }: RecentProjectsProps) {
  const gradientSets = [
    ['#FF8A00', '#FF4FA3', '#7B61FF'],
    ['#FF4FA3', '#7B61FF', '#FF8A00'],
    ['#7B61FF', '#FF8A00', '#FF4FA3'],
    ['#FF8A00', '#FF4FA3', '#7B61FF'],
  ];

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Recent Projects</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {mockProjects.map((project, idx) => (
          <View key={project.id} style={styles.card}>
            <Text style={styles.projectName} numberOfLines={1}>
              {project.name}
            </Text>
            <Text style={styles.editedDate}>{project.editedDate}</Text>

            <SheetMusicThumbnail colors={gradientSets[idx % gradientSets.length]} />

            <View style={styles.cardFooter}>
              <Text style={styles.notesLabel}>{project.notesCount} notes</Text>
              <Pressable
                onPress={() => onContinueProject(project.id)}
                style={({ pressed }) => [
                  styles.continueButton,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.continueText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginTop: 32,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    paddingHorizontal: 20,
    marginBottom: 16,
    letterSpacing: 0.3,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  scrollContainer: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 8,
  },
  card: {
    width: 200,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(20px)',
        transition: 'transform 0.2s ease, border-color 0.2s ease',
        ':hover': {
          transform: 'translateY(-2px)',
          borderColor: 'rgba(255, 255, 255, 0.12)',
        },
      },
    }),
  },
  projectName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
    fontFamily: Platform.OS === 'web' ? 'var(--font-display)' : 'System',
  },
  editedDate: {
    color: '#60646C',
    fontSize: 11,
    marginBottom: 12,
    fontWeight: '600',
  },
  thumbnailContainer: {
    height: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  notesLabel: {
    color: '#B0B4BA',
    fontSize: 12,
  },
  continueButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    ...Platform.select({
      web: {
        cursor: 'pointer',
      },
    }),
  },
  pressed: {
    opacity: 0.7,
    transform: [{ scale: 0.95 }],
  },
  continueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
});
