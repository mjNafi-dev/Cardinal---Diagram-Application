import { create } from 'zustand';
import type { ThemeName } from './tokens';

/** The theme actually in use (preference "system" resolved against the OS). */
export const useResolvedTheme = create<{ theme: ThemeName; set(t: ThemeName): void }>((set) => ({
  theme: 'light',
  set: (theme) => set({ theme }),
}));
