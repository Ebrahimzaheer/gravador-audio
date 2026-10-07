import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
  Slot,
} from 'expo-router';

import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

import {
  ThemeProviderCustom,
  useAppTheme,
} from '@/context/ThemeContext';

SplashScreen.preventAutoHideAsync();

function AppContent() {
  const { isDarkMode } = useAppTheme();

  return (
    <ThemeProvider
      value={isDarkMode ? DarkTheme : DefaultTheme}
    >
      <AnimatedSplashOverlay />
      <Slot />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProviderCustom>
      <AppContent />
    </ThemeProviderCustom>
  );
}