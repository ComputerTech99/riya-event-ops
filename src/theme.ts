import { Platform, useColorScheme } from 'react-native';

/**
 * Light: soft lavender canvas, white rounded cards, violet primary.
 * Dark: near-black canvas, lime highlight.
 * The system setting decides which one shows.
 */
export interface Theme {
  mode: 'light' | 'dark';
  bg: string; surface: string; surface2: string; border: string;
  text: string; muted: string; faint: string;
  primary: string; onPrimary: string; primarySoft: string;
  /** Highlight card (live call). */
  hero: string; onHero: string; heroMuted: string; heroInset: string;
  green: string; greenSoft: string;
  amber: string; amberSoft: string;
  red: string; redSoft: string;
  chart: string; chartSoft: string;
  shadow: object;
}

const light: Theme = {
  mode: 'light',
  bg: '#F5F4F8', surface: '#FFFFFF', surface2: '#F3F2F7', border: '#ECEAF2',
  text: '#17161D', muted: '#74728A', faint: '#B6B4C4',
  primary: '#5A54C8', onPrimary: '#FFFFFF', primarySoft: '#EDECFA',
  hero: '#5A54C8', onHero: '#FFFFFF', heroMuted: 'rgba(255,255,255,0.72)', heroInset: 'rgba(255,255,255,0.12)',
  green: '#1F8F55', greenSoft: '#E2F4E9',
  amber: '#D2701A', amberSoft: '#FCEEDF',
  red: '#D23F39', redSoft: '#FBE8E7',
  chart: '#9DB05E', chartSoft: '#EDF1DE',
  shadow: Platform.select({
    web: { boxShadow: '0 1px 2px rgba(23,22,29,0.04), 0 6px 18px rgba(23,22,29,0.04)' },
    default: { shadowColor: '#17161D', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 1 },
  })!,
};

const dark: Theme = {
  mode: 'dark',
  bg: '#0E0E0F', surface: '#18181A', surface2: '#232326', border: '#26262A',
  text: '#F3F3EF', muted: '#9C9CA4', faint: '#56565E',
  primary: '#D5F25E', onPrimary: '#111111', primarySoft: '#2A3014',
  hero: '#D5F25E', onHero: '#111111', heroMuted: 'rgba(17,17,17,0.62)', heroInset: 'rgba(17,17,17,0.08)',
  green: '#6FDB8B', greenSoft: '#16301F',
  amber: '#F5A54A', amberSoft: '#352514',
  red: '#FF6B5F', redSoft: '#3A1A18',
  chart: '#D5F25E', chartSoft: '#2A3014',
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
