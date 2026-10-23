// IR channel menu definition — docs/design/handoff_uv/IR_README.md "IR menu items"
// table plus its three sub-columns (RADIOMETRY, ISOTHERM, ENVIRO). Handoff 3 of 3.
//
// Reuses handoff 1's item-shape types (NumberMenuItem/EnumMenuItem/SubMenuItem/
// VisMenuItem) from ./visMenu — none of those were ever VIS-specific, they were just
// introduced there first.
//
// NOT implemented: "IR's conditional presence in the channel cycle" (IR_README.md's
// "Channel switching" — drop IR from the cycle when the camera doesn't report it
// available). There is no confirmed protocol signal for that: commands.ts has no
// "ir available"/hardware-presence command, only `ir_enable` (which toggles the
// overlay's visibility, not whether the hardware exists).
//
// `command` mapping, against the protocol's commands.ts CC8HD dictionary:
//   - irOpacity->ir_opacity, irMin->ir_tlo, irMax->ir_thi, irFocus->ir_focus,
//     irPal->ir_palette, emis->ir_emis, rtemp->ir_trefl, gain->ir_gain,
//     isoMin->iso_tlo, isoMax->iso_thi are confident direct name/semantic matches
//     ("tlo"/"thi" = temperature low/high, the palette-stretch bounds; "trefl" =
//     reflected temperature, i.e. REFL).
//   - irRep->ir_tsel ("temperature select") and isoPal->iso_color are semantic
//     best guesses — the only remaining unclaimed ir_*/iso_* registers and a
//     plausible name match, but not as clean a match as the ones above. Confirm
//     before shipping.
//   - hist and isamp have NO confirmed command — no histogram or sample-count
//     register exists anywhere in commands.ts (UV's `samp` hit the identical wall).
//     isoOp likewise has no command: there is no `iso_opacity` entry in the table at
//     all (only `ir_opacity`, shared by the base thermal layer, not the isotherm
//     overlay). These three stay local-only (command: null) until confirmed against
//     real hardware — same treatment as UV's li/nr/samp/trk.

import type { EnumMenuItem, NumberMenuItem, VisMenuItem } from './visMenu';
import { UV_ENV_ITEMS } from './uvMenu';

export const IR_RADIOMETRY_ITEMS: readonly (NumberMenuItem | EnumMenuItem)[] = [
  // Wired 2026-10-22: no numbered command exists for this (confirmed - zero hits for
  // "histogram" anywhere in the remote protocol spec), but the real CC8HD Manual
  // ("ADVANCED RADIOMETRY TOOLS SUB MENU... Show temperature Histogram, Range: 0 (Off)
  // -1 (On)") and corocam-shared's own named register map both independently point to
  // the same place: `IR_Histogram` (SystemSettings word 129, command 72 read/write).
  // Live-tested: reads back exactly what's written (0/1 round-trips cleanly) - a real
  // register, not a no-op. Not visually confirmed on screen this round (no obvious
  // change spotted across two screenshots a beat apart), so treat the *value* as
  // confirmed wired, not yet the *visible effect*. Same volatility caveat as every
  // other register write in this project: reverts on profile reload/reboot unless
  // separately committed via savprof - not handled here.
  { key: 'hist', label: 'HIST', kind: 'enum', values: ['OFF', 'ON'], command: null, register: 'IR_Histogram' },
  // Fixed 2026-10-23: the old declaration (min 0.05, max 1, step 0.05, no divisor) sent
  // the fraction itself as the raw arg. packet.ts's integerToLittleEndian does `v & 0xff`
  // on the way to bytes, which forces a ToInt32 truncation - any value below 1 (i.e.
  // every normal EMIS setting except the very top of the range) silently truncated to
  // raw 0 and never reached the camera. Live-confirmed on real hardware: watched the
  // camera's own on-screen EMIS readout (its RAD menu, which independently shows the
  // true current value) while stepping this - raw 1 visibly changed it, every value
  // below 1 did nothing. Firmware confirms the real encoding two ways: PDF command 46
  // ("argument is 8192 times the emissivity, 0x0000-0x2000") and control.c's own
  // default `IREmiss = 7372; //0.9` plus the menu's own commit code
  // (`SystemSettings.IREmiss = f * 8192`, m81menu.c:1688). Range/step/display corrected
  // again the same day to match the camera's own menu declaration for this exact item
  // (m81defs.c:98: `{vt_float, "0.90","0.05","1.0","0.01","%1.2f"}`) instead of an
  // arbitrary percent framing - emissivity is conventionally read as a 0.00-1.00
  // fraction (see the camera's own built-in material-emissivity reference table:
  // "Aluminum Foil 0.040", "Asbestos board 0.960", etc.), not a percentage, and the
  // camera's own min (0.05, not 0.00) is a deliberate floor, not the protocol's.
  { key: 'emis', label: 'EMIS', kind: 'number', min: 410, max: 8192, step: 82, displayDivisor: 8192, displayDecimals: 2, command: 'ir_emis' },
  // Wired 2026-10-22 to the same 'ROI' command UV's own `samp` uses (commit
  // 0496da3, corocam-shared) - not a name-similarity guess: the CC8HD Manual
  // describes "Sampler Size... Range: 1-10... press SELECT/SET to set to full screen"
  // with identical wording in both UV's and IR's own advanced-tools sub-menu pages,
  // and this item's declared range (1-10) already matched UV's exactly before this
  // change - strong evidence it's one shared sampler/ROI window across channels, the
  // same pattern IR_ENV_ITEMS already uses (literally reusing UV_ENV_ITEMS). Not yet
  // independently live-confirmed in an IR-specific session the way UV's was - if this
  // and UV's SAMP ever appear to visibly disagree, that's the first thing to recheck.
  { key: 'isamp', label: 'SAMP', kind: 'number', min: 1, max: 10, step: 1, command: 'ROI' },
  { key: 'rtemp', label: 'REFL', kind: 'number', min: -50, max: 327, step: 1, unit: ' °C', command: 'ir_trefl' },
  // The two labels carry their spans inline — see IR_README.md's RADIOMETRY section:
  // switching this changes what irMin/irMax can mean, worth surfacing to the operator.
  { key: 'gain', label: 'GAIN', kind: 'enum', values: ['LOW -20-160', 'HIGH 0-500'], command: 'ir_gain' },
];

export const IR_ISOTHERM_ITEMS: readonly (NumberMenuItem | EnumMenuItem)[] = [
  { key: 'isoPal', label: 'PAL', kind: 'enum', values: ['RED', 'AMBER', 'GREEN', 'CYAN'], command: 'iso_color' },
  { key: 'isoOp', label: 'OPAC', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: null },
  { key: 'isoMin', label: 'MIN', kind: 'number', min: -199, max: 999, step: 5, unit: '°', command: 'iso_tlo' },
  { key: 'isoMax', label: 'MAX', kind: 'number', min: -199, max: 999, step: 5, unit: '°', command: 'iso_thi' },
];

// Same three values as UV's ENV sub-menu — same keys, same ranges, same command:
// they describe the site, not the channel, and are stored once (IR_README.md's
// ENVIRO section). Filtering UV's own array (rather than re-declaring dist/hum/wind
// here) guarantees that identity instead of relying on two literals staying in sync.
const IR_ENV_KEYS: readonly string[] = ['dist', 'hum', 'wind'];
export const IR_ENV_ITEMS: readonly NumberMenuItem[] = UV_ENV_ITEMS.filter(
  (item): item is NumberMenuItem => item.kind === 'number' && IR_ENV_KEYS.includes(item.key)
);

export const IR_ITEMS: readonly VisMenuItem[] = [
  // Range was wrong (declared 20-100, real raw range confirmed 0-255 via a live
  // before/after comparison against the actual video - same class of bug visOpacity
  // had, and the same "(8-bit)" wording in commands.ts's own description). Stepped
  // ir_opacity through 50/100/150/200/255 while watching the IR feed: a clean,
  // monotonic increase in how much the thermal palette covers the base image, with
  // raw 100 (the old declared max) only barely past the 50 end of that range, nowhere
  // near fully opaque - 255 was needed to fully hide the base layer. min/step/the
  // previous suggested default below are rescaled by the same 2.55 (255/100) factor
  // used for visOpacity's fix, to preserve their original intended display meaning
  // (floor "20%", step "5%") now that min/max/the sent value are raw, not the old
  // (wrong) 0-100 scale. The floor's own rationale (why 20% specifically) wasn't
  // re-verified here, just proportionally carried over.
  { key: 'irOpacity', label: 'OPAC', kind: 'number', min: 51, max: 255, step: 13, unit: '%', displayDivisor: 2.55, command: 'ir_opacity' },
  { key: 'irMin', label: 'MIN', kind: 'number', min: -200, max: 1000, step: 5, unit: '°', command: 'ir_tlo' },
  { key: 'irMax', label: 'MAX', kind: 'number', min: -200, max: 1000, step: 5, unit: '°', command: 'ir_thi' },
  { key: 'irFocus', label: 'FOCUS', kind: 'number', min: 0, max: 100, step: 5, unit: '%', command: 'ir_focus' },
  {
    key: 'irPal',
    label: 'PAL',
    kind: 'enum',
    values: ['WHITE HOT', 'BLACK HOT', 'YELLOW HOT', 'IRONBOW', 'GLOWBOW', 'RAINBOW'],
    command: 'ir_palette',
  },
  // Caption has an explicit line break, not left as one long word: ChannelMenu's
  // subCaption Text doesn't reliably auto-wrap on Android at this column width/font
  // size (confirmed on UV's "UV PALETTE", same 10-character length, which silently
  // dropped its wrapped half instead of wrapping — see uvMenu.ts's uvPal item). A
  // single unbroken 10-character word like "RADIOMETRY" has no space to wrap at
  // regardless, so it's at least as much at risk.
  { key: 'irAdv', label: 'RAD', kind: 'sub', caption: 'RADIO\nMETRY', items: IR_RADIOMETRY_ITEMS },
  { key: 'iso', label: 'ISO', kind: 'sub', caption: 'ISOTHERM', items: IR_ISOTHERM_ITEMS },
  { key: 'irEnv', label: 'ENV', kind: 'sub', caption: 'ENVIRO', items: IR_ENV_ITEMS },
  { key: 'irRep', label: 'REPT', kind: 'enum', values: ['MAXIMUM', 'AVERAGE', 'MINIMUM'], command: 'ir_tsel' },
];

// Suggested starting values, matching docs/design/handoff_uv/IR_README.md — used
// until (or unless) a real camera value arrives for items that have a command.
// dist/hum/wind are deliberately absent: UV_DEFAULT_VALUES already carries them (see
// IR_ENV_ITEMS above), and ChannelMenu.tsx merges every channel's defaults together.
export const IR_DEFAULT_VALUES: Record<string, number> = {
  irOpacity: 153, // was 60 (raw, wrong range) - 60% display is now raw round(60 * 2.55)
  irMin: 27,
  irMax: 28,
  irFocus: 50,
  irPal: 3, // IRONBOW
  irRep: 0, // MAXIMUM
  hist: 0, // OFF
  emis: 0.95,
  isamp: 3,
  rtemp: 22,
  gain: 0, // LOW
  isoPal: 0, // RED
  isoOp: 100,
  isoMin: 30,
  isoMax: 60,
};
