// Renqun's skin: Mezo's palette with Sora / Inter / JetBrains Mono. Source: the design canvas in
// design/mezo-canvas.
//
// Colour rules (contrast-checked):
//   • One red. Mezo off-red #FF004D marks identity and your next action: fills with BLACK labels
//     (5.4:1; white is 3.9:1 and fails), strike lines, headline type (≥ 24pt).
//   • Small words are ink or grey. When one needs the accent, the red becomes a shape.
//   • Up and Down are soft: light fills (mint, warm grey) with a deeper arrow or word on top
//     (#03703C, #48423D). No solid black or green blocks.
//   • Sand page, white surfaces lifted by a warm shadow (no outlines), greys no lighter than
//     #6B6B6B for anything a person has to read.
import type { TextStyle, ViewStyle } from 'react-native';
import { fonts, type Palette } from '../theme';

export const mz = {
  sand: '#F4F0ED',
  sandDeep: '#EAE3DD', // tracks, wells and chips sitting on sand
  card: '#FFFFFF',
  well: '#F7F4F1', // insets sitting on white
  line: '#E2E2E2',
  lineSoft: '#EEEEEE',
  lineStrong: '#CBCBCB',
  hairline: 'rgba(23,23,23,0.08)',

  ink: '#171717',
  black: '#000000',
  text2: '#545454',
  text3: '#6B6B6B',

  red: '#FF004D',
  redDeep: '#D10069',
  wine: '#6B0036',
  redTint: 'rgba(255,0,77,0.08)',
  redTintStrong: 'rgba(255,0,77,0.14)',
  redBand: 'rgba(255,0,77,0.10)',
  redEdge: 'rgba(255,0,77,0.35)',

  green: '#06C167',
  greenText: '#03703C',
  greenTint: 'rgba(6,193,103,0.12)',
  inkTint: 'rgba(23,23,23,0.06)',

  // Soft side colours: light fills with a deeper word or arrow on top. No solid black or green blocks.
  upSoft: '#DFF5E9',
  upLine: '#8ED8AF',
  upThumb: '#3FC981',
  downSoft: '#ECE6E0',
  downLine: '#CFC6BE',
  downText: '#48423D',
  downThumb: '#6E6660',

  onRed: '#000000',
  onGreen: '#0B0B0B',
  onInk: '#FFFFFF',
  scrim: 'rgba(12,12,12,0.45)',
  shadow: '#5A3418',
} as const;

/** The pool-update rule is the one place the wine gradient appears. */
export const WINE_GRADIENT = [mz.wine, mz.redDeep, mz.red, mz.wine] as const;
export const WINE_STOPS = [0, 0.3365, 0.6875, 1] as const;

/** The Mezo skin in the app's Palette shape, so every themed screen and the tab bar follow it. */
export const colorsMezo: Palette = {
  ink: mz.sand,
  inkSoft: mz.card,
  card: mz.card,
  cardHi: mz.sandDeep,
  border: mz.line,
  borderSoft: mz.lineSoft,
  grid: mz.lineSoft,

  paper: mz.ink,
  plate: mz.ink,
  paperDim: mz.text2,
  muted: mz.text3,
  faint: mz.text3,
  jp: 'rgba(23,23,23,0.22)',
  jpFaint: 'rgba(23,23,23,0.10)',
  jpAccent: 'rgba(255,0,77,0.40)',

  vermilion: mz.red,
  vermilionD: mz.redDeep,
  gold: mz.red,
  up: mz.greenText,
  down: '#7A716A', // chart line below the UP line: a warm grey, not black (4.6:1 on white)
  pending: '#8A5A00',
  white: '#FFFFFF',
  black: mz.black,
};

/** One light source, above and slightly in front: a warm, soft lift. */
export const lift: ViewStyle = {
  shadowColor: mz.shadow,
  shadowOpacity: 0.08,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
  elevation: 3,
};
export const liftSmall: ViewStyle = {
  shadowColor: mz.shadow,
  shadowOpacity: 0.07,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 1,
};
/** Kept for older call sites. */
export const cardShadow = lift;

export const r = { surface: 24, row: 18, control: 16, chip: 999, tile: 11 } as const;

/** Type scale. Sora for display, Inter for words, JetBrains Mono only where digits must line up. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 30, lineHeight: 35, letterSpacing: -0.8, color: mz.black },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 32, letterSpacing: -0.7, color: mz.black },
  heading: { fontFamily: fonts.displaySemi, fontSize: 17, lineHeight: 22, letterSpacing: -0.2, color: mz.ink },
  figure: { fontFamily: fonts.display, fontSize: 24, letterSpacing: -0.5, color: mz.black, fontVariant: ['tabular-nums'] },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: mz.text2 },
  label: { fontFamily: fonts.bodyMed, fontSize: 13, lineHeight: 18, color: mz.text3 },
  strong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 20, color: mz.ink },
  small: { fontFamily: fonts.bodyMed, fontSize: 12, lineHeight: 16, color: mz.text3 },
  digits: { fontFamily: fonts.mono, fontSize: 13, color: mz.ink, fontVariant: ['tabular-nums'] },
  digitsBold: { fontFamily: fonts.monoBold, fontSize: 13, color: mz.ink, fontVariant: ['tabular-nums'] },
} satisfies Record<string, TextStyle>;
