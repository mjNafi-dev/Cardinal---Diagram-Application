import type { ColorKey } from './types';

/** Each palette color has a soft fill and a strong line color, for light and dark themes. */
export const PALETTE: Record<Exclude<ColorKey, 'auto'>, { name: string; light: { fill: string; line: string }; dark: { fill: string; line: string } }> = {
  gray:   { name: 'Gray',   light: { fill: '#EEF0F3', line: '#5B616B' }, dark: { fill: '#2A2E35', line: '#A3A9B2' } },
  red:    { name: 'Red',    light: { fill: '#FCE6E9', line: '#C8213A' }, dark: { fill: '#3A1D23', line: '#F0667A' } },
  orange: { name: 'Orange', light: { fill: '#FDEBDD', line: '#C2561A' }, dark: { fill: '#3A2618', line: '#F29A5E' } },
  yellow: { name: 'Yellow', light: { fill: '#FBF3D5', line: '#9A7408' }, dark: { fill: '#342D14', line: '#E3C155' } },
  green:  { name: 'Green',  light: { fill: '#E2F3E7', line: '#2C7A47' }, dark: { fill: '#18301F', line: '#6CC58C' } },
  teal:   { name: 'Teal',   light: { fill: '#DDF2F1', line: '#167572' }, dark: { fill: '#142F2E', line: '#5CC6C1' } },
  blue:   { name: 'Blue',   light: { fill: '#E3ECFC', line: '#2F5FC9' }, dark: { fill: '#1A2640', line: '#7EA4F2' } },
  purple: { name: 'Purple', light: { fill: '#EEE6FA', line: '#6B42B8' }, dark: { fill: '#2A2040', line: '#AE8EEA' } },
  pink:   { name: 'Pink',   light: { fill: '#FBE5F1', line: '#B4307A' }, dark: { fill: '#3A1C2D', line: '#EC79B7' } },
  white:  { name: 'White',  light: { fill: '#FFFFFF', line: '#FFFFFF' }, dark: { fill: '#2C2F36', line: '#F4F5F7' } },
};

export const PALETTE_KEYS = Object.keys(PALETTE) as Exclude<ColorKey, 'auto'>[];

/** CSS value for a fill color key. Theme handled with CSS variables so dark mode just works. */
export const fillVar = (k: ColorKey | undefined, fallback = 'var(--shape-fill)') =>
  !k || k === 'auto' ? fallback : `var(--pal-${k}-fill)`;
export const lineVar = (k: ColorKey | undefined, fallback = 'var(--ink)') =>
  !k || k === 'auto' ? fallback : `var(--pal-${k}-line)`;

/** CSS text emitted once (in App) defining --pal-* variables for both themes. */
export function paletteCss(): string {
  const light = PALETTE_KEYS.map((k) => `--pal-${k}-fill:${PALETTE[k].light.fill};--pal-${k}-line:${PALETTE[k].light.line};`).join('');
  const dark = PALETTE_KEYS.map((k) => `--pal-${k}-fill:${PALETTE[k].dark.fill};--pal-${k}-line:${PALETTE[k].dark.line};`).join('');
  return `[data-theme="light"]{${light}}[data-theme="dark"]{${dark}}`;
}
