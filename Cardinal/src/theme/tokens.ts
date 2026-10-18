// Design tokens — mirror of .claude/creative/data/design-tokens.js. Keep both in sync.
import { paletteCss } from '../model/palette';

export type ThemeName = 'light' | 'dark';

export const THEMES: Record<ThemeName, Record<string, string>> = {
  light: {
    '--bg': '#F3F4F6',
    '--panel': '#FFFFFF',
    '--panel-2': '#F7F8FA',
    '--panel-3': '#EEF0F3',
    '--border': '#E3E5E9',
    '--border-strong': '#CBD0D6',
    '--text': '#1B1D21',
    '--text-2': '#5B616B',
    '--text-3': '#8A919B',
    '--accent': '#D7263D',
    '--accent-hover': '#BD1D32',
    '--accent-soft': '#FCE8EB',
    '--accent-text': '#FFFFFF',
    '--select': '#2F6FEB',
    '--select-soft': 'rgba(47,111,235,0.12)',
    '--danger': '#B3382C',
    '--success': '#2E7D4F',
    '--shadow-1': '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.08)',
    '--shadow-2': '0 4px 12px rgba(16,24,40,.10), 0 2px 4px rgba(16,24,40,.06)',
    '--shadow-3': '0 16px 40px rgba(16,24,40,.18), 0 4px 10px rgba(16,24,40,.08)',
    // diagram
    '--canvas': '#FAFAFB',
    '--grid': '#DADDE2',
    '--ink': '#2A2E35',
    '--ink-text': '#1B1D21',
    '--ink-muted': '#7A818C',
    '--shape-fill': '#FFFFFF',
    '--row-line': '#ECEEF1',
    '--key': '#C8213A',
    '--note-fill': '#FFF6CC',
    '--note-line': '#D9C46A',
    // logic circuits
    '--sig-on': '#16A34A',
    '--sig-off': '#3A3F47',
    '--sig-x': '#AEB4BC',
    '--switch-off': '#E4E7EB',
    '--bulb-on': '#FFC531',
    '--warn': '#F0A41C',
  },
  dark: {
    '--bg': '#111214',
    '--panel': '#191B1F',
    '--panel-2': '#1F2126',
    '--panel-3': '#262931',
    '--border': '#2A2D33',
    '--border-strong': '#3A3E46',
    '--text': '#E8EAED',
    '--text-2': '#A3A9B2',
    '--text-3': '#737A84',
    '--accent': '#EE4A5F',
    '--accent-hover': '#F26476',
    '--accent-soft': '#3A1B22',
    '--accent-text': '#FFFFFF',
    '--select': '#5B8DEF',
    '--select-soft': 'rgba(91,141,239,0.16)',
    '--danger': '#E07B6F',
    '--success': '#5DBB87',
    '--shadow-1': '0 1px 2px rgba(0,0,0,.4)',
    '--shadow-2': '0 4px 12px rgba(0,0,0,.45)',
    '--shadow-3': '0 16px 40px rgba(0,0,0,.6)',
    '--canvas': '#15171A',
    '--grid': '#2C3036',
    '--ink': '#D3D7DD',
    '--ink-text': '#E8EAED',
    '--ink-muted': '#8E959F',
    '--shape-fill': '#1E2126',
    '--row-line': '#2A2E35',
    '--key': '#F0667A',
    '--note-fill': '#3A3418',
    '--note-line': '#8C7B2E',
    '--sig-on': '#4ADE80',
    '--sig-off': '#C5CAD1',
    '--sig-x': '#5A616B',
    '--switch-off': '#30343C',
    '--bulb-on': '#FFC531',
    '--warn': '#F5B33B',
  },
};

export function themeCss(): string {
  const block = (t: ThemeName) => Object.entries(THEMES[t]).map(([k, v]) => `${k}:${v};`).join('');
  return `[data-theme="light"]{${block('light')}color-scheme:light;}[data-theme="dark"]{${block('dark')}color-scheme:dark;}` + paletteCss();
}

/** Replace var(--x) with literal values (for exported SVG files that other apps open). */
export function resolveVars(svg: string, theme: ThemeName, extra: Record<string, string>, palette: Record<string, string>): string {
  const map: Record<string, string> = { ...THEMES[theme], ...palette, ...extra };
  return svg.replace(/var\((--[\w-]+)(?:,\s*([^)]+))?\)/g, (_, name, fb) => map[name] ?? fb ?? '#000');
}
