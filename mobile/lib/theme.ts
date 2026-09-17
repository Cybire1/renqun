// Shared type and spacing tokens, and the shape every palette fills. Renqun's colours live in
// lib/mezo/theme.ts (colorsMezo); screens read them with useColors() or the `mz` tokens.
// Type: Sora (display) / Inter (body) / JetBrains Mono (numbers, prices, countdowns).

export type Palette = {
  // surfaces
  ink: string;
  inkSoft: string;
  card: string;
  cardHi: string;
  border: string;
  borderSoft: string;
  grid: string;
  // text
  paper: string;
  plate: string;
  paperDim: string;
  muted: string;
  faint: string;
  jp: string;
  jpFaint: string;
  jpAccent: string;
  // accent and outcomes
  vermilion: string;
  vermilionD: string;
  gold: string;
  up: string;
  down: string;
  pending: string;
  white: string;
  black: string;
};

export const fonts = {
  display: 'Sora_700Bold', // big titles
  displaySemi: 'Sora_600SemiBold', // headings
  body: 'Inter_400Regular',
  bodyMed: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_500Medium', // numbers, prices, countdowns
  monoBold: 'JetBrainsMono_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 4, md: 10, lg: 14, pill: 999 } as const;
