export interface Doors {
  fl: boolean; fr: boolean; rl: boolean; rr: boolean; trunk: boolean;
}

export interface VehicleState {
  vin: string;
  gateway: string;
  online: boolean;
  capturedAt: number;
  speed: number | null;
  gear: string | null;
  ignition: boolean | null;
  engineOn: boolean | null;
  locked: boolean | null;
  doors: Doors | null;
  windows: { fl: number; fr: number; rl: number; rr: number } | null;
  climate: { on: boolean | null; targetTemp: number | null; cabinTemp: number | null; coolantTemp?: number } | null;
  fuel: { level: number | null; rangeKm: number | null } | null;
  battery: { voltage: number | null } | null;
  odometer: number | null;
  tirePressure: { fl: number; fr: number; rl: number; rr: number } | null;
  position: { lat: number; lng: number; heading: number; address: string } | null;
  outsideTemp: number | null;
  dtc: string[];
  today: { distanceKm: number; trips: number; minutes: number } | null;
  flashedAt?: number | null;
}

export type CommandStatus = 'PENDING' | 'SENT' | 'ACKED' | 'FAILED' | 'EXPIRED' | 'REJECTED';

export interface CommandRecord {
  id: string;
  vin: string;
  type: string;
  params: Record<string, unknown>;
  status: CommandStatus;
  issuedBy: string;
  createdAt: number;
  ackedAt: number | null;
  failCode: string | null;
  failReason: string | null;
}

export interface Vehicle {
  vin: string;
  model: string;
  plate: string;
  gateway: string;
  online: boolean;
  lastSeenAt: number;
}

export interface Capabilities {
  readable: string[];
  controllable: string[];
  hasServerAck: boolean;
}

export interface Trip {
  id: string;
  startAt: number;
  endAt: number;
  distanceKm: number;
  fuelL: number;
  avgSpeed: number;
  maxSpeed: number;
  hardAccel: number;
  hardBrake: number;
  startAddr: string;
  endAddr: string;
  durationMin: number;
  track?: { t: number; lat: number; lng: number; spd: number }[];
}

export interface AlertItem {
  id: string;
  type: string;
  level: 'warn' | 'info' | 'danger';
  title: string;
  detail: string;
  createdAt: number;
  resolved: boolean;
}

export interface Stats {
  today: { trips: number; distanceKm: number; avgSpeed: number; harshCount: number };
  week: {
    trips: number; distanceKm: number; fuelL: number; per100km: number;
    hardAccel: number; hardBrake: number; drivingScore: number;
  };
}

export interface SnapshotFrame {
  ch: string;
  width: number;
  height: number;
  bytes: number;
}

export interface Snapshot {
  id: string;
  vin: string;
  capturedAt: number;
  requestedBy: string;
  channels: SnapshotFrame[];
}

export type WsEvent =
  | { type: 'ready'; at: number }
  | { type: 'vehicle.state'; vin: string; payload: VehicleState }
  | { type: 'command.status'; vin: string; payload: CommandRecord }
  | { type: 'snapshot.ready'; vin: string; payload: Snapshot };
