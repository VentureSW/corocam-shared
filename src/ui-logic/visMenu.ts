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
  /**
   * Divides the raw value for display only, when the command's real raw
   * register range isn't already the natural display unit (e.g. ISN's 0-999
   * needs no conversion, but vis_opacity's 0-255 does to show a 0-100%
   * label). min/max/step and the value actually sent to the camera always
   * stay in raw terms - this never reverse-converts a display input back to
   * raw (see docs/corocam-cc8-protocol.md's "Value scaling" section in the
   * rodxa repo for the verified raw-ranged-control-display-only-conversion
   * pattern this follows, and why reversing it was the actual bug: an item
   * declaring min/max in display units meant a user could never command the
   * camera past whatever fraction display-max/raw-max represents).
   */
  displayDivisor?: number;
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
  // Raw range confirmed live against real hardware 2026-10-16 (cross-checked against
  // the camera's own on-screen opacity readout: raw 66 -> camera OSD showed 26,
  // 66/255=25.9%, matches): true range is 0-255 (8-bit), not 0-100 as this item
  // previously declared. That bug meant the slider could only ever reach 100/255=39%
  // real opacity at its "max" - see docs/corocam-cc8-protocol.md in rodxa.
  { key: 'visOpacity', label: 'OPAC', kind: 'number', min: 0, max: 255, step: 13, unit: '%', displayDivisor: 2.55, command: 'vis_opacity' },
  { key: 'isn', label: 'ISN', kind: 'number', min: 0, max: 999, step: 1, command: 'ISN' },
  // Raw range already independently verified (docs/corocam-cc8-protocol.md's "Value
  // scaling" section, rodxa repo) as 0-65535 (0x0000=far, 0xFFFF=near per the spec),
  // not 0-100 as this item previously declared - same class of bug as visOpacity
  // above, just not live-recalibrated this session since it was already confirmed.
  { key: 'visFocus', label: 'FOCUS', kind: 'number', min: 0, max: 65535, step: 3277, unit: '%', displayDivisor: 655.35, command: 'visfocus' },
  // NOT YET FIXED, deliberately: 'exposure' isn't in the official spec at all,
  // and unlike vis_opacity/visFocus above, this item's small range (0-17) reads more
  // like a genuine exposure-stop/index count than a mis-scaled percentage. The
  // camera's observed raw value of 255 on one unit might mean "Auto" (a common
  // sentinel in camera exposure settings) rather than confirming an 8-bit 0-255
  // range the way vis_opacity's did. Needs its own live OSD cross-check (same method
  // as visOpacity above) before touching - don't assume this is the same bug.
  { key: 'visExp', label: 'EXP', kind: 'number', min: 0, max: 17, step: 1, command: 'exposure' },
  { key: 'visEnh', label: 'ENH', kind: 'sub', caption: 'VIS ENH', items: VIS_ENH_ITEMS },
  { key: 'flash', label: 'LAMP', kind: 'number', min: 10, max: 100, step: 10, unit: '%', command: null },
];

// Suggested starting values, matching the design prototype — used until (or unless)
// a real camera value arrives for items that have a command. Re-expressed in raw
// terms for visOpacity/visFocus 2026-10-16 (see VIS_ITEMS above) to preserve their
// original *displayed* intent (visOpacity "100%" i.e. fully opaque, visFocus "55%")
// now that min/max/the sent value are raw, not the old (wrong) 0-100 scale - a
// consumer still sending the old raw 100/55 here would silently regress to the same
// under-range bug the item fix above just corrected.
export const VIS_DEFAULT_VALUES: Record<string, number> = {
  visOpacity: 255, // was 100 (raw, wrong range) - 100% display is now raw 255
  isn: 12,
  visFocus: 36044, // was 55 (raw, wrong range) - 55% display is now raw round(55 * 655.35)
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
  // displayDivisor items (e.g. visOpacity: raw 0-255 -> displayed 0-100%) round to a
  // whole number - matches the camera's own on-screen readout, confirmed integer
  // (raw 66 showed as OSD "26", not "25.88") when this was added.
  const formatted = item.displayDivisor
    ? String(Math.round(value / item.displayDivisor))
    : item.step < 1
      ? value.toFixed(2)
      : String(value);
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
