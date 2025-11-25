export interface AddressQuery {
  city: string;
  street?: string;
  building?: string;
}

export interface RawSchedulePayload {
  source: string;
  fetchedAt: string;
  body: string;
}

export interface NormalizedOutage {
  id: string;
  city: string;
  street: string;
  building: string;
  startTime: string;
  endTime: string;
  sourceUrl: string;
  meta?: Record<string, unknown>;
}

export interface PersistedSchedules {
  lastFetchedAt: string;
  outages: NormalizedOutage[];
  raw: RawSchedulePayload;
}

