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
  className: string;
  timeSlot: string;
}

export interface PersistedSchedules {
  updateDate?: string; // Date from <span class="update">
  queue?: string; // Queue from <div id="group-name">
  address: {
    city: string;
    street: string;
    building: string;
  };
  outages: NormalizedOutage[];
}

