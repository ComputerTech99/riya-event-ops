import { Platform, useColorScheme } from 'react-native';

/**
 * Calm, editorial dashboard: white page on a lavender canvas, black pills,
 * hairline dividers instead of boxes, colour only for meaning.
 * Dark mode inverts it. The system setting picks which one shows.
 */
export interface Theme {
  mode: 'light' | 'dark';
  /** Backdrop around the app panel on wide screens. */
  canvas: string;
  bg: string; surface: string; surface2: string; border: string;
  text: string; muted: string; faint: string;
  primary: string; onPrimary: string; primarySoft: string;
  /** Live call card. */
  hero: string; onHero: string; heroMuted: string; heroInset: string;
  green: string; greenSoft: string;
  amber: string; amberSoft: string;
  red: string; redSoft: string;
  chart: string; ring: string;
  shadow: object;
}

const light: Theme = {
  mode: 'light',
  canvas: '#ECE7F1',
  bg: '#FFFFFF', surface: '#FFFFFF', surface2: '#F4F4F6', border: '#ECECEF',
  text: '#111114', muted: '#6E6E78', faint: '#A9A9B2',
  primary: '#111114', onPrimary: '#FFFFFF', primarySoft: '#F4F4F6',
  hero: '#111114', onHero: '#FFFFFF', heroMuted: 'rgba(255,255,255,0.6)', heroInset: 'rgba(255,255,255,0.08)',
  green: '#1E9E57', greenSoft: '#E4F5EA',
  amber: '#E08A1E', amberSoft: '#FCF0DE',
  red: '#D9473F', redSoft: '#FBE7E5',
  chart: '#1E9E57', ring: '#B7A6F2',
  shadow: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(17,17,20,0.04), 0 8px 24px rgba(17,17,20,0.06)' },
    default: { shadowColor: '#111114', shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  })!,
};

const dark: Theme = {
  mode: 'dark',
  canvas: '#08080A',
  bg: '#111114', surface: '#111114', surface2: '#1F1F24', border: '#26262C',
  text: '#F2F2F0', muted: '#9A9AA3', faint: '#5A5A63',
  primary: '#F2F2F0', onPrimary: '#111114', primarySoft: '#1F1F24',
  hero: '#1F1F24', onHero: '#F2F2F0', heroMuted: 'rgba(242,242,240,0.6)', heroInset: 'rgba(255,255,255,0.06)',
  green: '#5FD38A', greenSoft: '#15301F',
  amber: '#F2A54A', amberSoft: '#33240F',
  red: '#FF6B61', redSoft: '#3A1916',
  chart: '#5FD38A', ring: '#9B8AF0',
  shadow: {},
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export const F = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  xbold: 'PlusJakartaSans_800ExtraBold',
};

/** The native driver isn't available on web. */
export const ND = Platform.OS !== 'web';
