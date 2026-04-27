export interface GeoPoint {
  type: string;
  coordinates: [number, number] | number[];
}

export interface BusStop {
  busstopId: number;
  street1: string;
  street2: string;
  street1Id: number;
  street2Id: number;
  location: GeoPoint;
}

export interface BusLine {
  line: string;
  lineId: string;
}

export interface LineVariant {
  lineVariantId: number;
  line: string;
  lineId: string;
  origin: string;
  destination: string;
  subline: string;
  special: boolean;
}

export interface UpcomingBus {
  lineVariantId: number;
  line: string;
  lineId: string;
  origin: string;
  destination: string;
  subline: string;
  special: boolean;
}

export interface Bus {
  id: string;
  vehicleType: string;
  timestamp: string;
  location: GeoPoint;
  companyName: string;
  line: string;
  lineId?: string | number | null;
  lineVariantId: string | number | null;
  origin: string;
  destination: string;
  subline: string;
  special: boolean;
  vehicleIdentificationNumber: string;
  access: string;
  thermalConfort: string;
  emissions: string;
}

export interface UpcomingBusWithStop extends UpcomingBus {
  busStop: BusStop | null;
}

export interface UpcomingBusesQuery {
  lines: string[];
  lineVariantIds?: number[];
  amountperline?: number;
  format?: string;
}

export interface BusesQuery {
  company?: string;
  lineVariantIds?: number[];
  busId?: number;
  busstopId?: number;
  lines?: string[];
  format?: string;
}
