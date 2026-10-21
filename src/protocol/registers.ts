// Named system-register map for command 72 (read_register/write_register, see
// commands.ts and CommandQueue.readRegister/writeRegister).
//
// Primary source: the actual CC8HD firmware's SystemSettings_s/SystemStatus_s struct
// definitions (docs/CC8/control.h in rodxa — `#pragma pack(push,2)`, confirming these are
// genuinely 2-byte/word-packed structs, not just a convention). Cross-checked against the
// original Python reference's mod/cc8hdregisters.py (whose own header comment flags it as
// auto-generated and possibly stale: "just cause the register is there doesn't mean you
// should touch it... might not even be up to date") — where the two disagreed, control.h
// won: it's the real struct the firmware compiles, not a hand-maintained Python mirror of
// it. Five settings fields and three status fields were renamed on that basis (address
// unchanged, name corrected): settings 99 VidCrop->UV_QE_frac, 123 setpointArea->UVDilate,
// 124 UVRadiometryThreshold->OverTemperature, 125 IR_AGC->Uem_Cal, 128 WiFiEn->Uem_Gain;
// status 47 TAU_Present->IRDevice, 79 resv1->IRCalFocus, 97 SetPlx->PXMode (this last one
// also confirms PXMode is literally px_mode's — commands.ts id 85 — backing register).
// Status addresses 127-133 (UEM0, UEM1, WebUVActive, WebIRActive, UemBusy, Count_N,
// UVAutoNUC) don't appear in the Python dict at all — added from control.h, which defines
// seven more fields past where the Python table stopped.
//
// Confirmed from control.c: `Version` (address 0 in both tables) is each struct's own
// schema-version constant (SETTINGS_VERSION=6, STATUS_VERSION=1 in control.h, assigned at
// system_defaults()) — NOT related to the `version` numbered command's firmware build
// timestamp, despite the name collision.
//
// Overlapping names between the two maps (Version, Size, SerialNo, UserCount, CamModel,
// MenuMode, BGCancel, Env) are kept verbatim — see getRegisterAddress for how collisions
// resolve.
//
// Addresses are word indices (2-byte units), not byte offsets — unrelated to blockaddr's
// byte-addressed scheme (commands.ts ids 37-39), despite both existing to inspect "system
// registers". Entries marked `array[n]` below span that many consecutive word addresses
// starting at the given one; only the start address is listed, matching the source. The
// +0x2000 status-address offset in getRegisterAddress is still sourced only from the
// Python reference's read_register() — control.c/control.h (the subsystem logic, not the
// TCP command dispatcher) don't contain that resolution code, so it remains unconfirmed
// from firmware source.

/** SystemSettings fields — persisted configuration (word-indexed). */
export const SYSTEM_SETTINGS_REGISTERS: Readonly<Record<string, number>> = {
  Version: 0,
  Size: 1,
  SerialNo: 2,
  ProfileNo: 3,
  MenuMode: 4,
  UVViewmode: 5,
  UVGain: 6,
  UVFocusCal: 7, // array[2][2][2], spans 7-14
  IRFocusCal: 15, // array[2][2][2], spans 15-22
  LL_On: 23,
  VE_On: 24,
  SL_On: 25,
  AF_On: 26,
  CamModel: 27,
  MACaddr: 28,
  UserCount: 29,
  UVIntGain: 30,
  UVIntFrames: 31,
  UV_QE: 32,
  UV_mulA: 33,
  UV_addB: 34,
  MirrorFront: 35,
  MirrorBack: 36,
  UVFilterPos: 37, // array[2], spans 37-38
  UVFilterUp: 39,
  IRFilterUp: 40,
  POS_OFFS_X: 41, // array[2][ZOOMPOINTS_VIS], spans 41-48
  POS_OFFS_Y: 49, // array[2][ZOOMPOINTS_VIS], spans 49-56
  OSD_Alpha: 57,
  Timezone: 58,
  IP01: 59,
  IP23: 60,
  Net01: 61,
  Net23: 62,
  Mask01: 63,
  Mask23: 64,
  ZOOM_CAL: 65, // array[3][ZOOMPOINTS_VIS], spans 65-76
  BGCancel: 77,
  UVColor: 78,
  UVX_HUE: 79,
  UVX_GAIN: 80,
  UVX_OFFS: 81,
  UVX_ALPHA: 82,
  UVC_THR: 83,
  UVX_THR: 84,
  DigZoom: 85,
  UVRawLen: 86,
  IRPalette: 87,
  IREmiss: 88,
  SonyFocus: 89,
  UVFocus: 90,
  CalDate: 91,
  CalTime: 92,
  WarDate: 93,
  Env: 94, // array[5], spans 94-98
  UV_QE_frac: 99, // x / 32768, per control.h
  TRefl: 100,
  ROI: 101,
  ShowGPS: 102,
  recVolume: 103,
  TableNo: 104,
  UVFade: 105,
  IRmMode: 106,
  IRSyncEn: 107,
  IR_AS: 108,
  IR_Gain: 109,
  IR_Alpha: 110,
  IR_Enable: 111,
  UV_showcen: 112,
  PWMMap: 113, // array[4], spans 113-116
  PWMMapHi: 117,
  IR_Fahrenheit: 118,
  TMS_recMode: 119,
  OSDMode: 120,
  VS60Hz: 121,
  SonyZoom: 122,
  UVDilate: 123,
  OverTemperature: 124,
  Uem_Cal: 125,
  WD_On: 126,
  DF_On: 127,
  Uem_Gain: 128,
  IR_Histogram: 129,
  CRC: 130,
};

/** SystemStatus fields — live/volatile telemetry (word-indexed, +0x2000 when resolved — see getRegisterAddress). */
export const SYSTEM_STATUS_REGISTERS: Readonly<Record<string, number>> = {
  Version: 0,
  Size: 1,
  TempFpga: 2,
  Temp3V3: 3,
  Temp5V: 4,
  TempVsup: 5,
  ROI_X: 6,
  ROI_Y: 7,
  ROI_W: 8,
  ROI_H: 9,
  UVX_RGB: 10, // 32 bits, spans 10-11
  AVR_IO: 12,
  ROI_EN: 13,
  SerialNo: 14,
  UVCount: 15,
  SonyLock: 16,
  AdjustTime: 17,
  TMSReady: 18,
  TMSRecMode: 19,
  TMSRecState: 20,
  TMSRemoteOn: 21,
  MirrorUp: 22,
  BGCancel: 23,
  xGPS_ONx: 24,
  UVX_OFFS_X: 25,
  UVX_OFFS_Y: 26,
  xSonyZoomResv: 27,
  UVZoom: 28,
  IRZoom: 29,
  SystemFlags0: 30,
  SystemFlags1: 31,
  UVGainVal: 32,
  IR_Focus: 33,
  IR_minflux: 34,
  IRLow: 35,
  IRHigh: 36,
  Sony_AE: 37,
  CalIdx: 38,
  IR_PWM_EN: 39,
  FanOn: 40,
  LaserOn: 41,
  LightOn: 42,
  LightPWM: 43,
  PWMCount: 44,
  Quickzoom: 45,
  UV_Enable: 46,
  IRDevice: 47,
  GotPIN: 48,
  PSUStatus: 49,
  LonDeg: 50,
  LonmMin: 51,
  LatDeg: 52,
  LatmMin: 53,
  MainVideo: 54,
  PlanckR0: 55,
  PlanckR1: 56,
  PlanckB0: 57,
  PlanckB1: 58,
  PlanckF0: 59,
  PlanckF1: 60,
  PlanckO0: 61,
  PlanckO1: 62,
  IRSpotTemp: 63, // int, spans 63-64
  MenuMode: 65,
  IRDLevel: 66,
  SplashOn: 67,
  NoSelect: 68,
  VisPhase: 69,
  UVMirror: 70,
  IRMeanTemp: 71,
  CamModel: 72,
  HideBat: 73,
  UARTMode: 74,
  TMSBootmon: 75,
  DroneIF: 76,
  SonyType: 77,
  SonyIris: 78,
  IRCalFocus: 79,
  VMI_xpos0: 80,
  VMI_xpos1: 81,
  VMI_ypos0: 82,
  VMI_ypos1: 83,
  ShowPWM: 84,
  UserCount: 85,
  QSysID: 86,
  QSysDate: 87,
  QSysTime: 88,
  HD_Upscale: 89,
  MMCReady: 90,
  f_Idle: 91,
  GPS_Extern: 92,
  BarValue: 93,
  LCDBrightness: 94,
  VS_HZ: 95,
  PSU_Vbat: 96,
  PXMode: 97, // parallax mode 0,1,2,3: none/manual/auto — backs commands.ts's px_mode (id 85)
  LCDMode: 98,
  Baddr0: 99,
  Baddr1: 100,
  Blen: 101,
  ISO_color: 102,
  ISO_gain: 103,
  ISO_low: 104,
  ISO_high: 105,
  ISO_en: 106,
  uv_lock: 107,
  uv_xpos: 108,
  uv_ypos: 109,
  Env: 110, // array[5], spans 110-114
  SDerror: 115,
  UVGainSetting: 116,
  Lon_nmin_l: 117,
  Lon_nmin_h: 118,
  Lat_nmin_l: 119,
  Lat_nmin_h: 120,
  Altitude: 121,
  Dir_track: 122,
  Dir_pan: 123,
  Dir_tilt: 124,
  Dir_roll: 125,
  UVRawStart: 126,
  UEM0: 127,
  UEM1: 128,
  WebUVActive: 129,
  WebIRActive: 130,
  UemBusy: 131, // b0=busy, b1=remote
  Count_N: 132,
  UVAutoNUC: 133, // seconds*2
};

/** Added to a SYSTEM_STATUS_REGISTERS entry to get its real register address. */
export const SYSTEM_STATUS_ADDRESS_OFFSET = 0x2000;

/**
 * Resolves a named register (case-insensitive) to its numeric address, reproducing the
 * Python reference's read_register(register: str) lookup exactly: it scans
 * system_status first (offsetting by SYSTEM_STATUS_ADDRESS_OFFSET) and then
 * system_settings, letting the second scan's match unconditionally overwrite the first.
 * So a name present in both maps (Version, Size, SerialNo, UserCount, CamModel, MenuMode,
 * BGCancel, Env) always resolves to its SETTINGS address — not verified as intentional in
 * the original, just faithfully reproduced rather than "fixed" without evidence.
 *
 * Returns undefined if no register by that name exists in either map.
 */
export function getRegisterAddress(name: string): number | undefined {
  const lower = name.toLowerCase();
  let address: number | undefined;
  for (const [rg, adr] of Object.entries(SYSTEM_STATUS_REGISTERS)) {
    if (rg.toLowerCase() === lower) address = adr + SYSTEM_STATUS_ADDRESS_OFFSET;
  }
  for (const [rg, adr] of Object.entries(SYSTEM_SETTINGS_REGISTERS)) {
    if (rg.toLowerCase() === lower) address = adr;
  }
  return address;
}
