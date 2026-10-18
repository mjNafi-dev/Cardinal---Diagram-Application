import { create } from 'zustand';
import type { Rect } from '../model/types';
import type { RoutedEdge } from '../routing/router';

/** Latest computed layout (for thumbnails and export) — not reactive on purpose. */
export const layoutRef: { current: { rects: Map<string, Rect>; routes: Map<string, RoutedEdge> } | null } = { current: null };

/** Canvas element (for fit-to-screen and centering). */
export const canvasRef: { current: HTMLDivElement | null } = { current: null };

/** Bumped when web fonts finish loading so text gets re-measured. */
export const useFontEpoch = create<{ epoch: number; bump(): void }>((set, get) => ({
  epoch: 0,
  bump: () => set({ epoch: get().epoch + 1 }),
}));
