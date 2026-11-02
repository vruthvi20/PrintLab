export type RequestStatus = 
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_changes'
  | 'scheduled'
  | 'printing'
  | 'completed'
  | 'ready'
  | 'collected';

export type PrinterStatusCode = 'available' | 'printing' | 'maintenance' | 'offline';

export type BookingStatus = 'scheduled' | 'printing' | 'completed' | 'failed' | 'cancelled';

export interface ModelDimensions {
  x: number; // width in mm
  y: number; // depth in mm
  z: number; // height in mm
}

export interface PrintRequest {
  id: string;
  trackingCode: string;
  fullName: string;
  grade: string;
  section: string;
  email: string;
  projectTitle: string;
  description: string;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  fileFormat: 'stl' | 'obj' | '3mf';
  dimensions: ModelDimensions;
  scale: number;
  rotation?: { x: number; y: number; z: number };
  volumeCm3: number;
  material: string;
  color: string;
  infill: number;
  quantity: number;
  preferredWindow: string;
  estimatedMinutes: number;
  actualMinutes?: number | null;
  status: RequestStatus;
  adminComment?: string;
  rejectionReason?: string;
  changeRequestReason?: string;
  failureReason?: string;
  scheduledSlot?: {
    start: string;
    end: string;
    bookingId?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface Booking {
  id: string;
  requestId: string;
  trackingCode: string;
  projectTitle: string;
  studentName: string;
  studentEmail?: string;
  material: string;
  color: string;
  startTime: string; // ISO 8601 string
  endTime: string;   // ISO 8601 string
  durationMinutes: number;
  status: BookingStatus;
  failureReason?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PrinterStatus {
  status: PrinterStatusCode;
  currentJobId?: string | null;
  currentJobTitle?: string | null;
  currentStudentName?: string | null;
  maintenanceReason?: string | null;
  expectedReturnDate?: string | null;
  updatedAt: string;
  updatedBy: string;
}

export interface FilamentItem {
  id: string;
  material: 'PLA' | 'PETG' | 'TPU' | string;
  color: string;
  hex: string;
  stockGrams: number;
  lowStockThresholdGrams: number;
  isAvailable: boolean;
}

export interface LabSettings {
  labHours: {
    start: string; // "08:30"
    end: string;   // "16:30"
    openDays: number[]; // [1, 2, 3, 4, 5] (Monday to Friday)
  };
  bufferMinutes: number; // default 15
  maxPrintHours: number; // default 8
  maxActiveRequestsPerStudent: number; // default 2
  holidays: string[]; // ['2026-11-26', '2026-12-25', ...]
  updatedAt?: string;
}

export interface AdminUser {
  uid: string;
  email: string;
  role: 'admin' | 'superadmin';
  addedAt: string;
  addedBy: string;
}

export interface AdminInvitation {
  id: string;
  email: string;
  token: string;
  role: 'admin';
  status: 'pending' | 'accepted' | 'revoked';
  invitedBy: string;
  createdAt: string;
  expiresAt: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  details: string;
  adminEmail: string;
  timestamp: string;
  entityId?: string;
  entityType?: string;
}

export interface AnalyticsSummary {
  blockedOversizeCount: number;
  lastUpdated: string;
}
