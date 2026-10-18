/** Every keyboard shortcut, for the Preferences → Shortcuts tab. Keep in sync with the key handlers in Home.tsx / EditorPage.tsx. */
export const SHORTCUTS: { group: string; keys: [string, string][] }[] = [
  {
    group: 'Everywhere',
    keys: [
      ['Ctrl + ,', 'Preferences'],
      ['?', 'This list of shortcuts'],
      ['Esc', 'Close a dialog or menu'],
    ],
  },
  {
    group: 'Projects page',
    keys: [
      ['/  or  Ctrl + K', 'Search everything'],
      ['N', 'New diagram (inside a project) or new project'],
      ['Ctrl + S', 'Nothing to do: Cardinal saves on its own'],
    ],
  },
  {
    group: 'Diagram editor',
    keys: [
      ['Ctrl + K  or  /', 'Find a shape to add'],
      ['Ctrl + S', 'Save now (it also saves on its own)'],
      ['Ctrl + E', 'Export'],
      ['Ctrl + Z / Ctrl + Y', 'Undo / redo'],
      ['Ctrl + C / X / V', 'Copy / cut / paste (also pastes images)'],
      ['Ctrl + D', 'Duplicate'],
      ['Ctrl + A', 'Select everything'],
      ['Delete', 'Delete the selection'],
      ['Enter  or  F2', 'Edit the selected shape or line'],
      ['Arrow keys', 'Nudge (Shift = bigger steps)'],
      ['Ctrl + plus / minus', 'Zoom in / out'],
      ['Ctrl + 0', 'Fit the diagram to the screen'],
      ['Ctrl + 1', 'Zoom to 100%'],
      ['Space + drag', 'Pan'],
    ],
  },
  {
    group: 'Tools',
    keys: [
      ['V', 'Select'],
      ['N', 'Sticky note'],
      ['T', 'Text'],
      ['L', 'Line'],
      ['P', 'Pen'],
      ['C', 'Comment'],
    ],
  },
  {
    group: 'Editing a table row',
    keys: [
      ['Tab', 'Next box (keys → name → type)'],
      ['Enter', 'Next row'],
      ['↑ / ↓', 'Pick a suggestion'],
    ],
  },
];

/** True when the keyboard is in a text box, so single-letter shortcuts must not fire. */
export function typingInField(): boolean {
  const el = document.activeElement as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** 1536 → "1.5 KB" */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024, i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
