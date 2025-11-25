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
  address: {
    city: string;
    street: string;
    building: string;
    queue?: string; // Queue from <div id="group-name">
  };
  outages: NormalizedOutage[];
}

export interface MergedOutagePeriod {
  startTime: string; // Format: "HH:MM"
  endTime: string; // Format: "HH:MM"
}

export interface ProcessedSchedule {
  updateDate?: string;
  address: {
    city: string;
    street: string;
    building: string;
    queue?: string;
  };
  periods: MergedOutagePeriod[];
}

