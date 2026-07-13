import React from 'react';
import { StyleSheet, View, Text, ScrollView, ViewStyle, TextStyle } from 'react-native';
import Svg, { Line, Path, Rect, Circle, Ellipse, Text as SvgText, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useSettings } from '@/context/SettingsContext';
import { GradientBackground, GlassCard } from '@/components/ui/DesignSystem';

// =============================================================================
// Clean, Vector SVG Components for each card (themed dynamically)
// =============================================================================

interface SVGProps {
  color: string;
}

const IntroIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <Path d="M20,15 L70,15 C75,15 80,19 80,24 L80,64 C80,69 75,73 70,73 L20,73 L20,15 Z" fill="none" stroke={color} strokeWidth="3" />
    <Line x1="20" y1="15" x2="20" y2="73" stroke="#FF4FA3" strokeWidth="4" strokeLinecap="round" />
    <Line x1="32" y1="28" x2="68" y2="28" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.3" />
    <Line x1="32" y1="40" x2="68" y2="40" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.3" />
    <Line x1="32" y1="52" x2="56" y2="52" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.3" />
    <Path d="M72,42 C72,36 82,36 82,42 C82,50 68,52 68,60 C68,64 74,68 82,68" fill="none" stroke="#7B61FF" strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

const StaffIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 5 }).map((_, i) => {
      const y = 20 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="2" />;
    })}
    <Line x1="10" y1="20" x2="10" y2="60" stroke={color} strokeWidth="2" />
    <Line x1="90" y1="20" x2="90" y2="60" stroke={color} strokeWidth="2" />
  </Svg>
);

const TrebleClefIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <SvgText x="50" y="60" fill="#FF4FA3" fontSize="40" textAnchor="middle">𝄞</SvgText>
  </Svg>
);

const BassClefIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <SvgText x="50" y="56" fill="#7B61FF" fontSize="52" textAnchor="middle">𝄢</SvgText>
  </Svg>
);

const NotesIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {/* Whole note */}
    <Ellipse cx="20" cy="55" rx="8" ry="5.5" fill="none" stroke={color} strokeWidth="3" transform="rotate(-15, 20, 55)" />
    {/* Half note */}
    <Ellipse cx="45" cy="55" rx="7" ry="4.5" fill="none" stroke={color} strokeWidth="2.5" transform="rotate(-15, 45, 55)" />
    <Line x1="51" y1="53" x2="51" y2="25" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    {/* Quarter note */}
    <Ellipse cx="75" cy="55" rx="7" ry="4.5" fill={color} transform="rotate(-15, 75, 55)" />
    <Line x1="81" y1="53" x2="81" y2="25" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    {/* Flag for 8th note */}
    <Path d="M81,25 C87,27 91,33 89,39" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
  </Svg>
);

const RestsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <SvgText x="20" y="55" fill={color} fontSize="42" textAnchor="middle">𝄼</SvgText>
    <SvgText x="50" y="55" fill={color} fontSize="42" textAnchor="middle">𝄽</SvgText>
    <SvgText x="80" y="55" fill={color} fontSize="42" textAnchor="middle">𝄾</SvgText>
  </Svg>
);

const TimeSignatureIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 5 }).map((_, i) => {
      const y = 20 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="1.5" opacity="0.4" />;
    })}
    <SvgText x="32" y="38" fill="#FF8A00" fontSize="22" fontWeight="900" textAnchor="middle">4</SvgText>
    <SvgText x="32" y="58" fill="#FF8A00" fontSize="22" fontWeight="900" textAnchor="middle">4</SvgText>
    <SvgText x="68" y="38" fill={color} fontSize="22" fontWeight="900" textAnchor="middle">3</SvgText>
    <SvgText x="68" y="58" fill={color} fontSize="22" fontWeight="900" textAnchor="middle">4</SvgText>
  </Svg>
);

const KeySignatureIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 5 }).map((_, i) => {
      const y = 20 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="1.5" opacity="0.4" />;
    })}
    {/* Sharp 1 */}
    <Path d="M30,15 L30,45 M36,12 L36,42 M26,22 L40,18 M26,32 L40,28" fill="none" stroke="#FF4FA3" strokeWidth="2" />
    {/* Sharp 2 */}
    <Path d="M48,25 L48,55 M54,22 L54,52 M44,32 L58,28 M44,42 L58,38" fill="none" stroke="#7B61FF" strokeWidth="2" />
  </Svg>
);

const AccidentalsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {/* Sharp */}
    <Path d="M22,15 L22,45 M28,12 L28,42 M18,22 L32,18 M18,32 L32,28" fill="none" stroke={color} strokeWidth="2.5" />
    {/* Flat */}
    <Path d="M50,15 L50,45 C50,45 58,40 58,34 C58,28 50,30 50,30" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
    {/* Natural */}
    <Path d="M76,15 L76,40 M82,20 L82,45 M76,28 L82,24 M76,36 L82,32" fill="none" stroke={color} strokeWidth="2.5" />
  </Svg>
);

const LedgerLinesIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 3 }).map((_, i) => {
      const y = 30 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="1.5" opacity="0.3" />;
    })}
    {/* Ledger lines below */}
    <Line x1="38" y1="60" x2="62" y2="60" stroke={color} strokeWidth="2.5" />
    <Ellipse cx="50" cy="60" rx="7.5" ry="5" fill={color} transform="rotate(-15, 50, 60)" />
    {/* Ledger lines above */}
    <Line x1="38" y1="15" x2="62" y2="15" stroke={color} strokeWidth="2.5" />
    <Ellipse cx="50" cy="15" rx="7.5" ry="5" fill="none" stroke={color} strokeWidth="2" transform="rotate(-15, 50, 15)" />
  </Svg>
);

const TiesIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <Ellipse cx="25" cy="45" rx="7.5" ry="5" fill={color} transform="rotate(-15, 25, 45)" />
    <Line x1="31" y1="43" x2="31" y2="15" stroke={color} strokeWidth="2" />
    
    <Ellipse cx="75" cy="45" rx="7.5" ry="5" fill={color} transform="rotate(-15, 75, 45)" />
    <Line x1="81" y1="43" x2="81" y2="15" stroke={color} strokeWidth="2" />
    
    {/* Tie arch */}
    <Path d="M28,48 C40,56 60,56 72,48" fill="none" stroke="#FF4FA3" strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

const BeamsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <Ellipse cx="25" cy="55" rx="7" ry="4.5" fill={color} transform="rotate(-15, 25, 55)" />
    <Line x1="31" y1="53" x2="31" y2="20" stroke={color} strokeWidth="2.5" />
    
    <Ellipse cx="75" cy="45" rx="7" ry="4.5" fill={color} transform="rotate(-15, 75, 45)" />
    <Line x1="81" y1="43" x2="81" y2="10" stroke={color} strokeWidth="2.5" />
    
    {/* Connecting beam */}
    <Path d="M30,20 L82,10 L82,17 L30,27 Z" fill="#7B61FF" />
  </Svg>
);

const ChordsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 5 }).map((_, i) => {
      const y = 20 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="1.5" opacity="0.4" />;
    })}
    <Ellipse cx="50" cy="50" rx="7" ry="4.5" fill={color} transform="rotate(-15, 50, 50)" />
    <Ellipse cx="50" cy="40" rx="7" ry="4.5" fill={color} transform="rotate(-15, 50, 40)" />
    <Ellipse cx="50" cy="30" rx="7" ry="4.5" fill={color} transform="rotate(-15, 50, 30)" />
    
    <Line x1="56" y1="48" x2="56" y2="15" stroke={color} strokeWidth="2.5" />
  </Svg>
);

const DynamicsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <SvgText x="32" y="55" fill="#FF4FA3" fontSize="52" textAnchor="middle">𝆏</SvgText>
    <SvgText x="68" y="55" fill="#7B61FF" fontSize="52" textAnchor="middle">𝆑</SvgText>
  </Svg>
);

const TempoIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {/* Metronome shape */}
    <Path d="M50,15 L32,65 L68,65 Z" fill="none" stroke={color} strokeWidth="2.5" />
    <Line x1="50" y1="20" x2="50" y2="65" stroke={color} strokeWidth="1.5" opacity="0.4" />
    {/* Pendulum */}
    <Line x1="50" y1="60" x2="62" y2="25" stroke="#FF8A00" strokeWidth="3" strokeLinecap="round" />
    <Circle cx="62" cy="25" r="4.5" fill="#FF8A00" />
  </Svg>
);

const RepeatSignsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 5 }).map((_, i) => {
      const y = 20 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="1.5" opacity="0.4" />;
    })}
    <Line x1="72" y1="20" x2="72" y2="60" stroke={color} strokeWidth="1.5" />
    <Line x1="78" y1="20" x2="78" y2="60" stroke={color} strokeWidth="4.5" strokeLinecap="round" />
    <Circle cx="62" cy="35" r="3" fill={color} />
    <Circle cx="62" cy="45" r="3" fill={color} />
  </Svg>
);

const CodaIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <Circle cx="50" cy="40" r="18" fill="none" stroke="#FF4FA3" strokeWidth="4" />
    <Line x1="50" y1="12" x2="50" y2="68" stroke="#FF4FA3" strokeWidth="4" strokeLinecap="round" />
    <Line x1="22" y1="40" x2="78" y2="40" stroke="#FF4FA3" strokeWidth="4" strokeLinecap="round" />
  </Svg>
);

const SegnoIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    <Path d="M38,55 C38,45 62,45 62,35 C62,25 46,25 46,30 L54,50 C54,55 38,55 38,55 Z" fill="none" stroke="#7B61FF" strokeWidth="4" strokeLinecap="round" />
    <Line x1="32" y1="58" x2="68" y2="22" stroke="#7B61FF" strokeWidth="4" strokeLinecap="round" />
    <Circle cx="41" cy="33" r="3" fill="#7B61FF" />
    <Circle cx="59" cy="47" r="3" fill="#7B61FF" />
  </Svg>
);

const CommonSymbolsIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {/* Fermata */}
    <Path d="M20,40 C20,25 40,25 40,40" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" />
    <Circle cx="30" cy="35" r="2.5" fill={color} />
    {/* Accent */}
    <Path d="M72,25 L88,32 L72,39" fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const GrandStaffIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {/* Treble staff */}
    <Line x1="30" y1="15" x2="90" y2="15" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="21" x2="90" y2="21" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="27" x2="90" y2="27" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="33" x2="90" y2="33" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="39" x2="90" y2="39" stroke={color} strokeWidth="1" opacity="0.5" />
    
    {/* Bass staff */}
    <Line x1="30" y1="49" x2="90" y2="49" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="55" x2="90" y2="55" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="61" x2="90" y2="61" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="67" x2="90" y2="67" stroke={color} strokeWidth="1" opacity="0.5" />
    <Line x1="30" y1="73" x2="90" y2="73" stroke={color} strokeWidth="1" opacity="0.5" />
    
    {/* Connector Barline & Curly Brace */}
    <Line x1="30" y1="15" x2="30" y2="73" stroke={color} strokeWidth="2.5" />
    <Path d="M28,12 C20,12 24,44 14,44 C24,44 20,76 28,76" fill="none" stroke="#FF4FA3" strokeWidth="3" strokeLinecap="round" />
  </Svg>
);

const MeasuresIcon: React.FC<SVGProps> = ({ color }) => (
  <Svg viewBox="0 0 100 80" width={100} height={80}>
    {Array.from({ length: 5 }).map((_, i) => {
      const y = 20 + i * 10;
      return <Line key={i} x1="10" y1={y} x2="90" y2={y} stroke={color} strokeWidth="1.5" opacity="0.4" />;
    })}
    <Line x1="10" y1="20" x2="10" y2="60" stroke={color} strokeWidth="1.5" />
    <Line x1="50" y1="20" x2="50" y2="60" stroke={color} strokeWidth="2" />
    <Line x1="90" y1="20" x2="90" y2="60" stroke={color} strokeWidth="3" />
  </Svg>
);

// =============================================================================
// Component Card Definition & Main Page Render
// =============================================================================

interface TopicItem {
  id: string;
  title: string;
  explanation: string;
  icon: React.FC<SVGProps>;
}

export default function MusicBasicsScreen() {
  const { theme } = useSettings();
  const isDark = theme === 'dark';
  
  const textColor = isDark ? '#FFFFFF' : '#121212';
  const subColor = isDark ? '#8E929A' : '#60646C';
  const cardBg = isDark ? 'rgba(30, 30, 35, 0.45)' : '#FFFFFF';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  const topics: TopicItem[] = [
    {
      id: 'intro',
      title: 'Introduction to Music Notation',
      explanation: 'Sheet music is a written language that records pitch (highness/lowness) and rhythm (timing) of notes. Musicians use it to preserve melodies, share compositions, and perform complex arrangements accurately.',
      icon: IntroIcon,
    },
    {
      id: 'staff',
      title: 'The Staff',
      explanation: 'The foundation of sheet music is the staff. It consists of 5 horizontal lines and 4 spaces. Notes are written directly on these lines or in the spaces. Higher positions represent higher pitches.',
      icon: StaffIcon,
    },
    {
      id: 'treble',
      title: 'Treble Clef',
      explanation: 'Also known as the G Clef. It defines pitches for high-range voices and instruments, such as the piano right hand, violin, flute, guitar, and soprano singers.',
      icon: TrebleClefIcon,
    },
    {
      id: 'bass',
      title: 'Bass Clef',
      explanation: 'Also known as the F Clef. It defines pitches for low-range voices and instruments, including the piano left hand, bass guitar, cello, trombone, and bass singers.',
      icon: BassClefIcon,
    },
    {
      id: 'grand-staff',
      title: 'Grand Staff',
      explanation: 'A combination of the Treble and Bass staffs connected by a curly brace. It provides a complete range of pitches commonly used for keyboards like the piano.',
      icon: GrandStaffIcon,
    },
    {
      id: 'notes',
      title: 'Musical Notes & Durations',
      explanation: 'Notes show pitch by vertical position and duration by their appearance. A Whole note lasts 4 beats, a Half note lasts 2 beats, a Quarter note lasts 1 beat, and an Eighth note lasts 1/2 beat.',
      icon: NotesIcon,
    },
    {
      id: 'rests',
      title: 'Musical Rests',
      explanation: 'Rests indicate periods of silence in music. Just like notes, they have standard shapes representing durations (Whole rest, Half rest, Quarter rest, Eighth rest).',
      icon: RestsIcon,
    },
    {
      id: 'measures',
      title: 'Measures & Barlines',
      explanation: 'Music is divided into small equal chunks called measures (or bars) using vertical barlines. This keeps the notation organized and makes it easy to follow the rhythm.',
      icon: MeasuresIcon,
    },
    {
      id: 'time-signature',
      title: 'Time Signatures',
      explanation: 'Found at the start of a piece. The top number (numerator) tells you how many beats are in each measure. The bottom number (denominator) tells you which note value equals one beat.',
      icon: TimeSignatureIcon,
    },
    {
      id: 'key-signature',
      title: 'Key Signatures',
      explanation: 'A collection of sharp (♯) or flat (♭) symbols placed after the clef. It tells you which notes should be played sharp or flat throughout the entire song, defining the musical key (major or minor).',
      icon: KeySignatureIcon,
    },
    {
      id: 'accidentals',
      title: 'Accidentals',
      explanation: 'Symbols placed before a note to modify its pitch temporarily for a single measure. A Sharp (♯) raises pitch, a Flat (♭) lowers it, and a Natural (♮) cancels any previous sharp or flat.',
      icon: AccidentalsIcon,
    },
    {
      id: 'ledger-lines',
      title: 'Ledger Lines',
      explanation: 'Short lines added above or below the staff to extend its range. They allow you to write notes that are too high or too low to fit within the standard five lines.',
      icon: LedgerLinesIcon,
    },
    {
      id: 'ties',
      title: 'Ties vs. Slurs',
      explanation: 'A tie is a curved line connecting two notes of the same pitch to merge their durations. A slur is a similar curved line connecting notes of different pitches to indicate smooth, legato playing.',
      icon: TiesIcon,
    },
    {
      id: 'beams',
      title: 'Beams',
      explanation: 'Horizontal bars connecting eighth, sixteenth, or shorter notes together. Beaming group notes visually to help read subdivisions of beats clearly.',
      icon: BeamsIcon,
    },
    {
      id: 'chords',
      title: 'Chords',
      explanation: 'Chords are created when multiple notes are stacked vertically on the staff. This indicates that the notes should be played simultaneously to create harmony.',
      icon: ChordsIcon,
    },
    {
      id: 'dynamics',
      title: 'Dynamics',
      explanation: 'Italian letters indicating how loudly or softly to play. For example: p (piano - soft), mp (mezzo-piano - moderately soft), mf (mezzo-forte - moderately loud), and f (forte - loud).',
      icon: DynamicsIcon,
    },
    {
      id: 'tempo',
      title: 'Tempo & BPM',
      explanation: 'Tempo is the speed of music, measured in Beats Per Minute (BPM). Classic terms include Largo (very slow), Andante (walking pace), Allegro (fast), and Presto (very fast).',
      icon: TempoIcon,
    },
    {
      id: 'repeat-signs',
      title: 'Repeat Signs',
      explanation: 'A double barline with two dots indicating that the musician should repeat a section of music. It helps save space on the sheet music by avoiding duplicate sections.',
      icon: RepeatSignsIcon,
    },
    {
      id: 'coda-segno',
      title: 'Coda & Segno',
      explanation: 'Structural symbols used to navigate jumps in the score. Segno (S-like symbol) acts as a roadmap marker to jump back to, while Coda (crosshair) indicates the final ending section.',
      icon: CodaIcon,
    },
    {
      id: 'common-symbols',
      title: 'Common Symbols',
      explanation: 'Expression marks: Fermata (hold the note longer than its value), Accent (play note with emphasis), Staccato (play note short and detached), Tenuto (play note full duration).',
      icon: CommonSymbolsIcon,
    },
  ];

  return (
    <GradientBackground>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: textColor }]}>Music Basics Guide</Text>
          <Text style={[styles.subtitle, { color: subColor }]}>
            Learn to read sheet music notation step-by-step. Everything you need to get started!
          </Text>
        </View>

        <View style={styles.cardsGrid}>
          {topics.map((topic) => {
            const IconComponent = topic.icon;
            return (
              <GlassCard key={topic.id} style={StyleSheet.flatten([styles.card, { backgroundColor: cardBg, borderColor: cardBorder }])}>
                <View style={styles.iconContainer}>
                  <IconComponent color={textColor} />
                </View>
                <View style={styles.cardContent}>
                  <Text style={[styles.cardTitle, { color: textColor }]}>{topic.title}</Text>
                  <Text style={[styles.cardExplanation, { color: subColor }]}>{topic.explanation}</Text>
                </View>
              </GlassCard>
            );
          })}
        </View>
      </ScrollView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 100,
    gap: 20,
  },
  header: {
    alignItems: 'center',
    textAlign: 'center',
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  cardsGrid: {
    flexDirection: 'column',
    gap: 16,
    width: '100%',
  },
  card: {
    padding: 16,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  iconContainer: {
    width: 100,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContent: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
  },
  cardExplanation: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
});
