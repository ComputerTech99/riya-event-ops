import { Ionicons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DataProvider } from '../data/store';
import { useTheme } from '../theme';

export default function Root() {
  const t = useTheme();
  // Bundled from assets/fonts (not node_modules) so the hosted paths stay simple.
  const [loaded, fontError] = useFonts({
    ...Ionicons.font,
    PlusJakartaSans_400Regular: require('../../assets/fonts/PlusJakartaSans_400Regular.ttf'),
    PlusJakartaSans_500Medium: require('../../assets/fonts/PlusJakartaSans_500Medium.ttf'),
    PlusJakartaSans_600SemiBold: require('../../assets/fonts/PlusJakartaSans_600SemiBold.ttf'),
    PlusJakartaSans_700Bold: require('../../assets/fonts/PlusJakartaSans_700Bold.ttf'),
    PlusJakartaSans_800ExtraBold: require('../../assets/fonts/PlusJakartaSans_800ExtraBold.ttf'),
  });

  useEffect(() => {
    if (Platform.OS === 'web') {
      document.body.style.backgroundColor = t.bg;
      document.documentElement.style.colorScheme = t.mode;
    }
  }, [t]);

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <StatusBar style={t.mode === 'dark' ? 'light' : 'dark'} />
        {loaded || fontError ? (
          <DataProvider>
            <Slot />
          </DataProvider>
        ) : null}
      </View>
    </SafeAreaProvider>
  );
}
