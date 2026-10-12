// Every fixed dimension across the channel-control overlay (ChannelMenu, ZoomSlider,
// ActiveChannelControl, etc.) was lifted directly from docs/design/handoff-vis/README.md's
// pixel spec, itself written for "a 4:3 tablet (1024x768)" — see that doc's Layout
// section. None of those values scale with screen size on their own, so the same
// absolute dp/px numbers that fit a tablet read as proportionally much larger (or, on a
// small touchscreen panel, too large to fit) elsewhere.
//
// Only the pure, platform-free part lives here: the reference dimensions and the actual
// scale computation. Each consuming project keeps its own `useUiScale()` hook (what to
// measure *against* genuinely differs per platform — the tablet reads the whole device
// screen via react-native's useWindowDimensions(), since its video is full-bleed; a
// browser-based UI instead measures its own bounded video-stage element via a
// ResizeObserver, since it also has a nav bar and isn't full-bleed) that calls
// computeScale() with whatever width/height it measured.
//
// Hairline borders (borderWidth) and gesture-recognition thresholds (drag distance
// comparisons) are deliberately left unscaled by convention elsewhere in consuming
// projects — those track physical touch precision and a crisp 1px line, not the
// design's screen-relative layout, so don't add scale to them by reflex when touching
// this again.

export const REFERENCE_WIDTH = 1024;
export const REFERENCE_HEIGHT = 768;

export function computeScale(width: number, height: number): number {
  const landscapeWidth = Math.max(width, height);
  const landscapeHeight = Math.min(width, height);
  return Math.min(landscapeWidth / REFERENCE_WIDTH, landscapeHeight / REFERENCE_HEIGHT);
}

export function s(value: number, scale: number): number {
  return Math.round(value * scale);
}
