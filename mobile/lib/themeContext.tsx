// Renqun has one skin: Mezo sand, white cards and one red. Screens read the palette through
// useColors() and build their styles inside the component (useMemo(makeStyles, [c])).
//
//   Wrap once in app/_layout.tsx:  <ThemeProvider>…</ThemeProvider>
//   In a screen:                   const c = useColors();
import React, { createContext, useContext } from 'react';
import type { Palette } from './theme';
import { colorsMezo } from './mezo/theme';

export type Theme = 'light';

interface ThemeCtx {
  theme: Theme;
  colors: Palette;
}

const VALUE: ThemeCtx = { theme: 'light', colors: colorsMezo };
const Ctx = createContext<ThemeCtx>(VALUE);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return <Ctx.Provider value={VALUE}>{children}</Ctx.Provider>;
}

/** The active palette. */
export function useColors(): Palette {
  return useContext(Ctx).colors;
}

export function useTheme(): ThemeCtx {
  return useContext(Ctx);
}
