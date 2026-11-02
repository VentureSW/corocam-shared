// Zoom slider math, ported 1:1 from the design handoff's CoroWiFi Toolbar.dc.html
// (the primary reference per its README — a second, standalone "CoroWiFi Zoom.dc.html"
// demo disagrees on some styling details but uses identical math).

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
const ZOOM_EXP = Math.log2(ZOOM_MAX); // 3
export const ZOOM_STEPS: readonly number[] = [1, 2, 4, 8];

// The camera's actual valid range for vzoom is 0-32768 (2^15) — NOT the wire field's
// naive 65535 ceiling implied by its 2-byte width. Confirmed independently by two other
// reference implementations of this protocol: an older BLE app's UI metadata table, and
// a Python ONVIF bridge's Scale_converter.py ('vzoom': [True, 0, 1, 0, 2**15, False]).
export const VZOOM_RAW_MAX = 32768;

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Slider position (0..1) -> display magnification (1..8), logarithmic. */
export function fromT(t: number): number {
  return Math.pow(2, clamp01(t) * ZOOM_EXP);
}

/** Display magnification -> slider position (0..1). Inverse of fromT. */
export function toT(z: number): number {
  return Math.log2(z) / ZOOM_EXP;
}

export function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** Raw vzoom endpoints a slider position (0..1) maps onto — see tToRaw/rawToT. */
export interface ZoomRawRange {
  min: number;
  max: number;
}

// Fallback when the camera's own calibration (CommandQueue.getZoomCalibration, reads
// SystemSettings.ZOOM_CAL - see docs/corocam-command-testing.md's zoom entry) hasn't
// loaded yet or isn't available - the full nominal wire width, same behavior this file
// had before per-unit calibration was wired in 2026-10-26.
export const DEFAULT_VZOOM_RAW_RANGE: ZoomRawRange = { min: 0, max: VZOOM_RAW_MAX };

// ASSUMPTION, unverified against real hardware: slider position maps LINEARLY onto the
// raw vzoom register between whichever range is given. Only the 1x/2x/4x/8x detent
// labels are log-spaced along that same linear travel axis. Neither the camera manual
// nor the design docs document what the raw register actually corresponds to physically
// — see the plan's risk notes.
//
// `range` defaults to the full nominal wire width (0-32768) — pass the camera's own
// calibrated {min, max} (ZOOM_CAL[channel][0]/[3]) once it's been fetched to keep the
// slider within the lens's real, per-unit-calibrated travel instead of commanding it
// past where it's actually calibrated to stop.
export function tToRaw(t: number, range: ZoomRawRange = DEFAULT_VZOOM_RAW_RANGE): number {
  return Math.round(range.min + clamp01(t) * (range.max - range.min));
}

export function rawToT(raw: number, range: ZoomRawRange = DEFAULT_VZOOM_RAW_RANGE): number {
  return clamp01((raw - range.min) / (range.max - range.min));
}

export function formatZoom(z: number): string {
  return (z < 10 ? z.toFixed(1) : String(Math.round(z))) + '×';
}

/** True if z sits within the same ~0.02-in-t-space neighborhood as `step`. */
export function isNearStep(z: number, step: number): boolean {
  return Math.abs(toT(z) - toT(step)) < 0.02;
}
