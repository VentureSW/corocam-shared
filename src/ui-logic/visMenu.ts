// VIS channel menu definition — docs/design/handoff-vis/README.md "VIS menu items"
// table and its VIS ENH sub-column. Handoff 1 of 3 — UV (./uvMenu.ts) and IR
// (./irMenu.ts) are separate files that reuse the item-shape types and
// formatItemValue/stepItemValue helpers below.
//
// `command` is the exact wire command name from the protocol's commands.ts
// (case-sensitive — it's a literal Map key, not normalized) or null where no command
// exists at all:
//   - flash/LAMP: no command in the protocol table maps to it. Kept local-only,
//     same treatment as channel cycling elsewhere.
//   - wdr -> 'WD' and defog -> 'DF' are confident matches (initials + manual-text
//     ordering, see reference/manual-text.txt's Wide-Dynamic-Range/Defog paragraphs).
//   - ve -> 'BL' and lowl -> 'LL' are a best guess: the manual confirms Visibility
//     Enhancement and Low Light both exist as plain on/off toggles, but doesn't name
//     their registers, and 'LL'/'BL' are the only two unclaimed single-byte "both"
//     commands left. Confirm against real hardware before shipping.

export interface NumberMenuItem {
  key: string;
  label: string;
  kind: 'number';
  min: number;
  max: number;
  step: number;
  unit?: string;
  command: string | null;
}

export interface EnumMenuItem {
  key: string;
  label: string;
  kind: 'enum';
  values: readonly string[];
  command: string | null;
}

export interface SubMenuItem {
  key: string;
  label: string;
  kind: 'sub';
  caption: string;
  items: readonly (NumberMenuItem | EnumMenuItem)[];
}

export type VisMenuItem = NumberMenuItem | EnumMenuItem | SubMenuItem;

export const VIS_ENH_ITEMS: readonly EnumMenuItem[] = [
  { key: 'wdr', label: 'WDR', kind: 'enum', values: ['OFF', 'ON'], command: 'WD' },
  { key: 've', label: 'VE', kind: 'enum', values: ['OFF', 'ON'], command: 'BL' },
  { key: 'defog', label: 'DEFOG', kind: 'enum', values: ['OFF', 'ON'], command: 'DF' },
  { key: 'lowl', label: 'LOW L', kind: 'enum', values: ['OFF', 'ON'], command: 'LL' },
];

export const VIS_ITEMS: readonly VisMenuItem[] = [
  { key: 'visOpacity', label: 'OPAC', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'vis_opacity' },
  { key: 'isn', label: 'ISN', kind: 'number', min: 0, max: 999, step: 1, command: 'ISN' },
  { key: 'visFocus', label: 'FOCUS', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'visfocus' },
  { key: 'visExp', label: 'EXP', kind: 'number', min: 0, max: 17, step: 1, command: 'exposure' },
  { key: 'visEnh', label: 'ENH', kind: 'sub', caption: 'VIS ENH', items: VIS_ENH_ITEMS },
  { key: 'flash', label: 'LAMP', kind: 'number', min: 10, max: 100, step: 10, unit: '%', command: null },
];

// Suggested starting values, matching the design prototype — used until (or unless)
// a real camera value arrives for items that have a command.
export const VIS_DEFAULT_VALUES: Record<string, number> = {
  visOpacity: 100,
  isn: 12,
  visFocus: 55,
  visExp: 8,
  flash: 50,
  wdr: 0,
  ve: 0,
  defog: 0,
  lowl: 0,
};

// Cross-channel rule from docs/design/handoff_uv/IR_README.md's RADIOMETRY section
// (written against IR's `emis`, the one fractional-step item in the app so far, step
// 0.05): items whose step is below 1 render to two decimals; everything else appends
// its unit string as before.
export function formatItemValue(item: NumberMenuItem | EnumMenuItem, value: number): string {
  if (item.kind === 'enum') {
    return item.values[value] ?? item.values[0];
  }
  const formatted = item.step < 1 ? value.toFixed(2) : String(value);
  return `${formatted}${item.unit ?? ''}`;
}

export function stepItemValue(item: NumberMenuItem | EnumMenuItem, value: number, dir: 1 | -1): number {
  if (item.kind === 'enum') {
    const n = item.values.length;
    return ((value + dir) % n + n) % n;
  }
  const next = Math.max(item.min, Math.min(item.max, value + dir * item.step));
  // Round to 2 decimals so fractional steps (e.g. 0.05) don't accumulate floating-
  // point artefacts (0.1 + 0.05 = 0.15000000000000002) — a no-op for integer steps.
  return Math.round(next * 100) / 100;
}
