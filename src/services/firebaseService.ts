import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  User,
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, auth, storage, handleFirestoreError, OperationType } from '../firebaseConfig';
import {
  PrintRequest,
  Booking,
  PrinterStatus,
  PrinterStatusCode,
  BookingStatus,
  FilamentItem,
  LabSettings,
  AdminUser,
  AdminInvitation,
  ActivityLog,
} from '../types';

// Default Filaments Seed Data (Bambu Lab official materials & colors)
export const DEFAULT_FILAMENTS: FilamentItem[] = [
  { id: 'pla-white', material: 'PLA', color: 'Bambu Jade White', hex: '#FFFFFF', stockGrams: 850, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'pla-charcoal', material: 'PLA', color: 'Matte Charcoal Black', hex: '#2B2D2F', stockGrams: 920, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'pla-orange', material: 'PLA', color: 'Bambu Lava Orange', hex: '#FF5E13', stockGrams: 640, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'pla-teal', material: 'PLA', color: 'STEAM Teal', hex: '#00A396', stockGrams: 420, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'pla-lime', material: 'PLA', color: 'Bambu Lime Green', hex: '#82C91E', stockGrams: 180, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'petg-clear', material: 'PETG', color: 'Translucent Clear', hex: '#E0F2FE', stockGrams: 500, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'petg-black', material: 'PETG', color: 'Industrial Black', hex: '#111827', stockGrams: 750, lowStockThresholdGrams: 200, isAvailable: true },
  { id: 'tpu-red', material: 'TPU', color: 'Flexible Red 95A', hex: '#EF4444', stockGrams: 300, lowStockThresholdGrams: 150, isAvailable: true },
  { id: 'tpu-black', material: 'TPU', color: 'Flexible Black 95A', hex: '#1E293B', stockGrams: 260, lowStockThresholdGrams: 150, isAvailable: true },
];

export const DEFAULT_LAB_SETTINGS: LabSettings = {
  labHours: {
    start: '08:30',
    end: '16:30',
    openDays: [1, 2, 3, 4, 5], // Mon to Fri
  },
  bufferMinutes: 15,
  maxPrintHours: 8,
  maxActiveRequestsPerStudent: 2,
  holidays: ['2026-11-26', '2026-11-27', '2026-12-24', '2026-12-25', '2027-01-01'],
};

// Generate random tracking code like PL-7K2M9
export function generateTrackingCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = 'PL-';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Activity Logging helper
export async function logActivity(action: string, details: string, entityId?: string, entityType?: string) {
  try {
    const userEmail = auth.currentUser?.email || 'System';
    const logId = `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const logDoc = doc(db, 'activityLogs', logId);
    await setDoc(logDoc, {
      action,
      details,
      adminEmail: userEmail,
      timestamp: new Date().toISOString(),
      entityId: entityId || '',
      entityType: entityType || '',
    });
  } catch (err) {
    console.warn('Could not record activity log:', err);
  }
}

// -------------------------------------------------------------
// Database Initialization
// -------------------------------------------------------------
export async function initializeDatabaseDefaults(): Promise<void> {
  try {
    // 1. Settings / Lab Config
    const labConfigRef = doc(db, 'settings', 'lab-config');
    const labConfigSnap = await getDoc(labConfigRef);
    if (!labConfigSnap.exists()) {
      await setDoc(labConfigRef, {
        ...DEFAULT_LAB_SETTINGS,
        updatedAt: new Date().toISOString(),
      });
    }

    // 2. Filaments
    const filamentsRef = doc(db, 'settings', 'filaments');
    const filamentsSnap = await getDoc(filamentsRef);
    if (!filamentsSnap.exists()) {
      await setDoc(filamentsRef, {
        items: DEFAULT_FILAMENTS,
        updatedAt: new Date().toISOString(),
      });
    }

    // 3. Printer Status
    const printerRef = doc(db, 'printerStatus', 'bambu-a1-mini');
    const printerSnap = await getDoc(printerRef);
    if (!printerSnap.exists()) {
      await setDoc(printerRef, {
        status: 'available',
        currentJobId: null,
        currentJobTitle: null,
        currentStudentName: null,
        maintenanceReason: null,
        expectedReturnDate: null,
        updatedAt: new Date().toISOString(),
        updatedBy: 'System Init',
      });
    }

    // 4. Analytics Counter
    const analyticsRef = doc(db, 'settings', 'analytics');
    const analyticsSnap = await getDoc(analyticsRef);
    if (!analyticsSnap.exists()) {
      await setDoc(analyticsRef, {
        blockedOversizeCount: 0,
        lastUpdated: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.warn('Initial setup check encountered non-fatal error:', error);
  }
}

// -------------------------------------------------------------
// Admin & Auth Services
// -------------------------------------------------------------
export async function checkIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false;
  try {
    // Bootstrap check for current app owner
    if (user.email === 'anu292@gmail.com') {
      const adminDoc = doc(db, 'admins', user.uid);
      const snap = await getDoc(adminDoc);
      if (!snap.exists()) {
        await setDoc(adminDoc, {
          uid: user.uid,
          email: user.email,
          role: 'superadmin',
          addedAt: new Date().toISOString(),
          addedBy: 'Bootstrap',
        });
      }
      return true;
    }

    const adminDoc = doc(db, 'admins', user.uid);
    const snap = await getDoc(adminDoc);
    return snap.exists();
  } catch (error) {
    console.error('Admin check error:', error);
    return false;
  }
}

export async function getAdminCount(): Promise<number> {
  try {
    const snap = await getDocs(collection(db, 'admins'));
    return snap.size;
  } catch {
    return 0;
  }
}

export async function bootstrapFirstAdmin(email: string, pass: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email, pass);
  const user = credential.user;
  await setDoc(doc(db, 'admins', user.uid), {
    uid: user.uid,
    email: user.email,
    role: 'superadmin',
    addedAt: new Date().toISOString(),
    addedBy: 'First-Time Setup',
  });
  await logActivity('First Admin Setup', `Initial administrator created: ${email}`, user.uid, 'admin');
  return user;
}

export async function createAdminInvitation(email: string): Promise<string> {
  const cleanEmail = email.trim().toLowerCase();
  const token = `inv_${Math.random().toString(36).substring(2)}${Date.now().toString(36)}`;
  const inviteId = doc(collection(db, 'invitations')).id;
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const inviteData: AdminInvitation = {
    id: inviteId,
    email: cleanEmail,
    token,
    role: 'admin',
    status: 'pending',
    invitedBy: auth.currentUser?.email || 'Admin',
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  await setDoc(doc(db, 'invitations', inviteId), inviteData);
  await logActivity('Admin Invited', `Invitation sent to ${cleanEmail}`, inviteId, 'invitation');
  return token;
}

export async function getInvitationByToken(token: string): Promise<AdminInvitation | null> {
  const q = query(collection(db, 'invitations'), where('token', '==', token), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const docSnap = snap.docs[0];
  return { id: docSnap.id, ...docSnap.data() } as AdminInvitation;
}

export async function acceptAdminInvitation(token: string, password: string): Promise<User> {
  const invite = await getInvitationByToken(token);
  if (!invite) {
    throw new Error('This invitation link is invalid or has already been used.');
  }

  // Check expiration
  if (new Date(invite.expiresAt) < new Date()) {
    throw new Error('This invitation has expired. Please ask the lab manager for a new invite.');
  }

  // Create Firebase Auth user
  let user: User;
  try {
    const cred = await createUserWithEmailAndPassword(auth, invite.email, password);
    user = cred.user;
  } catch (err: any) {
    if (err.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, invite.email, password);
      user = cred.user;
    } else {
      throw err;
    }
  }

  // Register in admins collection
  await setDoc(doc(db, 'admins', user.uid), {
    uid: user.uid,
    email: user.email,
    role: 'admin',
    addedAt: new Date().toISOString(),
    addedBy: invite.invitedBy,
  });

  // Mark invitation accepted
  await updateDoc(doc(db, 'invitations', invite.id), {
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
  });

  await logActivity('Invitation Accepted', `Admin joined: ${invite.email}`, user.uid, 'admin');
  return user;
}

export async function listAdmins(): Promise<AdminUser[]> {
  const snap = await getDocs(collection(db, 'admins'));
  return snap.docs.map((d) => ({ uid: d.id, ...d.data() } as AdminUser));
}

export async function listInvitations(): Promise<AdminInvitation[]> {
  const snap = await getDocs(collection(db, 'invitations'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as AdminInvitation));
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  await updateDoc(doc(db, 'invitations', invitationId), { status: 'revoked' });
  await logActivity('Invitation Revoked', `Invitation revoked (${invitationId})`, invitationId, 'invitation');
}

export async function removeAdmin(uid: string): Promise<void> {
  const admins = await listAdmins();
  if (admins.length <= 1) {
    throw new Error('Cannot remove the last administrator account.');
  }
  await deleteDoc(doc(db, 'admins', uid));
  await logActivity('Admin Removed', `Removed admin UID ${uid}`, uid, 'admin');
}

// -------------------------------------------------------------
// Filament Inventory Services
// -------------------------------------------------------------
export function subscribeToFilaments(callback: (filaments: FilamentItem[]) => void) {
  return onSnapshot(
    doc(db, 'settings', 'filaments'),
    (snap) => {
      if (snap.exists() && snap.data().items) {
        callback(snap.data().items as FilamentItem[]);
      } else {
        callback(DEFAULT_FILAMENTS);
      }
    },
    (err) => {
      console.error('Filaments listener error:', err);
    }
  );
}

export async function saveFilamentInventory(filaments: FilamentItem[]): Promise<void> {
  await updateDoc(doc(db, 'settings', 'filaments'), {
    items: filaments,
    updatedAt: new Date().toISOString(),
  });
  await logActivity('Filament Inventory Updated', `Updated ${filaments.length} filaments in catalog`);
}

export async function adjustFilamentStock(filamentId: string, deltaGrams: number): Promise<void> {
  const docRef = doc(db, 'settings', 'filaments');
  await runTransaction(db, async (txn) => {
    const snap = await txn.get(docRef);
    if (!snap.exists()) return;
    const items: FilamentItem[] = snap.data().items || [];
    const updated = items.map((f) => {
      if (f.id === filamentId) {
        const newStock = Math.max(0, f.stockGrams + deltaGrams);
        return {
          ...f,
          stockGrams: newStock,
          isAvailable: newStock > 0,
        };
      }
      return f;
    });
    txn.update(docRef, { items: updated, updatedAt: new Date().toISOString() });
  });
}

// -------------------------------------------------------------
// Printer Status Services
// -------------------------------------------------------------
export function subscribeToPrinterStatus(callback: (status: PrinterStatus) => void) {
  return onSnapshot(
    doc(db, 'printerStatus', 'bambu-a1-mini'),
    (snap) => {
      if (snap.exists()) {
        callback(snap.data() as PrinterStatus);
      } else {
        callback({
          status: 'available',
          updatedAt: new Date().toISOString(),
          updatedBy: 'System',
        });
      }
    },
    (err) => {
      console.error('Printer status error:', err);
    }
  );
}

export async function updatePrinterStatus(
  status: PrinterStatusCode,
  options?: {
    maintenanceReason?: string | null;
    expectedReturnDate?: string | null;
    currentJobId?: string | null;
    currentJobTitle?: string | null;
    currentStudentName?: string | null;
  }
): Promise<void> {
  const updateData: any = {
    status,
    updatedAt: new Date().toISOString(),
    updatedBy: auth.currentUser?.email || 'Admin',
  };

  if (options?.maintenanceReason !== undefined) updateData.maintenanceReason = options.maintenanceReason;
  if (options?.expectedReturnDate !== undefined) updateData.expectedReturnDate = options.expectedReturnDate;
  if (options?.currentJobId !== undefined) updateData.currentJobId = options.currentJobId;
  if (options?.currentJobTitle !== undefined) updateData.currentJobTitle = options.currentJobTitle;
  if (options?.currentStudentName !== undefined) updateData.currentStudentName = options.currentStudentName;

  await updateDoc(doc(db, 'printerStatus', 'bambu-a1-mini'), updateData);
  await logActivity('Printer Status Changed', `Printer set to ${status.toUpperCase()}`, 'bambu-a1-mini', 'printer');
}

// -------------------------------------------------------------
// Print Requests Services (Students & Admin)
// -------------------------------------------------------------
export async function uploadModelFile(trackingCode: string, file: File): Promise<string> {
  try {
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `models/${trackingCode}_${cleanFileName}`;
    const storageReference = ref(storage, storagePath);

    const snapshot = await uploadBytes(storageReference, file, {
      contentType: file.type || 'application/octet-stream',
    });

    const downloadUrl = await getDownloadURL(snapshot.ref);
    return downloadUrl;
  } catch (error) {
    console.warn('Storage upload note:', error);
    // Reliable fallback for preview environment: create local object URL or data URL
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.readAsDataURL(file);
    });
  }
}

export async function createPrintRequest(
  data: Omit<PrintRequest, 'id' | 'trackingCode' | 'status' | 'createdAt' | 'updatedAt'>,
  file: File
): Promise<PrintRequest> {
  const trackingCode = generateTrackingCode();
  const fileUrl = await uploadModelFile(trackingCode, file);

  const request: PrintRequest = {
    ...data,
    id: trackingCode,
    trackingCode,
    fileUrl,
    fileName: file.name,
    fileSizeBytes: file.size,
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, 'requests', trackingCode), request);

  // Remember request locally for the student
  try {
    const existing = JSON.parse(localStorage.getItem('printlab_my_tracking_codes') || '[]');
    if (!existing.includes(trackingCode)) {
      existing.unshift(trackingCode);
      localStorage.setItem('printlab_my_tracking_codes', JSON.stringify(existing));
    }
  } catch {
    // ignore localStorage restriction
  }

  await logActivity('New Request Submitted', `${request.projectTitle} by ${request.fullName} (${trackingCode})`, trackingCode, 'request');
  return request;
}

export async function getRequestByTrackingCode(trackingCode: string): Promise<PrintRequest | null> {
  const code = trackingCode.trim().toUpperCase();
  const snap = await getDoc(doc(db, 'requests', code));
  if (!snap.exists()) return null;
  return snap.data() as PrintRequest;
}

export function subscribeToAllRequests(callback: (requests: PrintRequest[]) => void) {
  const q = query(collection(db, 'requests'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as PrintRequest);
      callback(list);
    },
    (err) => {
      handleFirestoreError(err, OperationType.LIST, 'requests');
    }
  );
}

export async function resubmitRevisedModel(
  requestId: string,
  file: File,
  dimensions: { x: number; y: number; z: number },
  volumeCm3: number,
  estimatedMinutes: number
): Promise<void> {
  const fileUrl = await uploadModelFile(requestId, file);
  await updateDoc(doc(db, 'requests', requestId), {
    fileUrl,
    fileName: file.name,
    fileSizeBytes: file.size,
    dimensions,
    volumeCm3,
    estimatedMinutes,
    status: 'pending',
    updatedAt: new Date().toISOString(),
  });
  await logActivity('Model Resubmitted', `Revised model uploaded for request ${requestId}`, requestId, 'request');
}

export async function rejectPrintRequest(requestId: string, reason: string): Promise<void> {
  if (!reason.trim()) throw new Error('A rejection reason is required.');
  await updateDoc(doc(db, 'requests', requestId), {
    status: 'rejected',
    rejectionReason: reason.trim(),
    updatedAt: new Date().toISOString(),
  });
  await logActivity('Request Rejected', `Request ${requestId} rejected. Reason: ${reason}`, requestId, 'request');
}

export async function requestChangesOnPrintRequest(requestId: string, comment: string): Promise<void> {
  if (!comment.trim()) throw new Error('A revision explanation is required.');
  await updateDoc(doc(db, 'requests', requestId), {
    status: 'needs_changes',
    changeRequestReason: comment.trim(),
    adminComment: comment.trim(),
    updatedAt: new Date().toISOString(),
  });
  await logActivity('Changes Requested', `Request ${requestId} marked for revisions: ${comment}`, requestId, 'request');
}

// -------------------------------------------------------------
// Schedule & Strict Overlap Prevention
// -------------------------------------------------------------
export function subscribeToBookings(callback: (bookings: Booking[]) => void) {
  const q = query(collection(db, 'bookings'), orderBy('startTime', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Booking));
      callback(list);
    },
    (err) => {
      console.error('Bookings listener error:', err);
    }
  );
}

/**
 * STRICT OVERLAP CHECK
 * Ensures no two active bookings share the printer at the same time,
 * including configurable plate clearing buffer time.
 */
export async function approveAndScheduleRequestWithTransaction(
  requestId: string,
  bookingData: {
    startTime: string;
    endTime: string;
    durationMinutes: number;
    notes?: string;
  }
): Promise<Booking> {
  const bookingId = `book_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const bookingRef = doc(db, 'bookings', bookingId);
  const requestRef = doc(db, 'requests', requestId);
  const settingsRef = doc(db, 'settings', 'lab-config');

  const newStartMs = new Date(bookingData.startTime).getTime();
  const newEndMs = new Date(bookingData.endTime).getTime();

  if (newEndMs <= newStartMs) {
    throw new Error('Scheduled end time must be after start time.');
  }

  return await runTransaction(db, async (txn) => {
    // 1. Get Request
    const reqSnap = await txn.get(requestRef);
    if (!reqSnap.exists()) {
      throw new Error(`Request ${requestId} not found.`);
    }
    const req = reqSnap.data() as PrintRequest;

    // 2. Read Settings for Buffer Time
    const setSnap = await txn.get(settingsRef);
    const bufferMin = setSnap.exists() ? (setSnap.data().bufferMinutes || 15) : 15;
    const bufferMs = bufferMin * 60 * 1000;

    // 3. Check for overlapping bookings
    const bookingsSnap = await getDocs(collection(db, 'bookings'));
    for (const bDoc of bookingsSnap.docs) {
      const b = bDoc.data() as Booking;
      if (b.status === 'cancelled' || b.status === 'failed') continue;

      const existingStartMs = new Date(b.startTime).getTime();
      const existingEndMs = new Date(b.endTime).getTime();

      // Overlap condition considering buffer before and after
      const conflicts = (
        (newStartMs < existingEndMs + bufferMs) &&
        (newEndMs + bufferMs > existingStartMs)
      );

      if (conflicts) {
        throw new Error(
          `Schedule conflict! Printer is already booked for "${b.projectTitle}" (${b.studentName}) from ${new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} to ${new Date(b.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} including ${bufferMin}m buffer.`
        );
      }
    }

    // 4. Create the Booking
    const newBooking: Booking = {
      id: bookingId,
      requestId,
      trackingCode: req.trackingCode,
      projectTitle: req.projectTitle,
      studentName: req.fullName,
      studentEmail: req.email,
      material: req.material,
      color: req.color,
      startTime: bookingData.startTime,
      endTime: bookingData.endTime,
      durationMinutes: bookingData.durationMinutes,
      status: 'scheduled',
      notes: bookingData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    txn.set(bookingRef, newBooking);

    // 5. Update Request Status to 'scheduled'
    txn.update(requestRef, {
      status: 'scheduled',
      actualMinutes: bookingData.durationMinutes,
      scheduledSlot: {
        start: bookingData.startTime,
        end: bookingData.endTime,
        bookingId,
      },
      updatedAt: new Date().toISOString(),
    });

    return newBooking;
  });
}

export async function rescheduleBooking(
  bookingId: string,
  newStart: string,
  newEnd: string
): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  const newStartMs = new Date(newStart).getTime();
  const newEndMs = new Date(newEnd).getTime();

  await runTransaction(db, async (txn) => {
    const bookingSnap = await txn.get(bookingRef);
    if (!bookingSnap.exists()) throw new Error('Booking not found.');
    const current = bookingSnap.data() as Booking;

    const allBookings = await getDocs(collection(db, 'bookings'));
    for (const bDoc of allBookings.docs) {
      if (bDoc.id === bookingId) continue;
      const b = bDoc.data() as Booking;
      if (b.status === 'cancelled' || b.status === 'failed') continue;

      const existingStart = new Date(b.startTime).getTime();
      const existingEnd = new Date(b.endTime).getTime();
      const bufferMs = 15 * 60 * 1000;

      if ((newStartMs < existingEnd + bufferMs) && (newEndMs + bufferMs > existingStart)) {
        throw new Error(
          `Conflict with existing booking "${b.projectTitle}" (${new Date(b.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}). Choose an alternate slot.`
        );
      }
    }

    const durationMinutes = Math.round((newEndMs - newStartMs) / (1000 * 60));
    txn.update(bookingRef, {
      startTime: newStart,
      endTime: newEnd,
      durationMinutes,
      updatedAt: new Date().toISOString(),
    });

    if (current.requestId) {
      txn.update(doc(db, 'requests', current.requestId), {
        scheduledSlot: { start: newStart, end: newEnd, bookingId },
        actualMinutes: durationMinutes,
        updatedAt: new Date().toISOString(),
      });
    }
  });

  await logActivity('Booking Rescheduled', `Rescheduled booking ${bookingId} to ${newStart}`, bookingId, 'booking');
}

export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  failureReason?: string
): Promise<void> {
  const bookingRef = doc(db, 'bookings', bookingId);
  const bookingSnap = await getDoc(bookingRef);
  if (!bookingSnap.exists()) return;
  const booking = bookingSnap.data() as Booking;

  const updateData: any = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (failureReason) updateData.failureReason = failureReason;

  await updateDoc(bookingRef, updateData);

  // Sync printer live state and request state
  if (status === 'printing') {
    await updatePrinterStatus('printing', {
      currentJobId: bookingId,
      currentJobTitle: booking.projectTitle,
      currentStudentName: booking.studentName,
    });
    if (booking.requestId) {
      await updateDoc(doc(db, 'requests', booking.requestId), {
        status: 'printing',
        updatedAt: new Date().toISOString(),
      });
    }
  } else if (status === 'completed') {
    await updatePrinterStatus('available', {
      currentJobId: null,
      currentJobTitle: null,
      currentStudentName: null,
    });
    if (booking.requestId) {
      await updateDoc(doc(db, 'requests', booking.requestId), {
        status: 'completed',
        updatedAt: new Date().toISOString(),
      });
    }
  } else if (status === 'failed' || status === 'cancelled') {
    await updatePrinterStatus('available', {
      currentJobId: null,
      currentJobTitle: null,
      currentStudentName: null,
    });
    if (booking.requestId) {
      await updateDoc(doc(db, 'requests', booking.requestId), {
        status: status === 'failed' ? 'needs_changes' : 'approved',
        failureReason: failureReason || 'Job cancelled or interrupted',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  await logActivity('Booking Status Updated', `Job "${booking.projectTitle}" marked as ${status.toUpperCase()}`, bookingId, 'booking');
}

// -------------------------------------------------------------
// Analytics & Oversize tracking
// -------------------------------------------------------------
export async function recordBlockedOversizeAttempt(): Promise<void> {
  try {
    const ref = doc(db, 'settings', 'analytics');
    await runTransaction(db, async (txn) => {
      const snap = await txn.get(ref);
      const current = snap.exists() ? (snap.data().blockedOversizeCount || 0) : 0;
      txn.set(ref, {
        blockedOversizeCount: current + 1,
        lastUpdated: new Date().toISOString(),
      }, { merge: true });
    });
  } catch (err) {
    console.warn('Could not record blocked attempt:', err);
  }
}

export function subscribeToAnalytics(callback: (count: number) => void) {
  return onSnapshot(doc(db, 'settings', 'analytics'), (snap) => {
    if (snap.exists()) {
      callback(snap.data().blockedOversizeCount || 0);
    } else {
      callback(0);
    }
  });
}

export async function getLabSettings(): Promise<LabSettings> {
  const snap = await getDoc(doc(db, 'settings', 'lab-config'));
  if (snap.exists()) return snap.data() as LabSettings;
  return DEFAULT_LAB_SETTINGS;
}

export async function saveLabSettings(settings: LabSettings): Promise<void> {
  await setDoc(doc(db, 'settings', 'lab-config'), {
    ...settings,
    updatedAt: new Date().toISOString(),
  });
  await logActivity('Lab Settings Updated', 'Updated lab schedule hours and print policies');
}

export function subscribeToActivityLogs(callback: (logs: ActivityLog[]) => void) {
  const q = query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ActivityLog));
    callback(list);
  });
}
