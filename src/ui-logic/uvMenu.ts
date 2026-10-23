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
//   - samp->ROI confirmed 2026-10-19: live against a real CoroCam7 (model 7300) via
//     src/api's /debug console, SET ROI round-tripped cleanly across 1-10 (and beyond -
//     the camera didn't reject 0, 11 or 12 either, so the 1-10 range here is the
//     documented one, not a hard device-enforced limit). commands.ts's own ROI
//     description ("0=medium, 1=small, 2=large") turned out to be wrong/outdated - a
//     continuous 1-10 size, matching the manual's "Sampler Size" page, is what's
//     actually live. The manual also describes a SELECT/SET press that jumps straight
//     to full screen - not implemented here, since which raw value that corresponds to
//     (0? something outside 1-10?) hasn't been confirmed yet.
//   - li->UVIntFrames, nr->UVIntGain, trk->UV_showcen confirmed 2026-10-23: no numbered
//     command exists for any of the three (the only unclaimed UV registers in
//     commands.ts - uvalpha, UVNUC, UVxgain, UVCount - don't name- or manual-match), but
//     the actual NIOS firmware source (C:\swdev\cc6-hd-nios) settles all three directly -
//     m81menu.c's own menu-enable logic literally reads
//     `en_sysflags(SFM_LI, SystemSettings.UVIntFrames > 2)` and
//     `en_sysflags(SFM_NR, SystemSettings.UVIntGain < 1023)`, and `mf_uv_tracker`
//     (m81func.c) is the TRACK menu handler and writes straight to
//     `SystemSettings.UV_showcen`. Wired via `register` (command 72) instead of a plain
//     numbered `command`, same mechanism `hist`->`IR_Histogram` uses in irMenu.ts.
//     Range/divisor NOT separately re-verified here: `UVIntFrames`'s own menu-display
//     code (`m81func.c`) shows `UVIntFrames/2`, suggesting the real camera's on-screen
//     "LI" reading may be half the raw register value - this item's declared range
//     (1-32) happens to already match `UVIntFrames`'s firmware default (4) at face value
//     with no divisor applied, which is the simplest honest choice until live-tested,
//     but don't assume that coincidence proves the /2 question is settled. `nr`'s
//     declared range (0-7) is more clearly suspect and deliberately left alone too:
//     `UVIntGain`'s own firmware default is 1023 (`control.c`), and the `SFM_NR` enable
//     check above treats *lower* values as "more noise reduction" (a gain-reduction
//     control, not a plain 0-7 level) - real range is plausibly 0-1023 (10-bit, same
//     width as the already-confirmed `uvfocus`), and the UI relationship may need to be
//     inverted, not just rescaled. Wiring the register now so it genuinely sends
//     something is still worth doing; fixing the range/direction needs its own live
//     cross-check first, same discipline the opacity fixes above followed.

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
  { key: 'li', label: 'LI', kind: 'number', min: 1, max: 32, step: 1, unit: ' FR', command: null, register: 'UVIntFrames' },
  { key: 'nr', label: 'NR', kind: 'number', min: 0, max: 7, step: 1, command: null, register: 'UVIntGain' },
  { key: 'samp', label: 'SAMP', kind: 'number', min: 1, max: 10, step: 1, command: 'ROI' },
  { key: 'thr', label: 'THR', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'UVThr' },
  { key: 'trk', label: 'TRACK', kind: 'enum', values: ['OFF', 'ON'], command: null, register: 'UV_showcen' },
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
