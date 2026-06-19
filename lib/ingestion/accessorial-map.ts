/*
  lib/ingestion/accessorial-map.ts

  Carrier-specific accessorial codes → standard code.
  This is the core of Phase 2 normalization.

  Standard codes are what your audit rules and UI speak.
  Add carrier codes here as you onboard new carriers.
*/

export type StandardAccessorial =
  | 'RESIDENTIAL_DELIVERY'
  | 'FUEL_SURCHARGE'
  | 'DELIVERY_AREA_SURCHARGE'
  | 'EXTENDED_DELIVERY_AREA'
  | 'SIGNATURE_REQUIRED'
  | 'ADULT_SIGNATURE'
  | 'ADDRESS_CORRECTION'
  | 'SATURDAY_DELIVERY'
  | 'INSIDE_DELIVERY'
  | 'LIFTGATE_DELIVERY'
  | 'LIFTGATE_PICKUP'
  | 'LIMITED_ACCESS'
  | 'NOTIFY_BEFORE_DELIVERY'
  | 'REDELIVERY'
  | 'RETURN_TO_SENDER'
  | 'OVERSIZE'
  | 'OVERWEIGHT'
  | 'HAZMAT'
  | 'DIM_WEIGHT'
  | 'OTHER';

// [carrier_scac][carrier_code] → standard code
const ACCESSORIAL_MAP: Record<string, Record<string, StandardAccessorial>> = {
  UPSN: {
    RSD:  'RESIDENTIAL_DELIVERY',
    FSC:  'FUEL_SURCHARGE',
    DAS:  'DELIVERY_AREA_SURCHARGE',
    EDAS: 'EXTENDED_DELIVERY_AREA',
    SR:   'SIGNATURE_REQUIRED',
    ASR:  'ADULT_SIGNATURE',
    ADC:  'ADDRESS_CORRECTION',
    SDO:  'SATURDAY_DELIVERY',
    IDL:  'INSIDE_DELIVERY',
    LG:   'LIFTGATE_DELIVERY',
    OVS:  'OVERSIZE',
    HAZ:  'HAZMAT',
    DIM:  'DIM_WEIGHT',
  },
  FDXG: {
    RES:  'RESIDENTIAL_DELIVERY',
    FSC:  'FUEL_SURCHARGE',
    DAS:  'DELIVERY_AREA_SURCHARGE',
    EDAS: 'EXTENDED_DELIVERY_AREA',
    SR:   'SIGNATURE_REQUIRED',
    ASOR: 'ADULT_SIGNATURE',
    AC:   'ADDRESS_CORRECTION',
    SAT:  'SATURDAY_DELIVERY',
    IDL:  'INSIDE_DELIVERY',
    OW:   'OVERWEIGHT',
    HAZ:  'HAZMAT',
    DIM:  'DIM_WEIGHT',
  },
  FDXE: {
    RES:  'RESIDENTIAL_DELIVERY',
    FSC:  'FUEL_SURCHARGE',
    DAS:  'DELIVERY_AREA_SURCHARGE',
    EDAS: 'EXTENDED_DELIVERY_AREA',
    SR:   'SIGNATURE_REQUIRED',
    ASOR: 'ADULT_SIGNATURE',
    AC:   'ADDRESS_CORRECTION',
    SAT:  'SATURDAY_DELIVERY',
    OVW:  'OVERWEIGHT',
    HAZ:  'HAZMAT',
  },
  // Generic LTL codes used by ODFL, SAIA, ESTES, XPOL, etc.
  _LTL: {
    RESDEL:  'RESIDENTIAL_DELIVERY',
    FSC:     'FUEL_SURCHARGE',
    LGDEL:   'LIFTGATE_DELIVERY',
    LGPU:    'LIFTGATE_PICKUP',
    LTDACC:  'LIMITED_ACCESS',
    NOTIFY:  'NOTIFY_BEFORE_DELIVERY',
    INSIDE:  'INSIDE_DELIVERY',
    RDLVY:   'REDELIVERY',
    HAZMAT:  'HAZMAT',
    ADDCOR:  'ADDRESS_CORRECTION',
  },
};

export function standardizeAccessorial(
  scac: string,
  carrierCode: string
): StandardAccessorial {
  const upper = carrierCode.toUpperCase();
  return (
    ACCESSORIAL_MAP[scac]?.[upper] ??
    ACCESSORIAL_MAP['_LTL']?.[upper] ??
    'OTHER'
  );
}
