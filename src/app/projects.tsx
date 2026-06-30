import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Alert, Platform, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Paths, Directory, File } from 'expo-file-system';
import Svg, { Line, Path, Rect } from 'react-native-svg';

// Import CreateScreen detail view
import CreateScreen from './create';

// Import design system
import { GradientBackground, GlassCard, EmptyState, PrimaryButton } from '@/components/ui/DesignSystem';

type Project = {
  id: string;
  name: string;
  date: string;
  recordingURI: string;
  convertedNotes: any;
  musicXML: string;
  timeSignature: string;
  detectedTempo: number;
  qualityScores?: any;
  duration: number;
  audioSize: number;
  sourceType?: 'manual' | 'transcribed';
  manualScoreState?: any;
};

let lastActiveProjectState: any = null;

const MiniStaffThumbnail = () => (
  <View style={styles.thumbnailContainer}>
    <Svg viewBox="0 0 50 50" width={44} height={44}>
      <Line x1="5" y1="12" x2="45" y2="12" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <Line x1="5" y1="18" x2="45" y2="18" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <Line x1="5" y1="24" x2="45" y2="24" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <Line x1="5" y1="30" x2="45" y2="30" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <Line x1="5" y1="36" x2="45" y2="36" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
      <Path d="M12,8 Q18,22 12,38" fill="none" stroke="#FF4FA3" strokeWidth="1.5" />
      <Rect x="24" y="16" width="10" height="8" rx="2" fill="#7B61FF" />
      <Line x1="34" y1="20" x2="34" y2="10" stroke="#7B61FF" strokeWidth="1.5" />
    </Svg>
  </View>
);

export default function ProjectsScreen() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeProject, setActiveProject] = useState<Project | null>(null);
  
  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [filterType, setFilterType] = useState<'all' | 'transcribed' | 'manual'>('all');

  useEffect(() => {
    if (lastActiveProjectState) {
      setActiveProject(lastActiveProjectState.activeProject);
    }
  }, []);

  useEffect(() => {
    if (activeProject) {
      lastActiveProjectState = { activeProject };
    } else {
      lastActiveProjectState = null;
    }
  }, [activeProject]);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setIsLoading(true);
      if (Platform.OS === 'web') {
        const loadedProjects: Project[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('melo_project_')) {
            try {
              const projectJson = localStorage.getItem(key);
              if (projectJson) {
                loadedProjects.push(JSON.parse(projectJson));
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
        loadedProjects.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setProjects(loadedProjects);
      } else {
        const projectsDir = new Directory(Paths.document, 'projects');
        if (!projectsDir.exists) {
          Paths.document.createDirectory('projects');
        }
        const entries = projectsDir.list();
        const loadedProjects: Project[] = [];
        for (const entry of entries) {
          if (entry instanceof File && entry.name.endsWith('.json')) {
            const content = await entry.text();
            loadedProjects.push(JSON.parse(content));
          }
        }
        loadedProjects.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        setProjects(loadedProjects);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load projects');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenProject = (project: Project) => {
    setActiveProject(project);
  };

  const handleCloseProject = () => {
    setActiveProject(null);
    lastActiveProjectState = null;
    loadProjects();
  };

  const handleDeleteProject = (project: Project) => {
    const performDelete = async () => {
      try {
        if (Platform.OS === 'web') {
          localStorage.removeItem('melo_project_' + project.id);
          loadProjects();
          return;
        }
        const file = new File(Paths.document, 'projects', `${project.id}.json`);
        if (file.exists) {
          file.delete();
        }
        loadProjects();
      } catch (err) {
        console.error('Error deleting project:', err);
        Alert.alert('Error', 'Failed to delete project.');
      }
    };

    if (Platform.OS === 'web') {
      const confirmDelete = window.confirm(`Are you sure you want to delete "${project.name}"?`);
      if (confirmDelete) performDelete();
    } else {
      Alert.alert(
        'Delete Project',
        `Are you sure you want to delete "${project.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: performDelete },
        ]
      );
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatDate = (dateString: string) => {
    const d = new Date(dateString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Filter & Sort math
  const processedProjects = useMemo(() => {
    let result = [...projects];
    
    // Search
    if (searchQuery.trim()) {
      result = result.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }
    
    // Filter type
    if (filterType !== 'all') {
      result = result.filter(p => p.sourceType === filterType);
    }
    
    // Sort
    result.sort((a, b) => {
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
    
    return result;
  }, [projects, searchQuery, sortBy, filterType]);

  const toggleSort = () => {
    setSortBy(prev => (prev === 'date' ? 'name' : 'date'));
  };

  const toggleFilter = () => {
    setFilterType(prev => {
      if (prev === 'all') return 'transcribed';
      if (prev === 'transcribed') return 'manual';
      return 'all';
    });
  };

  if (activeProject) {
    return (
      <CreateScreen
        sheetMusicId="projects-sheet-music-iframe"
        initialProjectId={activeProject.id}
        initialNotes={activeProject.convertedNotes}
        initialTimeSignature={activeProject.timeSignature}
        initialTempo={activeProject.detectedTempo}
        initialMusicXML={activeProject.musicXML}
        initialSourceType={activeProject.sourceType}
        defaultEditMode={false}
        measuresPerSystem={4}
        initialTitle={activeProject.name}
        onExit={handleCloseProject}
      />
    );
  }

  return (
    <GradientBackground>
      <View style={styles.container}>
        
        {/* Search bar & filter controls */}
        <View style={styles.controlsRow}>
          <GlassCard style={styles.searchBarWrapper}>
            <Ionicons name="search-outline" size={18} color="#8E929A" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search workspaces..."
              placeholderTextColor="#8E929A"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={16} color="#8E929A" />
              </Pressable>
            )}
          </GlassCard>

          <Pressable onPress={toggleFilter} style={styles.iconBtn}>
            <Ionicons 
              name={filterType === 'all' ? 'funnel-outline' : 'funnel'} 
              size={18} 
              color={filterType === 'all' ? '#FFFFFF' : '#FF4FA3'} 
            />
          </Pressable>

          <Pressable onPress={toggleSort} style={styles.iconBtn}>
            <Ionicons 
              name={sortBy === 'date' ? 'calendar-outline' : 'text-outline'} 
              size={18} 
              color="#FFFFFF" 
            />
          </Pressable>
        </View>

        {/* Filter Indicator Badge */}
        {filterType !== 'all' && (
          <View style={styles.activeFilterBadge}>
            <Text style={styles.activeFilterText}>
              Filtering: {filterType === 'transcribed' ? '🎤 Transcribed' : '✏️ Manual'}
            </Text>
            <Pressable onPress={() => setFilterType('all')}>
              <Ionicons name="close-circle-sharp" size={14} color="#FF4FA3" />
            </Pressable>
          </View>
        )}

        {/* Projects content */}
        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#FF4FA3" />
          </View>
        ) : processedProjects.length === 0 ? (
          <ScrollView contentContainerStyle={styles.emptyScroll} showsVerticalScrollIndicator={false}>
            <EmptyState
              title={searchQuery ? 'No matching workspaces' : 'No sheet music workspace yet'}
              description={
                searchQuery
                  ? 'Try checking the spelling or adjusting filter keywords.'
                  : 'Start recording audio or scan scores to build your digital notation workspace!'
              }
              icon="folder-open-outline"
            />
            {!searchQuery && (
              <PrimaryButton
                title="Start Transcription"
                onPress={() => router.push('/record')}
                icon="mic-outline"
                style={styles.emptyActionBtn}
              />
            )}
          </ScrollView>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollList}>
            <View style={styles.cardsGrid}>
              {processedProjects.map((project) => {
                const overallScore = project.qualityScores?.overall_score;
                return (
                  <Pressable key={project.id} onPress={() => handleOpenProject(project)}>
                    <GlassCard style={styles.projectCard}>
                      {/* Left: Thumbnail staff representation */}
                      <MiniStaffThumbnail />

                      {/* Center: Details */}
                      <View style={styles.projectInfo}>
                        <Text numberOfLines={1} style={styles.projectTitle}>
                          {project.name}
                        </Text>
                        <View style={styles.projectRowMeta}>
                          <Text style={[
                            styles.projectSourceType, 
                            { color: project.sourceType === 'manual' ? '#FF8A00' : '#00E676' }
                          ]}>
                            {project.sourceType === 'manual' ? '✏️ Compose' : '🎤 Transcribed'}
                          </Text>
                          <Text style={styles.projectDot}>•</Text>
                          <Text style={styles.projectDate}>{formatDate(project.date)}</Text>
                        </View>

                        {/* Technical tags */}
                        <View style={styles.tagsContainer}>
                          <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>{formatDuration(project.duration || 0)}</Text>
                          </View>
                          <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>{Math.round(project.detectedTempo || 120)} BPM</Text>
                          </View>
                          <View style={styles.metaBadge}>
                            <Text style={styles.metaBadgeText}>{project.timeSignature || '4/4'}</Text>
                          </View>
                          {overallScore !== undefined && (
                            <View style={styles.qualityBadge}>
                              <Text style={styles.qualityBadgeText}>{overallScore.toFixed(0)}% OMR</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Right: Continue / Delete */}
                      <View style={styles.projectActions}>
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation();
                            handleDeleteProject(project);
                          }}
                          style={styles.deleteBtn}
                        >
                          <Ionicons name="trash-outline" size={18} color="#FF3B30" />
                        </Pressable>
                        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.2)" />
                      </View>
                    </GlassCard>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchBarWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 12,
    height: 48,
    borderRadius: 16,
  },
  searchIcon: {
    marginRight: 6,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(45, 45, 45, 0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeFilterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 79, 163, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 79, 163, 0.15)',
  },
  activeFilterText: {
    color: '#FF4FA3',
    fontSize: 12,
    fontWeight: '700',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyActionBtn: {
    marginHorizontal: 40,
    marginTop: -10,
    marginBottom: 40,
  },
  scrollList: {
    paddingBottom: 40,
  },
  cardsGrid: {
    gap: 12,
  },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  thumbnailContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  projectInfo: {
    flex: 1,
    gap: 4,
  },
  projectTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  projectRowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  projectSourceType: {
    fontSize: 12,
    fontWeight: '700',
  },
  projectDot: {
    color: 'rgba(255,255,255,0.15)',
    fontSize: 10,
  },
  projectDate: {
    color: '#8E929A',
    fontSize: 12,
    fontWeight: '500',
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  metaBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  metaBadgeText: {
    color: '#B0B4BA',
    fontSize: 10,
    fontWeight: '700',
  },
  qualityBadge: {
    backgroundColor: 'rgba(255, 138, 0, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 138, 0, 0.15)',
  },
  qualityBadgeText: {
    color: '#FF8A00',
    fontSize: 10,
    fontWeight: '800',
  },
  projectActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
