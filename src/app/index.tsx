import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

// Import mobile home screen components
import { MobileHero } from '@/components/mobile/MobileHero';
import { PrimaryActions } from '@/components/mobile/PrimaryActions';
import { QuickActions } from '@/components/mobile/QuickActions';
import { RecentProjects } from '@/components/mobile/RecentProjects';
import { FeatureHighlights } from '@/components/mobile/FeatureHighlights';
import { FutureLearning } from '@/components/mobile/FutureLearning';

export default function HomeScreen() {
  const router = useRouter();

  const handlePressAction = (route: string) => {
    router.push(route as any);
  };

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <MobileHero />
        
        <PrimaryActions onPressAction={handlePressAction} />
        
        <QuickActions onPressAction={handlePressAction} />
        
        <RecentProjects onContinueProject={(id) => handlePressAction('/create')} />
        
        <FeatureHighlights />
        
        <FutureLearning />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050507',
  },
  scrollContent: {
    paddingBottom: 40,
  },
});