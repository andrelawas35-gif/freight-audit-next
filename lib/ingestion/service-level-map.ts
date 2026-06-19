/*
  lib/ingestion/service-level-map.ts

  Carrier-specific service codes → standard service level strings.
  These standard strings are what your SLA rule engine checks against.
*/

// [carrier_scac][carrier_code] → standard label
const SERVICE_MAP: Record<string, Record<string, string>> = {
  UPSN: {
    '01': 'Next Day Air',
    '02': '2-Day',
    '03': 'Ground',
    '12': '3-Day',
    '13': 'Next Day Air Saver',
    '14': 'Next Day Air Early',
    '59': '2-Day AM',
    '65': 'SurePost',
  },
  FDXG: {
    'GROUNDHOMEDELIVERY': 'Ground',
    'FEDEX_GROUND':       'Ground',
    'SMART_POST':         'Ground',
  },
  FDXE: {
    'FIRST_OVERNIGHT':      'Next Day Air',
    'PRIORITY_OVERNIGHT':   'Next Day Air',
    'STANDARD_OVERNIGHT':   'Next Day Air Saver',
    'FEDEX_2_DAY_AM':       '2-Day AM',
    'FEDEX_2_DAY':          '2-Day',
    'FEDEX_EXPRESS_SAVER':  '3-Day',
  },
  // LTL carriers — common service codes
  _LTL: {
    'STD':   'LTL Standard',
    'GUAR':  'LTL Guaranteed',
    'AM':    'LTL Guaranteed AM',
    'EXPED': 'LTL Expedited',
  },
};

export function standardizeServiceLevel(scac: string, carrierCode: string): string {
  const upper = carrierCode.toUpperCase();
  return (
    SERVICE_MAP[scac]?.[upper] ??
    SERVICE_MAP[scac]?.[carrierCode] ??   // some codes are mixed case
    SERVICE_MAP['_LTL']?.[upper] ??
    carrierCode                            // fall back to raw code if unknown
  );
}
