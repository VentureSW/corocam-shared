// Command dictionary for the CC8HD camera protocol.
// Originally ported 1:1 (including the two duplicate-id rows) from mod/cc8hdcommands.py
// so it stays easy to diff against the source. Do not deduplicate ids here — see
// getCommandByName, which is the only supported lookup (never look up by id).
//
// This is the merged, canonical table: union of every row two independent consumers
// (rodxa and the CoroCam tablet app) had accumulated separately before this package
// existed — gps_data(66)/gimbal_att(67) and ser_ack(88)/tcp_ack(137)/wmark_pos(87) each
// started out in only one of the two, found by diffing the two tables directly.

import type { ArgType, CommandAccess, CommandDef } from './types';

type RawRow = readonly [id: number, name: string, argBytes: number, argTypeNum: 0 | 1 | 2 | 3, accessNum: 0 | 1 | 2 | 3];

// [ cmdnr, cmdname, nrargbytes, argtype, cmdtype ]
// argtype -> 0=int 1=string 2=data 3=filelist
// cmdtype -> 0=NONE(future) 1=GET 2=SET 3=BOTH
const RAW_COMMANDS: readonly RawRow[] = [
  [0, 'null', 1, 0, 3],
  [1, 'model', 4, 0, 1],
  [2, 'version', 4, 0, 1],
  [3, 'keys', 4, 2, 2],
  [4, 'serial', 2, 0, 1],
  [5, 'spot', 1, 0, 3],
  [6, 'laser', 1, 0, 3],
  [7, 'uvgain', 2, 0, 3],
  [8, 'izoom', 1, 0, 3],
  [9, 'vzoom', 2, 0, 3],
  [10, 'visfocus', 2, 0, 3],
  [11, 'uvfocus', 2, 0, 3],
  [12, 'fmode', 1, 0, 3],
  [13, 'uvpalette', 1, 0, 3],
  [14, 'uvhue', 2, 0, 3],
  [15, 'uvalpha', 1, 0, 3], // NB: when the uv alpha reaches 0, the uv will automatically disable
  [16, 'uvfilter', 1, 0, 3],
  [17, 'UVNUC', 2, 0, 3],
  [18, 'UVThr', 1, 0, 3],
  [19, 'UVxgain', 2, 0, 3],
  [20, 'UVCount', 2, 0, 1],
  [21, 'ROI', 1, 0, 3],
  [22, 'LL', 1, 0, 3],
  [23, 'BL', 1, 0, 3],
  [24, 'DF', 1, 0, 3],
  [25, 'WD', 1, 0, 3],
  [26, 'baud', 4, 0, 3],
  [27, 'profile', 1, 0, 3],
  [28, 'savprof', 1, 0, 3],
  [29, 'ISN', 2, 0, 3],
  [30, 'record', 1, 0, 3],
  [31, 'photo', 1, 0, 3],
  [32, 'time', 4, 0, 3],
  [33, 'gpsview', 1, 0, 3],
  [34, 'OSDen', 1, 0, 3],
  [35, 'report', 1, 0, 3],
  [36, '60hz', 1, 0, 3],
  [37, 'blockaddr', 4, 0, 3],
  [38, 'blocklen', 1, 0, 3],
  [39, 'blockdata', -1, 2, 1],
  [40, 'restart', 1, 0, 3],
  [41, 'ir_mode', 1, 0, 3],
  [42, 'ir_tlo', 2, 0, 3],
  [43, 'ir_thi', 2, 0, 3],
  [44, 'ir_palette', 1, 0, 3],
  [45, 'ir_focus', 2, 0, 3],
  [46, 'ir_emis', 2, 0, 3],
  [47, 'ir_trefl', 2, 0, 3],
  [48, 'ir_gain', 1, 0, 3],
  [49, 'ir_tsel', 1, 0, 3],
  [50, 'iso_tlo', 2, 0, 3],
  [51, 'iso_thi', 2, 0, 3],
  [52, 'iso_color', 1, 0, 3],
  [53, 'env_dist', 2, 0, 3],
  [54, 'env_humid', 2, 0, 3],
  [55, 'env_temp', 2, 0, 3],
  [56, 'env_pres', 2, 0, 3],
  [57, 'env_wind', 2, 0, 3],
  [58, 'vis_opacity', 1, 0, 3], // changed from vis_fade
  [59, 'uv_opacity', 1, 0, 3], // uv_fade
  [60, 'ir_opacity', 1, 0, 3], // ir_fade
  [61, 'menu_opacity', 1, 0, 3], // menu_fade
  [62, 'exposure', 1, 0, 3],
  [65, 'ir_enable', 1, 0, 3],
  // format not documented in spec (CC8HD-Remote v1.0) — found only in the tablet app's
  // table, never in rodxa's; no current call sites either side reference these.
  [66, 'gps_data', -1, 2, 3],
  [67, 'gimbal_att', -1, 2, 2],
  [68, 'roi_pos', 8, 0, 3],
  [69, 'ir_values', 14, 0, 3],
  [70, 'echo', -1, 0, 0],
  [71, 'ucf_uvraw', 1, 0, 3],
  // write_register's 4-byte arg packs two 2-byte LE fields: address then value
  // (low 16 bits = address, high 16 bits = value, per encodeArgs's plain LE32 encoding —
  // see CommandQueue.writeRegister). read_register's GET reply is a 2-byte value; unlike
  // every other command, its GET request itself also carries an argument (the 2-byte
  // register address) — see CommandQueue.get's optional `args` param and
  // CommandQueue.readRegister. Both confirmed against the original Python reference
  // (CC8_INTERFACE.py's read_register/change_network_config), not the PDF spec, which
  // only says "Query arbitrary system registers... not documented here."
  [72, 'write_register', 4, 0, 2],
  [72, 'read_register', 2, 0, 1],
  [73, 'uem_distance', 2, 0, 3], // was quver
  [74, 'uem_status', 1, 0, 1], // was quver
  [75, 'uem_result', 4, 0, 1], // was quver
  [76, 'qresv', 1, 0, 0], // was quver
  [77, 'qresv', 1, 0, 0], // was quver
  [78, 'qresv', 1, 0, 0], // was quver
  [79, 'qresv', 1, 0, 0], // was quver
  [80, 'web_uvrules', 40, 2, 2],
  [81, 'web_metrics', 72, 2, 1],
  [82, 'web_irrules', 40, 2, 2],
  [83, 'ROIView', 1, 0, 3],
  [84, 'uv_enable', 1, 0, 3],
  [85, 'px_mode', 1, 0, 3],
  [86, 'watchdog', 2, 0, 3],
  [87, 'wmark_pos', 4, 0, 3],
  // The serial-port (RS-232/RS-485) equivalent of tcp_ack below — found only in rodxa's
  // table. Not useful over a TCP:7008-only connection, included for completeness.
  [88, 'ser_ack', 1, 0, 3],
  [128, 'folder', -1, 1, 3],
  [129, 'filelist', -1, 3, 1],
  [130, 'filename', -1, 1, 3],
  [131, 'filestatus', 1, 0, 3],
  [132, 'filetransfer', -1, 2, 3],
  [133, 'file_exist', 1, 0, 1],
  [133, 'file_remove', 1, 0, 2],
  [134, 'fileselect', 1, 0, 3],
  [135, 'crc32', 4, 0, 1],
  [136, 'fileblocksize', 4, 0, 3],
  // The TCP equivalent of ser_ack above — once enabled, the camera spontaneously sends
  // an ack packet (id=0xC8, cmd=0x89) after completing any SET, whose packet counter
  // (not command number) matches the original SET's counter - that's the correlation
  // mechanism, not the command number in the ack packet itself. See commandQueue.ts's
  // onAck/recentSets.
  [137, 'tcp_ack', 1, 0, 3],
] as const;

const ARG_TYPES: readonly ArgType[] = ['int', 'string', 'data', 'filelist'];
const ACCESS: readonly CommandAccess[] = ['none', 'get', 'set', 'both'];

const NOT_DOCUMENTED = 'Not documented in the protocol spec.';

// Descriptions transcribed from the CC8HD-Remote protocol spec (secs 4 "Command List" +
// 5 "Command Description"), condensed to one line each. Keyed by name (not id) so this
// stays independent of RAW_COMMANDS' row order/duplicate ids. Commands no available spec
// covers are left as NOT_DOCUMENTED rather than guessed at from the name alone.
const DESCRIPTIONS: Readonly<Record<string, string>> = {
  null: 'No-op, used to verify the data link. Any argument value has no effect.',
  model: 'Camera model code: 6100 = CoroCam6HD, 7100 = CoroCam7HD, 8300 = CoroCam8HD.',
  version: "Time-stamp of the camera's software build, as 32-bit Unix time.",
  keys: 'External keyboard interface — simulates a physical key press (key number, mask, state). Write-only.',
  serial: "The camera's unique serial number.",
  spot: 'Spotlight brightness, 0 (max) to 255 (min).',
  laser: 'Laser pointer: 0 = off, 1-255 = on.',
  uvgain: 'Analog gain on the UV image intensifier, 0x0000 (0%) to 0x0FFF (100%).',
  izoom: 'Discrete zoom step: 0=0.5x, 1=1x, 2=2x, 3=4x, 4=6x, 5=8x, 6=12x.',
  vzoom:
    'Variable (continuous) zoom, raw 0-65535 per the spec field width — verified real range is 0-32768.',
  visfocus: 'Focus the visible channel: 0x0000 = far, 0xFFFF = near.',
  uvfocus: 'Focus the UV channel: 0x0000 = far, 0x03FF = near.',
  fmode: 'Focus mode: 0 = full manual, 1 = AF (visible auto), 2 = SF (UV follows visible), 3 = AF+SF.',
  uvpalette: 'UV overlay colour preset: 0=Red, 1=Yellow, 2=Blue, 3=Green, 4=White, 5=Black, 6=Custom hue (see uvhue).',
  uvhue: 'Custom UV overlay hue when uvpalette=6, 0x0000 (red) through 0x03E7 (red again, via blue/green).',
  uvalpha: 'UV overlay transparency: 0 = colour tint only, 255 = fully opaque (UV replaces visible).',
  uvfilter: 'UV sunblind filter: 0 = down (daylight mode), 1-255 = up (night mode).',
  UVNUC:
    'Triggers a UV non-uniformity correction using this many exposure fields (0-1=disable, 2-64=field count; 2 fields per frame).',
  UVThr: 'UV channel threshold above which the UV overlay activates, usable range 0x10-0xEB.',
  UVxgain: 'Digital gain of the UV channel, 0x0002-0x03FF (0-100%).',
  UVCount: 'Read-only: the UV detection counter.',
  // Corrected 2026-10-19: live-tested against a real CoroCam7 (model 7300) and the
  // "Sampler Size" manual page - not the 3-value enum this used to claim.
  ROI: 'UV region-of-interest (sampler) window size, 1-10 (manual-documented range; the camera accepted values outside it too in testing).',
  LL: 'Low Light mode on the visible channel — desaturates the image for better contrast in low light.',
  BL: 'Backlight compensation on the visible channel — dims bright backgrounds to reveal darker foreground detail.',
  DF: 'Defog mode on the visible channel — sharpens the image in hazy conditions.',
  WD: 'Wide Dynamic Range on the visible channel — evens out scenes with both bright and dark areas.',
  baud:
    'RS-485 baud rate (bps). Common values: 9600, 19200, 38400, 57600, 115200 — the applied rate may not exactly match the request.',
  profile: "Load one of 10 saved user profiles (0-10); falls back to factory defaults if that slot wasn't saved.",
  savprof: 'Save the current camera configuration into one of 10 profile slots (0-10).',
  ISN: 'Image Serial Number — prefixes recording file names on the SD card. Valid 0-0x3E7 (999); out-of-range clamps to 999.',
  record: 'Start (1-255) or stop (0) video recording to the SD card. GET reports DSP status bits (recording/busy/SD not ready).',
  photo: 'Capture a still JPEG photo to the SD card: 0 = no-op, 1-255 = take photo.',
  time: "Camera's clock, as 32-bit Unix time (seconds since 1 Jan 1970).",
  gpsview: 'Show (1-255) or hide (0) GPS coordinates on the on-screen display.',
  OSDen: 'Historic — not operational, do not use. Was: enable/disable the on-screen display on recordings and HDMI output.',
  report: 'Compact report-mode on-screen display: 0 = normal, 1-255 = compact.',
  '60hz': 'Video frame refresh rate: 0 = 50Hz, 1-255 = 60Hz.',
  blockaddr: 'Register address to read with blocklen/blockdata (0x00000000=SystemSettings, 0x00010000=SystemStatus).',
  blocklen: 'Number of register bytes to read via blockdata, up to 254. Auto-advances blockaddr after each read.',
  blockdata: 'Read-only: returns blocklen bytes of internal register data starting at blockaddr.',
  restart: 'Reboot the camera. Argument of 1 triggers the restart.',
  ir_mode: 'Infrared auto-span mode: 0 = single auto, 1 = continuous auto.',
  ir_tlo: 'Lower edge of the infrared temperature measurement range (16-bit signed).',
  ir_thi: 'Upper edge of the infrared temperature measurement range (16-bit signed).',
  ir_palette: 'Infrared palette selection, 0-6.',
  ir_focus: 'Infrared focus value (16-bit unsigned).',
  ir_emis: 'Infrared emissivity setting (16-bit signed).',
  ir_trefl: 'Infrared reflected-temperature setting (16-bit signed).',
  ir_gain: 'Infrared gain setting (8-bit).',
  ir_tsel: 'Infrared measurement display mode: 0 = minimum, 1 = mean, 2 = maximum temperature.',
  iso_tlo: 'Lower value of the infrared isotherm overlay (16-bit).',
  iso_thi: 'Upper value of the infrared isotherm overlay (16-bit).',
  iso_color: 'Infrared isotherm overlay colour number (8-bit).',
  env_dist: 'Environment setting: measurement distance (16-bit unsigned) — used for IR temperature compensation.',
  env_humid: 'Environment setting: humidity (16-bit unsigned) — used for IR temperature compensation.',
  env_temp: 'Environment setting: ambient temperature (16-bit unsigned) — used for IR temperature compensation.',
  env_pres: 'Environment setting: atmospheric pressure (16-bit unsigned) — used for IR temperature compensation.',
  env_wind: 'Environment setting: wind speed (16-bit unsigned) — used for IR temperature compensation.',
  vis_opacity: 'Visible-channel image opacity (8-bit).',
  uv_opacity: 'UV-channel image opacity (8-bit).',
  ir_opacity: 'Infrared-channel image opacity (8-bit).',
  menu_opacity: 'Menu overlay opacity (8-bit).',
  folder: 'Working folder path on the SD card, as a null-terminated ASCII string.',
  filelist: 'Read-only: list of files in the current working folder (custom binary format, 64-byte records).',
  filename: 'File name for file operations, as a null-terminated ASCII string.',
  filestatus:
    'Open (for read/write) or close a file: 0=close, 1=open for reading, 2=open for writing. GET reports the current mode; 0 may mean a prior open failed.',
  filetransfer:
    'Read or write file data in blocks (block size set via fileblocksize); successive blocks concatenate to form the whole file.',
  file_exist: 'Read-only: whether the named file exists in the working folder (1=yes, 0=no).',
  file_remove: 'Delete the named file from the working folder.',
  fileselect: 'Select a file by its index in the filelist result, instead of setting filename directly.',
  crc32: 'Read-only: CCITT 32-bit CRC of the most recently transferred file data.',
  fileblocksize: 'Block size (bytes) used for file transfers (filetransfer).',
  wmark_pos:
    'Top-left X/Y coordinates (relative to a 1280x720 screen) to render the previously-loaded watermark image.',
  ser_ack:
    'Serial port (RS-232/RS-485) only - enables the camera sending an unsolicited acknowledge packet after completing a SET. Not applicable over TCP; see tcp_ack.',
  tcp_ack:
    'TCP/IP equivalent of ser_ack - enables the camera sending an unsolicited acknowledge packet after completing a SET, whose packet counter matches the original SET.',
};

export const COMMANDS: readonly CommandDef[] = RAW_COMMANDS.map(([id, name, argBytes, t, a]) => ({
  id,
  name,
  argBytes,
  argType: ARG_TYPES[t],
  access: ACCESS[a],
  description: DESCRIPTIONS[name] ?? NOT_DOCUMENTED,
}));

export const COMMANDS_BY_NAME: ReadonlyMap<string, CommandDef> = new Map(COMMANDS.map((c) => [c.name, c]));

export function getCommandByName(name: string): CommandDef {
  const def = COMMANDS_BY_NAME.get(name);
  if (!def) throw new Error(`Unknown camera command: "${name}"`);
  return def;
}

// Startup fetches only what's needed up front — grow this list as a consumer surfaces
// more state that needs the camera's real value on connect rather than a placeholder
// default. Watch for: 'file'/'block'/'folder' commands (need a second unframed streaming
// read, not implemented here), 'write'/'keys'/'qr'/'crc32' (excluded per the original
// Python startup logic), 'read_register' (CommandQueue.get now supports passing its
// address argument, but a startup sweep has no single address to ask for — it's a
// per-register accessor, not state with one canonical value), and 'ir_values'/'roi_pos'
// (wide ints that would lose precision decoded as a plain JS number).
export const STARTUP_COMMAND_NAMES: readonly string[] = [
  'vzoom',
  'fmode',
  // VIS menu
  'vis_opacity',
  'ISN',
  'visfocus',
  'exposure',
  'WD',
  'BL',
  'DF',
  'LL',
  // UV menu
  'uv_opacity',
  'uvgain',
  'uvfocus',
  'uvpalette',
  'uvhue',
  'UVThr',
  'uvfilter',
  'env_dist',
  'env_humid',
  'env_temp',
  'env_pres',
  'env_wind',
  // IR menu
  'ir_opacity',
  'ir_tlo',
  'ir_thi',
  'ir_focus',
  'ir_palette',
  'ir_emis',
  'ir_trefl',
  'ir_gain',
  'ir_tsel',
  'iso_tlo',
  'iso_thi',
  'iso_color',
  // Device info / Setup
  'serial',
  'version',
  'profile',
  'gpsview',
  '60hz',
  'menu_opacity',
];

// Empty for now — nothing polls a live value yet. Re-add names here once something needs one.
export const POLLED_COMMAND_NAMES: readonly string[] = [];
