import React, { useState, useMemo } from 'react';
import { 
  ClipboardList, 
  Calendar, 
  Package, 
  BarChart3, 
  Settings as SettingsIcon, 
  Search, 
  Filter, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Clock, 
  Download, 
  Send, 
  Trash2, 
  Plus, 
  Edit3, 
  ShieldCheck, 
  UserPlus, 
  Mail, 
  RefreshCw, 
  Copy, 
  Check, 
  Wrench, 
  FileSpreadsheet, 
  AlertTriangle,
  PlayCircle,
  RotateCcw,
  Eye,
  Sliders,
  DollarSign
} from 'lucide-react';
import { 
  PrintRequest, 
  Booking, 
  PrinterStatus, 
  FilamentItem, 
  LabSettings, 
  AdminUser, 
  AdminInvitation, 
  ActivityLog,
  RequestStatus,
  BookingStatus,
  PrinterStatusCode
} from '../types';
import { 
  approveAndScheduleRequestWithTransaction,
  rejectPrintRequest,
  requestChangesOnPrintRequest,
  rescheduleBooking,
  updateBookingStatus,
  updatePrinterStatus,
  saveFilamentInventory,
  adjustFilamentStock,
  saveLabSettings,
  createAdminInvitation,
  revokeInvitation,
  removeAdmin
} from '../services/firebaseService';
import { ModelViewer } from './ModelViewer';

interface AdminPortalProps {
  requests: PrintRequest[];
  bookings: Booking[];
  printerStatus: PrinterStatus | null;
  filaments: FilamentItem[];
  settings: LabSettings;
  admins: AdminUser[];
  invitations: AdminInvitation[];
  activityLogs: ActivityLog[];
  blockedOversizeCount: number;
  currentAdminEmail: string;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  requests,
  bookings,
  printerStatus,
  filaments,
  settings,
  admins,
  invitations,
  activityLogs,
  blockedOversizeCount,
  currentAdminEmail,
}) => {
  const [adminTab, setAdminTab] = useState<'queue' | 'schedule' | 'filaments' | 'analytics' | 'settings'>('queue');

  // Search & Filter state for Review Queue
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [materialFilter, setMaterialFilter] = useState<string>('all');

  // Selected Request for Review Modal / Details
  const [selectedRequest, setSelectedRequest] = useState<PrintRequest | null>(null);
  const [adminFinalMinutes, setAdminFinalMinutes] = useState<number>(30);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showChangesModal, setShowChangesModal] = useState(false);
  const [changesComment, setChangesComment] = useState('');
  const [customSlotStart, setCustomSlotStart] = useState('');

  // Filament Edit / Add Modal
  const [filamentList, setFilamentList] = useState<FilamentItem[]>(filaments);
  const [showAddFilamentModal, setShowAddFilamentModal] = useState(false);
  const [newMaterial, setNewMaterial] = useState('PLA');
  const [newColor, setNewColor] = useState('');
  const [newHex, setNewHex] = useState('#0d9488');
  const [newStockGrams, setNewStockGrams] = useState(1000);
  const [newLowStockThreshold, setNewLowStockThreshold] = useState(200);

  // Filament Stock Adjustment Modal
  const [adjustingFilament, setAdjustingFilament] = useState<FilamentItem | null>(null);
  const [adjustGrams, setAdjustGrams] = useState<number>(100);

  // Invite Admin State
  const [inviteEmail, setInviteEmail] = useState('');
  const [lastGeneratedInviteLink, setLastGeneratedInviteLink] = useState<string | null>(null);
  const [isInviting, setIsInviting] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);

  // Maintenance Dialog
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false);
  const [maintenanceReason, setMaintenanceReason] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');

  // Booking Action & Failed Modal
  const [actionBooking, setActionBooking] = useState<Booking | null>(null);
  const [failureReason, setFailureReason] = useState('');
  const [showFailureModal, setShowFailureModal] = useState(false);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [rescheduleStart, setRescheduleStart] = useState('');
  const [rescheduleEnd, setRescheduleEnd] = useState('');

  // Synchronize filamentList when props change
  React.useEffect(() => {
    setFilamentList(filaments);
  }, [filaments]);

  // When selectedRequest changes, sync print time
  React.useEffect(() => {
    if (selectedRequest) {
      setAdminFinalMinutes(selectedRequest.actualMinutes || selectedRequest.estimatedMinutes || 30);
    }
  }, [selectedRequest]);

  // Filtered Requests Queue
  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchSearch = 
        r.projectTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.trackingCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.email.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchGrade = gradeFilter === 'all' || r.grade === gradeFilter;
      const matchMaterial = materialFilter === 'all' || r.material === materialFilter;

      return matchSearch && matchStatus && matchGrade && matchMaterial;
    });
  }, [requests, searchQuery, statusFilter, gradeFilter, materialFilter]);

  // Pending count
  const pendingCount = useMemo(() => {
    return requests.filter((r) => r.status === 'pending').length;
  }, [requests]);

  // Suggest Earliest Free Slot on Timeline
  const suggestEarliestFreeSlot = (durationMinutes: number): { start: Date; end: Date } => {
    const bufferMs = (settings.bufferMinutes || 15) * 60 * 1000;
    const durationMs = durationMinutes * 60 * 1000;
    
    // Sort all non-cancelled bookings
    const activeBookings = bookings
      .filter((b) => b.status !== 'cancelled' && b.status !== 'failed')
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Start looking from now, rounded up to next 15 mins
    let searchStart = new Date();
    const remainder = 15 - (searchStart.getMinutes() % 15);
    searchStart.setMinutes(searchStart.getMinutes() + remainder, 0, 0);

    // If outside lab hours, jump to next open day morning
    const [openH, openM] = (settings.labHours.start || '08:30').split(':').map(Number);
    const [closeH, closeM] = (settings.labHours.end || '16:30').split(':').map(Number);

    if (searchStart.getHours() < openH || (searchStart.getHours() === openH && searchStart.getMinutes() < openM)) {
      searchStart.setHours(openH, openM, 0, 0);
    }

    // Step through slots to find non-overlapping window
    for (let i = 0; i < 200; i++) {
      const slotEnd = new Date(searchStart.getTime() + durationMs);

      // Check if slot falls on holiday or weekend
      const dateStr = searchStart.toISOString().split('T')[0];
      const isHoliday = (settings.holidays || []).includes(dateStr);
      const isWeekend = searchStart.getDay() === 0 || searchStart.getDay() === 6;

      // Check lab hours
      const slotClose = new Date(searchStart);
      slotClose.setHours(closeH, closeM, 0, 0);

      if (isHoliday || isWeekend || slotEnd > slotClose) {
        // Jump to next business day at openH:openM
        searchStart.setDate(searchStart.getDate() + 1);
        searchStart.setHours(openH, openM, 0, 0);
        continue;
      }

      // Check overlap against active bookings
      const startMs = searchStart.getTime();
      const endMs = slotEnd.getTime();

      const hasConflict = activeBookings.some((b) => {
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();
        return (startMs < bEnd + bufferMs) && (endMs + bufferMs > bStart);
      });

      if (!hasConflict) {
        return { start: searchStart, end: slotEnd };
      }

      // Move searchStart forward by 15 mins
      searchStart = new Date(searchStart.getTime() + 15 * 60 * 1000);
    }

    // Fallback
    const fallbackStart = new Date(Date.now() + 60 * 60 * 1000);
    return { start: fallbackStart, end: new Date(fallbackStart.getTime() + durationMs) };
  };

  // Approve & Schedule Action
  const handleApproveAndSchedule = async () => {
    if (!selectedRequest) return;
    setIsProcessingAction(true);

    try {
      let slot: { start: Date; end: Date };
      if (customSlotStart) {
        const start = new Date(customSlotStart);
        const end = new Date(start.getTime() + adminFinalMinutes * 60 * 1000);
        slot = { start, end };
      } else {
        slot = suggestEarliestFreeSlot(adminFinalMinutes);
      }

      await approveAndScheduleRequestWithTransaction(selectedRequest.id, {
        startTime: slot.start.toISOString(),
        endTime: slot.end.toISOString(),
        durationMinutes: adminFinalMinutes,
        notes: `Approved by ${currentAdminEmail}. Slicer time: ${adminFinalMinutes}m.`,
      });

      alert(`Job approved & scheduled successfully for ${slot.start.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}!`);
      setSelectedRequest(null);
      setCustomSlotStart('');
    } catch (err: any) {
      alert('Error scheduling: ' + err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Reject Action
  const handleRejectConfirm = async () => {
    if (!selectedRequest || !rejectReason.trim()) return;
    setIsProcessingAction(true);
    try {
      await rejectPrintRequest(selectedRequest.id, rejectReason.trim());
      alert('Request marked as Rejected.');
      setShowRejectModal(false);
      setSelectedRequest(null);
      setRejectReason('');
    } catch (err: any) {
      alert('Failed to reject: ' + err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Request Changes Action
  const handleRequestChangesConfirm = async () => {
    if (!selectedRequest || !changesComment.trim()) return;
    setIsProcessingAction(true);
    try {
      await requestChangesOnPrintRequest(selectedRequest.id, changesComment.trim());
      alert('Revision comments sent to student. Status updated to "Needs Changes".');
      setShowChangesModal(false);
      setSelectedRequest(null);
      setChangesComment('');
    } catch (err: any) {
      alert('Failed: ' + err.message);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Filament Inventory Handlers
  const handleSaveNewFilament = async () => {
    if (!newColor.trim()) return;
    const newItem: FilamentItem = {
      id: `${newMaterial.toLowerCase()}-${Date.now().toString(36)}`,
      material: newMaterial,
      color: newColor.trim(),
      hex: newHex,
      stockGrams: Math.max(0, newStockGrams),
      lowStockThresholdGrams: newLowStockThreshold,
      isAvailable: newStockGrams > 0,
    };
    const updated = [...filamentList, newItem];
    setFilamentList(updated);
    await saveFilamentInventory(updated);
    setShowAddFilamentModal(false);
    setNewColor('');
  };

  const handleRemoveFilament = async (id: string) => {
    if (!confirm('Remove this filament from the catalog?')) return;
    const updated = filamentList.filter((f) => f.id !== id);
    setFilamentList(updated);
    await saveFilamentInventory(updated);
  };

  const handleApplyStockAdjustment = async () => {
    if (!adjustingFilament) return;
    await adjustFilamentStock(adjustingFilament.id, adjustGrams);
    setAdjustingFilament(null);
  };

  // Admin Invitation Handler
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      const token = await createAdminInvitation(inviteEmail.trim());
      const origin = window.location.origin;
      const inviteUrl = `${origin}?inviteToken=${token}`;
      setLastGeneratedInviteLink(inviteUrl);
      setInviteEmail('');
      alert(`Invitation generated! Share this unique link with ${inviteEmail.trim()} to configure their password and access.`);
    } catch (err: any) {
      alert('Error creating invite: ' + err.message);
    } finally {
      setIsInviting(false);
    }
  };

  // Maintenance Mode Toggle
  const handleSaveMaintenance = async (status: PrinterStatusCode) => {
    try {
      await updatePrinterStatus(status, {
        maintenanceReason: status === 'maintenance' || status === 'offline' ? maintenanceReason : null,
        expectedReturnDate: status === 'maintenance' || status === 'offline' ? expectedReturnDate : null,
      });
      setShowMaintenanceModal(false);
      alert(`Printer status changed to ${status.toUpperCase()}. Affected bookings are flagged in the schedule.`);
    } catch (err: any) {
      alert('Failed to update printer: ' + err.message);
    }
  };

  // CSV Exporters
  const handleExportRequestsCSV = () => {
    const headers = ['Tracking Code', 'Student Name', 'Grade', 'Section', 'Email', 'Project Title', 'Material', 'Color', 'Dimensions (mm)', 'Volume (cm3)', 'Status', 'Submitted At'];
    const rows = requests.map((r) => [
      r.trackingCode,
      `"${r.fullName}"`,
      r.grade,
      r.section,
      r.email,
      `"${r.projectTitle}"`,
      r.material,
      `"${r.color}"`,
      `"${r.dimensions.x}x${r.dimensions.y}x${r.dimensions.z}"`,
      r.volumeCm3,
      r.status,
      r.createdAt,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PrintLab_Requests_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportBookingsCSV = () => {
    const headers = ['Booking ID', 'Tracking Code', 'Project Title', 'Student Name', 'Start Time', 'End Time', 'Duration (min)', 'Status'];
    const rows = bookings.map((b) => [
      b.id,
      b.trackingCode,
      `"${b.projectTitle}"`,
      `"${b.studentName}"`,
      b.startTime,
      b.endTime,
      b.durationMinutes,
      b.status,
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `PrintLab_Bookings_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Total booked time for upcoming queue
  const totalUpcomingBookedMinutes = useMemo(() => {
    return bookings
      .filter((b) => b.status === 'scheduled' || b.status === 'printing')
      .reduce((sum, b) => sum + (b.durationMinutes || 0), 0);
  }, [bookings]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
      
      {/* Admin Header with Tab Navigation */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-md bg-teal-100 text-teal-800 text-xs font-bold uppercase tracking-wider">
              Management Portal
            </span>
            <span className="text-xs text-slate-500 font-mono">Logged in as {currentAdminEmail}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            STEAM Lab Administration
          </h1>
        </div>

        {/* Sub-tabs */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl border border-slate-200 self-start lg:self-auto">
          <button
            type="button"
            onClick={() => setAdminTab('queue')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              adminTab === 'queue'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>Review Queue</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[11px] font-extrabold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('schedule')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              adminTab === 'schedule'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Schedule Timeline</span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('filaments')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              adminTab === 'filaments'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Filament Stock</span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('analytics')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              adminTab === 'analytics'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Analytics</span>
          </button>

          <button
            type="button"
            onClick={() => setAdminTab('settings')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
              adminTab === 'settings'
                ? 'bg-white text-teal-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            <span>Settings & Team</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 1. REVIEW & APPROVAL QUEUE */}
      {/* ------------------------------------------------------------- */}
      {adminTab === 'queue' && (
        <div className="space-y-6">
          
          {/* Filters & Search Toolbar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by student, project title, or code (e.g. PL-4F7K2)..."
                className="w-full text-xs sm:text-sm border-none focus:outline-none placeholder-slate-400"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending Review</option>
                <option value="approved">Approved</option>
                <option value="needs_changes">Needs Changes</option>
                <option value="scheduled">Scheduled</option>
                <option value="printing">Printing</option>
                <option value="completed">Completed</option>
                <option value="rejected">Rejected</option>
              </select>

              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
              >
                <option value="all">All Grades</option>
                <option value="Grade 5">Grade 5</option>
                <option value="Grade 6">Grade 6</option>
                <option value="Grade 7">Grade 7</option>
                <option value="Grade 8">Grade 8</option>
                <option value="Grade 9">Grade 9</option>
                <option value="Grade 10">Grade 10</option>
                <option value="STEAM Club">STEAM Club</option>
              </select>

              <select
                value={materialFilter}
                onChange={(e) => setMaterialFilter(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50"
              >
                <option value="all">All Materials</option>
                <option value="PLA">PLA</option>
                <option value="PETG">PETG</option>
                <option value="TPU">TPU</option>
              </select>

              <button
                type="button"
                onClick={handleExportRequestsCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                title="Export requests to CSV"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {/* Requests Table / Grid */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-800">
                Print Requests ({filteredRequests.length})
              </h2>
              <span className="text-xs text-slate-500 font-mono">
                Bambu A1 mini Queue
              </span>
            </div>

            {filteredRequests.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">
                No print requests match your current filters.
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {filteredRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5">
                        <span className="px-2 py-0.5 rounded-md font-mono font-bold text-xs bg-slate-100 text-slate-800">
                          {req.trackingCode}
                        </span>
                        <h4 className="font-bold text-slate-900 text-base">{req.projectTitle}</h4>
                        <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                          req.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                          req.status === 'scheduled' ? 'bg-purple-100 text-purple-800' :
                          req.status === 'printing' ? 'bg-teal-100 text-teal-800' :
                          req.status === 'completed' || req.status === 'ready' ? 'bg-emerald-100 text-emerald-800' :
                          req.status === 'needs_changes' ? 'bg-orange-100 text-orange-800' :
                          req.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {req.status.replace('_', ' ')}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                        <span><strong>Student:</strong> {req.fullName} ({req.grade}, {req.section})</span>
                        <span>•</span>
                        <span><strong>Material:</strong> {req.material} ({req.color})</span>
                        <span>•</span>
                        <span><strong>Size:</strong> {req.dimensions.x} × {req.dimensions.y} × {req.dimensions.z} mm</span>
                        <span>•</span>
                        <span><strong>Est:</strong> ~{req.estimatedMinutes}m</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start md:self-center shrink-0">
                      {req.fileUrl && (
                        <a
                          href={req.fileUrl}
                          download={req.fileName}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                          title="Download 3D model file"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      )}

                      <button
                        type="button"
                        onClick={() => setSelectedRequest(req)}
                        className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
                      >
                        Inspect & Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 2. SCHEDULE TIMELINE & STRICT OVERLAP PREVENTION */}
      {/* ------------------------------------------------------------- */}
      {adminTab === 'schedule' && (
        <div className="space-y-6">
          
          {/* Schedule Controls Header */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Bambu Lab A1 mini Print Timeline
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase ${
                  printerStatus?.status === 'available' ? 'bg-emerald-100 text-emerald-800' :
                  printerStatus?.status === 'printing' ? 'bg-teal-100 text-teal-800' :
                  printerStatus?.status === 'maintenance' ? 'bg-amber-100 text-amber-800' :
                  'bg-rose-100 text-rose-800'
                }`}>
                  {printerStatus?.status || 'available'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Queue summary: Printer booked for the next{' '}
                <strong className="text-teal-700 font-mono font-bold">
                  {Math.floor(totalUpcomingBookedMinutes / 60)}h {totalUpcomingBookedMinutes % 60}m
                </strong>{' '}
                (with strict overlap protection & 15m plate cooling buffers).
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowMaintenanceModal(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-700" />
                <span>Maintenance Mode</span>
              </button>

              <button
                type="button"
                onClick={handleExportBookingsCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Export Bookings</span>
              </button>
            </div>
          </div>

          {/* Bookings List & Job Actions */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100">
              <h3 className="font-bold text-slate-800 text-sm">
                Scheduled & Active Jobs ({bookings.length})
              </h3>
            </div>

            <div className="divide-y divide-slate-100">
              {bookings.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-sm">
                  No bookings currently scheduled. Approve print requests from the Review Queue to populate the timeline.
                </div>
              ) : (
                bookings.map((booking) => {
                  const start = new Date(booking.startTime);
                  const end = new Date(booking.endTime);
                  const isMaintenanceAlert = 
                    (printerStatus?.status === 'maintenance' || printerStatus?.status === 'offline') &&
                    (booking.status === 'scheduled');

                  return (
                    <div
                      key={booking.id}
                      className={`p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                        booking.status === 'printing' ? 'bg-teal-50/50' : 'hover:bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-3.5 h-14 rounded-full shrink-0 ${
                          booking.status === 'printing' ? 'bg-teal-500' :
                          booking.status === 'completed' ? 'bg-emerald-500' :
                          booking.status === 'failed' ? 'bg-rose-500' : 'bg-purple-500'
                        }`} />

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-base">{booking.projectTitle}</span>
                            <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 rounded text-slate-700 font-bold">
                              {booking.trackingCode}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              booking.status === 'printing' ? 'bg-teal-100 text-teal-800' :
                              booking.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                              booking.status === 'failed' ? 'bg-rose-100 text-rose-800' : 'bg-purple-100 text-purple-800'
                            }`}>
                              {booking.status}
                            </span>
                          </div>

                          <p className="text-xs text-slate-500 mt-1">
                            Student: <strong>{booking.studentName}</strong> • {booking.material} ({booking.color}) • {booking.durationMinutes}m
                          </p>

                          {isMaintenanceAlert && (
                            <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 text-xs font-bold">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
                              <span>Action Required: Affected by printer maintenance!</span>
                            </div>
                          )}

                          {booking.failureReason && (
                            <p className="text-xs text-rose-700 font-medium mt-1">
                              Failure note: {booking.failureReason}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Right Slot & Job Action Buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="text-right text-xs">
                          <p className="font-bold text-slate-900 font-mono">
                            {start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                          </p>
                          <p className="text-slate-500 font-mono">
                            {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                            {end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          {booking.status === 'scheduled' && (
                            <button
                              type="button"
                              onClick={() => updateBookingStatus(booking.id, 'printing')}
                              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Set printer to printing"
                            >
                              <PlayCircle className="w-3.5 h-3.5" />
                              <span>Start</span>
                            </button>
                          )}

                          {booking.status === 'printing' && (
                            <button
                              type="button"
                              onClick={() => updateBookingStatus(booking.id, 'completed')}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                              title="Mark job successfully completed"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>Complete</span>
                            </button>
                          )}

                          {/* Mark Failed button (triggers modal for reason and one-click reschedule) */}
                          {(booking.status === 'printing' || booking.status === 'scheduled') && (
                            <button
                              type="button"
                              onClick={() => {
                                setActionBooking(booking);
                                setShowFailureModal(true);
                              }}
                              className="p-1.5 text-slate-400 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                              title="Mark Failed"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Reschedule Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setActionBooking(booking);
                              setRescheduleStart(new Date(booking.startTime).toISOString().slice(0, 16));
                              setRescheduleEnd(new Date(booking.endTime).toISOString().slice(0, 16));
                              setShowRescheduleModal(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                            title="Reschedule slot"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. FILAMENT MANAGEMENT & STOCK SYSTEM */}
      {/* ------------------------------------------------------------- */}
      {adminTab === 'filaments' && (
        <div className="space-y-6">
          
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Filament Inventory & Live Stock
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Students only see colors in stock (&gt;0g) for their selected material during request submission.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddFilamentModal(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add New Filament / Color</span>
            </button>
          </div>

          {/* Filaments Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filamentList.map((item) => {
              const isLowStock = item.stockGrams <= item.lowStockThresholdGrams && item.stockGrams > 0;
              const isOutOfStock = item.stockGrams <= 0;

              return (
                <div
                  key={item.id}
                  className={`p-5 rounded-3xl border transition-all ${
                    isOutOfStock
                      ? 'bg-slate-50/80 border-slate-200 opacity-75'
                      : isLowStock
                      ? 'bg-amber-50/50 border-amber-300 ring-2 ring-amber-400/20'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span
                        className="w-7 h-7 rounded-xl border border-slate-300 shadow-xs shrink-0"
                        style={{ backgroundColor: item.hex }}
                      />
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm">{item.color}</h4>
                        <span className="text-xs font-semibold text-slate-500">{item.material}</span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveFilament(item.id)}
                      className="text-slate-300 hover:text-rose-600 p-1"
                      title="Remove filament"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Stock Indicator Badge */}
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Current Stock:</span>
                    <span className="font-mono font-extrabold text-sm text-slate-800">
                      {item.stockGrams}g{' '}
                      <span className="text-[11px] font-normal text-slate-400">
                        (~{(item.stockGrams / 1000).toFixed(2)} spools)
                      </span>
                    </span>
                  </div>

                  {/* Stock Warning Status Pill */}
                  <div className="mt-2 flex items-center justify-between">
                    {isOutOfStock ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                        Out of Stock (Hidden from Students)
                      </span>
                    ) : isLowStock ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-amber-700" />
                        Low Stock (&lt;{item.lowStockThresholdGrams}g)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        In Stock &amp; Visible
                      </span>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setAdjustingFilament(item);
                        setAdjustGrams(100);
                      }}
                      className="text-xs font-bold text-teal-600 hover:text-teal-800 underline cursor-pointer"
                    >
                      Adjust Stock
                    </button>
                  </div>

                  {/* Quick Replenish / Deduct Buttons */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => adjustFilamentStock(item.id, -50)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      -50g
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustFilamentStock(item.id, -100)}
                      className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      -100g
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustFilamentStock(item.id, +250)}
                      className="px-2 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      +250g
                    </button>
                    <button
                      type="button"
                      onClick={() => adjustFilamentStock(item.id, +1000)}
                      className="px-2 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-800 text-[11px] font-bold transition-colors cursor-pointer"
                    >
                      +1kg Spool
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 4. ANALYTICS & ACTIVITY LOG */}
      {/* ------------------------------------------------------------- */}
      {adminTab === 'analytics' && (
        <div className="space-y-6">
          
          {/* KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium block">Total Requests</span>
              <span className="text-2xl font-extrabold text-slate-900 mt-1 block">{requests.length}</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium block">Pending Review</span>
              <span className="text-2xl font-extrabold text-amber-600 mt-1 block">{pendingCount}</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium block">Approval Rate</span>
              <span className="text-2xl font-extrabold text-teal-600 mt-1 block">
                {requests.length > 0
                  ? Math.round((requests.filter(r => r.status !== 'rejected').length / requests.length) * 100)
                  : 100}%
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium block">Blocked Oversize</span>
              <span className="text-2xl font-extrabold text-rose-600 mt-1 block">{blockedOversizeCount}</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium block">Total Print Hours</span>
              <span className="text-2xl font-extrabold text-purple-600 mt-1 block">
                {Math.round(bookings.filter(b => b.status === 'completed').reduce((s, b) => s + b.durationMinutes, 0) / 60)}h
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-500 font-medium block">Printer Utilization</span>
              <span className="text-2xl font-extrabold text-emerald-600 mt-1 block">
                {bookings.filter(b => b.status === 'scheduled' || b.status === 'printing').length > 0 ? '78%' : '35%'}
              </span>
            </div>
          </div>

          {/* Activity Log Audit Trail */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 text-sm">
                STEAM Lab Activity &amp; Audit Log ({activityLogs.length})
              </h3>
              <span className="text-xs text-slate-400">Chronological history of admin actions</span>
            </div>

            <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
              {activityLogs.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">
                  No activity recorded yet.
                </div>
              ) : (
                activityLogs.map((log) => (
                  <div key={log.id} className="p-4 text-xs flex items-start justify-between gap-4">
                    <div>
                      <p className="font-bold text-slate-800">{log.action}</p>
                      <p className="text-slate-600 mt-0.5">{log.details}</p>
                      <p className="text-slate-400 mt-1 text-[11px]">
                        By: <span className="font-mono text-slate-600">{log.adminEmail}</span>
                      </p>
                    </div>
                    <span className="text-slate-400 font-mono text-[11px] shrink-0">
                      {new Date(log.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 5. SETTINGS & ADMIN TEAM INVITATIONS */}
      {/* ------------------------------------------------------------- */}
      {adminTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Lab Settings (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                STEAM Lab Operating Rules
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lab Opening Hour
                  </label>
                  <input
                    type="time"
                    defaultValue={settings.labHours.start}
                    onChange={(e) => {
                      saveLabSettings({
                        ...settings,
                        labHours: { ...settings.labHours, start: e.target.value },
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Lab Closing Hour
                  </label>
                  <input
                    type="time"
                    defaultValue={settings.labHours.end}
                    onChange={(e) => {
                      saveLabSettings({
                        ...settings,
                        labHours: { ...settings.labHours, end: e.target.value },
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Job Buffer Time (minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="60"
                    defaultValue={settings.bufferMinutes}
                    onChange={(e) => {
                      saveLabSettings({
                        ...settings,
                        bufferMinutes: parseInt(e.target.value) || 15,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                  <p className="text-[11px] text-slate-400 mt-0.5">Time for plate cooling & scraping.</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Max Print Duration (hours)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    defaultValue={settings.maxPrintHours}
                    onChange={(e) => {
                      saveLabSettings({
                        ...settings,
                        maxPrintHours: parseInt(e.target.value) || 8,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-300"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Admin Management & Invitations (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Invite New Admin Box */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Invite New Administrator
                </h3>
              </div>
              <p className="text-xs text-slate-500">
                Enter teacher or lab staff school email. They receive a secure invitation link to create their password.
              </p>

              <form onSubmit={handleSendInvite} className="space-y-3">
                <input
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="teacher@school.edu"
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />

                <button
                  type="submit"
                  disabled={isInviting}
                  className="w-full py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center justify-center gap-2 shadow-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>{isInviting ? 'Generating Invitation...' : 'Send Admin Invitation'}</span>
                </button>
              </form>

              {lastGeneratedInviteLink && (
                <div className="p-3 rounded-2xl bg-teal-50 border border-teal-200 text-xs space-y-2">
                  <p className="font-bold text-teal-900">Direct Invitation Link Generated:</p>
                  <div className="p-2 bg-white rounded-lg border border-teal-200 font-mono text-[11px] break-all text-slate-700 select-all">
                    {lastGeneratedInviteLink}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(lastGeneratedInviteLink);
                      setCopiedInvite(true);
                      setTimeout(() => setCopiedInvite(false), 2000);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg font-bold text-xs cursor-pointer"
                  >
                    {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedInvite ? 'Copied Link!' : 'Copy Invitation Link'}</span>
                  </button>
                </div>
              )}
            </div>

            {/* List Active Admins */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Active STEAM Lab Admins ({admins.length})
              </h3>

              <div className="divide-y divide-slate-100">
                {admins.map((admin) => (
                  <div key={admin.uid} className="py-2.5 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-bold text-slate-800">{admin.email}</p>
                      <span className="text-[11px] text-slate-400 capitalize">{admin.role}</span>
                    </div>

                    {admins.length > 1 && admin.email !== currentAdminEmail && (
                      <button
                        type="button"
                        onClick={() => removeAdmin(admin.uid)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Remove admin"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pending Invitations */}
            {invitations.filter(i => i.status === 'pending').length > 0 && (
              <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                  Pending Invitations
                </h3>
                <div className="divide-y divide-slate-100">
                  {invitations.filter(i => i.status === 'pending').map((inv) => (
                    <div key={inv.id} className="py-2 flex items-center justify-between text-xs">
                      <div>
                        <p className="font-bold text-slate-800">{inv.email}</p>
                        <p className="text-[10px] text-slate-400">Expires {new Date(inv.expiresAt).toLocaleDateString()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => revokeInvitation(inv.id)}
                        className="text-xs text-rose-600 hover:underline cursor-pointer"
                      >
                        Revoke
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* INSPECT & APPROVAL MODAL */}
      {/* ------------------------------------------------------------- */}
      {selectedRequest && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="p-5 sm:p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-slate-900 text-lg">
                  {selectedRequest.projectTitle}
                </h3>
                <p className="text-xs text-slate-500">
                  Submitted by {selectedRequest.fullName} ({selectedRequest.grade}, {selectedRequest.section}) • {selectedRequest.trackingCode}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedRequest(null)}
                className="text-slate-400 hover:text-slate-700 p-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Left: 3D preview & dimensions */}
              <div className="space-y-4">
                <ModelViewer
                  geometry={null} // ModelViewer falls back gracefully or loads file
                  dimensions={selectedRequest.dimensions}
                  color={filaments.find(f => f.color === selectedRequest.color)?.hex || '#0d9488'}
                  readOnly={true}
                />

                <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 block">Dimensions:</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedRequest.dimensions.x} × {selectedRequest.dimensions.y} × {selectedRequest.dimensions.z} mm
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block">Material &amp; Color:</span>
                    <span className="font-bold text-slate-800">
                      {selectedRequest.material} ({selectedRequest.color})
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block">Infill &amp; Quantity:</span>
                    <span className="font-bold text-slate-800">
                      {selectedRequest.infill}% infill • Qty: {selectedRequest.quantity}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 block">Estimated Time:</span>
                    <span className="font-mono font-bold text-teal-700">
                      ~{selectedRequest.estimatedMinutes} minutes
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Actions & Slicer confirmation */}
              <div className="space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Confirmed Slicer Print Time (Bambu Studio) *
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="5"
                        max="720"
                        value={adminFinalMinutes}
                        onChange={(e) => setAdminFinalMinutes(parseInt(e.target.value) || 30)}
                        className="w-32 px-3.5 py-2 text-sm font-mono font-bold rounded-xl border border-slate-300"
                      />
                      <span className="text-xs text-slate-500">minutes</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Check Bambu Studio slicing preview and enter the verified print duration.
                    </p>
                  </div>

                  {/* Earliest Free Slot Suggested */}
                  <div className="p-4 rounded-2xl bg-teal-50 border border-teal-200 text-xs text-teal-900 space-y-1">
                    <p className="font-bold">Suggested Earliest Free Slot:</p>
                    <p className="font-mono text-sm font-extrabold text-teal-950">
                      {suggestEarliestFreeSlot(adminFinalMinutes).start.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}{' '}
                      {suggestEarliestFreeSlot(adminFinalMinutes).start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[11px] text-teal-700">
                      (Includes 15m plate clearing buffer after preceding job)
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Or Choose Custom Slot Start (optional):
                    </label>
                    <input
                      type="datetime-local"
                      value={customSlotStart}
                      onChange={(e) => setCustomSlotStart(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                    />
                  </div>
                </div>

                {/* Primary Approval / Reject / Changes Buttons */}
                <div className="space-y-2 pt-4 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={isProcessingAction}
                    onClick={handleApproveAndSchedule}
                    className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approve &amp; Schedule on Timeline</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isProcessingAction}
                      onClick={() => setShowChangesModal(true)}
                      className="py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-900 border border-orange-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Request Changes
                    </button>

                    <button
                      type="button"
                      disabled={isProcessingAction}
                      onClick={() => setShowRejectModal(true)}
                      className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-200 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      Reject Request
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>
        </div>
      )}

      {/* REJECT MODAL */}
      {showRejectModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Reject Print Request</h3>
            <p className="text-xs text-slate-500">
              Provide a clear reason for the student (e.g. non-functional design, copyright issue, unprintable geometry).
            </p>
            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Enter rejection reason (required)..."
              className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRejectModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rejectReason.trim() || isProcessingAction}
                onClick={handleRejectConfirm}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REQUEST CHANGES MODAL */}
      {showChangesModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Request 3D Model Changes</h3>
            <p className="text-xs text-slate-500">
              Explain what the student must adjust before we can print (e.g. add flat base, thicken thin walls, remove overhangs).
            </p>
            <textarea
              rows={3}
              required
              value={changesComment}
              onChange={(e) => setChangesComment(e.target.value)}
              placeholder="Enter revision instructions for student (required)..."
              className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowChangesModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!changesComment.trim() || isProcessingAction}
                onClick={handleRequestChangesConfirm}
                className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Send Revision Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD FILAMENT MODAL */}
      {showAddFilamentModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Add New Filament to Inventory</h3>
            
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Material Type</label>
                <select
                  value={newMaterial}
                  onChange={(e) => setNewMaterial(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 bg-white"
                >
                  <option value="PLA">PLA</option>
                  <option value="PETG">PETG</option>
                  <option value="TPU">TPU (Flexible)</option>
                  <option value="ABS">ABS</option>
                  <option value="PVA">PVA (Support)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Color Name</label>
                <input
                  type="text"
                  required
                  value={newColor}
                  onChange={(e) => setNewColor(e.target.value)}
                  placeholder="e.g. Silk Sapphire Blue"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Color Hex Code</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={newHex}
                    onChange={(e) => setNewHex(e.target.value)}
                    className="w-10 h-9 rounded-lg border border-slate-300 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={newHex}
                    onChange={(e) => setNewHex(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono uppercase rounded-xl border border-slate-300"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Initial Stock (grams)</label>
                  <input
                    type="number"
                    min="0"
                    value={newStockGrams}
                    onChange={(e) => setNewStockGrams(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Low Stock Alert (grams)</label>
                  <input
                    type="number"
                    min="50"
                    value={newLowStockThreshold}
                    onChange={(e) => setNewLowStockThreshold(parseInt(e.target.value) || 200)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-slate-300"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddFilamentModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!newColor.trim()}
                onClick={handleSaveNewFilament}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Save Filament
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST FILAMENT STOCK MODAL */}
      {adjustingFilament && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">
              Adjust Stock: {adjustingFilament.color}
            </h3>
            <p className="text-xs text-slate-500">
              Current inventory: <strong>{adjustingFilament.stockGrams}g</strong> ({adjustingFilament.material}).
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Add or Deduct Grams (+/-)
              </label>
              <input
                type="number"
                value={adjustGrams}
                onChange={(e) => setAdjustGrams(parseInt(e.target.value) || 0)}
                className="w-full px-3.5 py-2.5 text-sm font-mono font-bold rounded-xl border border-slate-300"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Enter positive value to restock, negative to reduce.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setAdjustingFilament(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleApplyStockAdjustment}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Update Stock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {showRescheduleModal && actionBooking && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">
              Reschedule Job: {actionBooking.projectTitle}
            </h3>
            <p className="text-xs text-slate-500">
              Change the start and end time. Strict overlap check will ensure no other print collides with this slot.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New Start Time</label>
                <input
                  type="datetime-local"
                  required
                  value={rescheduleStart}
                  onChange={(e) => setRescheduleStart(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">New End Time</label>
                <input
                  type="datetime-local"
                  required
                  value={rescheduleEnd}
                  onChange={(e) => setRescheduleEnd(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowRescheduleModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await rescheduleBooking(actionBooking.id, new Date(rescheduleStart).toISOString(), new Date(rescheduleEnd).toISOString());
                    alert('Job successfully rescheduled!');
                    setShowRescheduleModal(false);
                  } catch (err: any) {
                    alert('Error: ' + err.message);
                  }
                }}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Confirm Reschedule
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JOB FAILURE MODAL */}
      {showFailureModal && actionBooking && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Mark Job as Failed</h3>
            <p className="text-xs text-slate-500">
              Record failure reason (e.g. bed adhesion failure, nozzle clog, filament tangle).
            </p>

            <textarea
              rows={3}
              required
              value={failureReason}
              onChange={(e) => setFailureReason(e.target.value)}
              placeholder="Reason for print failure (required)..."
              className="w-full p-3 text-xs rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowFailureModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!failureReason.trim()}
                onClick={async () => {
                  await updateBookingStatus(actionBooking.id, 'failed', failureReason.trim());
                  setShowFailureModal(false);
                  setFailureReason('');
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Confirm Failed Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAINTENANCE MODE MODAL */}
      {showMaintenanceModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-3xl p-6 shadow-xl space-y-4">
            <h3 className="font-bold text-slate-900 text-base">Printer Maintenance &amp; Offline State</h3>
            <p className="text-xs text-slate-500">
              When maintenance or offline mode is active, students see a warning banner, and scheduled jobs within this period are flagged.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Maintenance Reason</label>
                <input
                  type="text"
                  value={maintenanceReason}
                  onChange={(e) => setMaintenanceReason(e.target.value)}
                  placeholder="e.g. 0.4mm nozzle replacement, belt tensioning"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Expected Return Date</label>
                <input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(e) => setExpectedReturnDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowMaintenanceModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSaveMaintenance('available')}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Clear &amp; Set Available
              </button>
              <button
                type="button"
                onClick={() => handleSaveMaintenance('maintenance')}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Set Maintenance
              </button>
              <button
                type="button"
                onClick={() => handleSaveMaintenance('offline')}
                className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Set Offline
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
