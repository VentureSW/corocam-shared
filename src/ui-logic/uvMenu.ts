// UV channel menu definition — docs/design/handoff_uv/uv_readme "UV menu items"
// table plus its three sub-columns (UV PALETTE, ADV UV, ENVIRO). Handoff 2 of 3: IR
// (handoff 3) is a separate file.
//
// Reuses handoff 1's item-shape types (NumberMenuItem/EnumMenuItem/SubMenuItem/
// VisMenuItem) and its formatItemValue/stepItemValue helpers from ./visMenu — none of
// those were ever VIS-specific, they were just introduced there first.
//
// `command` mapping, against the protocol's commands.ts CC8HD dictionary:
//   - uvOpacity->uv_opacity, uvGain->uvgain, uvFocus->uvfocus, palPreset->uvpalette,
//     palHue->uvhue, thr->UVThr, and the five env_* commands are confident direct
//     name/semantic matches.
//   - nsb->uvfilter is a confident semantic match: reference/manual-text.txt
//     describes it as literally "toggles the solar blind filter position," and its
//     0/1 raw values line up with the manual's "0 (Solar Blind), 1 (Non Solar Blind)".
//   - li, nr, samp and trk have NO confirmed command. The only unclaimed UV registers
//     left in commands.ts (uvalpha, UVNUC, UVxgain, UVCount) don't name- or
//     manual-match any of the four (UVNUC is Non-Uniformity Correction, a distinct
//     feature the manual lists separately from Long Integration/Noise Reduction), and
//     UVCount is GET-only (commandQueue.ts throws on SET) so it can't be samp even by
//     name similarity. These four stay local-only (command: null) until confirmed
//     against real hardware — same treatment as flash/LAMP in handoff 1. Confirm
//     before shipping.

import type { EnumMenuItem, NumberMenuItem, VisMenuItem } from './visMenu';

export const UV_PALETTE_ITEMS: readonly (NumberMenuItem | EnumMenuItem)[] = [
  {
    key: 'palPreset',
    label: 'PRESET',
    kind: 'enum',
    values: ['RED', 'YELLOW', 'BLUE', 'GREEN', 'WHITE', 'BLACK'],
    command: 'uvpalette',
  },
  { key: 'palHue', label: 'HUE', kind: 'number', min: 0, max: 359, step: 5, unit: '°', command: 'uvhue' },
];

export const UV_ADV_ITEMS: readonly (NumberMenuItem | EnumMenuItem)[] = [
  { key: 'li', label: 'LI', kind: 'number', min: 1, max: 32, step: 1, unit: ' FR', command: null },
  { key: 'nr', label: 'NR', kind: 'number', min: 0, max: 7, step: 1, command: null },
  { key: 'samp', label: 'SAMP', kind: 'number', min: 1, max: 10, step: 1, command: null },
  { key: 'thr', label: 'THR', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'UVThr' },
  { key: 'trk', label: 'TRACK', kind: 'enum', values: ['OFF', 'ON'], command: null },
  { key: 'nsb', label: 'NSB', kind: 'enum', values: ['SOLAR BLIND', 'NON SB'], command: 'uvfilter' },
];

export const UV_ENV_ITEMS: readonly NumberMenuItem[] = [
  { key: 'dist', label: 'DIST', kind: 'number', min: 0, max: 200, step: 1, unit: ' m', command: 'env_dist' },
  { key: 'hum', label: 'HUM', kind: 'number', min: 0, max: 100, step: 1, unit: '%', command: 'env_humid' },
  { key: 'temp', label: 'TEMP', kind: 'number', min: -20, max: 100, step: 1, unit: ' °C', command: 'env_temp' },
  { key: 'pres', label: 'PRES', kind: 'number', min: 500, max: 1500, step: 5, unit: ' mb', command: 'env_pres' },
  { key: 'wind', label: 'WIND', kind: 'number', min: 0, max: 50, step: 1, unit: ' m/s', command: 'env_wind' },
];

export const UV_ITEMS: readonly VisMenuItem[] = [
  { key: 'uvOpacity', label: 'OPAC', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'uv_opacity' },
  { key: 'uvGain', label: 'GAIN', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'uvgain' },
  { key: 'uvFocus', label: 'FOCUS', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'uvfocus' },
  // Caption has an explicit line break, not a space: ChannelMenu's subCaption Text
  // doesn't reliably auto-wrap on Android at this column width/font size — confirmed
  // on-device that a plain 'UV PALETTE' string silently drops the wrapped second word
  // entirely rather than wrapping (width/numberOfLines tweaks on the Text didn't fix
  // it), while every other caption here happened to already fit on one line and never
  // hit this. A literal '\n' sidesteps whatever the underlying wrap bug is.
  { key: 'uvPal', label: 'PAL', kind: 'sub', caption: 'UV\nPALETTE', items: UV_PALETTE_ITEMS },
  { key: 'uvAdv', label: 'ADV', kind: 'sub', caption: 'ADV UV', items: UV_ADV_ITEMS },
  { key: 'uvEnv', label: 'ENV', kind: 'sub', caption: 'ENVIRO', items: UV_ENV_ITEMS },
];

// Suggested starting values, matching docs/design/handoff_uv/uv_readme — used until
// (or unless) a real camera value arrives for items that have a command.
export const UV_DEFAULT_VALUES: Record<string, number> = {
  uvOpacity: 100,
  uvGain: 100,
  uvFocus: 60,
  palPreset: 2, // BLUE
  palHue: 210,
  li: 4,
  nr: 2,
  samp: 3,
  thr: 40,
  trk: 0, // OFF
  nsb: 0, // SOLAR BLIND
  dist: 12,
  hum: 41,
  temp: 24,
  pres: 1013,
  wind: 3,
};
