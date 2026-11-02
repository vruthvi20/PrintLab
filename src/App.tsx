import React, { useState, useEffect, useMemo } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { 
  auth, 
  isFirebaseConfigured, 
  testConnection 
} from './firebaseConfig';
import { 
  PrintRequest, 
  Booking, 
  PrinterStatus, 
  FilamentItem, 
  LabSettings, 
  AdminUser, 
  AdminInvitation, 
  ActivityLog 
} from './types';
import { 
  initializeDatabaseDefaults,
  checkIsAdmin,
  getAdminCount,
  subscribeToFilaments,
  subscribeToPrinterStatus,
  subscribeToBookings,
  subscribeToAllRequests,
  subscribeToAnalytics,
  subscribeToActivityLogs,
  getLabSettings,
  listAdmins,
  listInvitations,
  DEFAULT_LAB_SETTINGS,
  DEFAULT_FILAMENTS
} from './services/firebaseService';
import { Navbar } from './components/Navbar';
import { StudentPortal } from './components/StudentPortal';
import { AdminPortal } from './components/AdminPortal';
import { AdminLoginModal } from './components/AdminLoginModal';
import { AcceptInviteModal } from './components/AcceptInviteModal';
import { FirebaseSetupNotice } from './components/FirebaseSetupNotice';
import { Footer } from './components/Footer';

export default function App() {
  // Check if Firebase configuration is provided
  if (!isFirebaseConfigured()) {
    return <FirebaseSetupNotice />;
  }

  // App Navigation State
  const [activeTab, setActiveTab] = useState<'submit' | 'my-requests' | 'schedule' | 'admin'>('submit');

  // Auth & Admin State
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCount, setAdminCount] = useState(1);
  const [showAdminLoginModal, setShowAdminLoginModal] = useState(false);
  const [inviteTokenFromUrl, setInviteTokenFromUrl] = useState<string | null>(null);

  // Firestore Real-time Collections State
  const [filaments, setFilaments] = useState<FilamentItem[]>(DEFAULT_FILAMENTS);
  const [printerStatus, setPrinterStatus] = useState<PrinterStatus | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allRequests, setAllRequests] = useState<PrintRequest[]>([]);
  const [settings, setSettings] = useState<LabSettings>(DEFAULT_LAB_SETTINGS);
  const [adminsList, setAdminsList] = useState<AdminUser[]>([]);
  const [invitationsList, setInvitationsList] = useState<AdminInvitation[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [blockedOversizeCount, setBlockedOversizeCount] = useState(0);

  // My requests count from local storage
  const [savedCodes, setSavedCodes] = useState<string[]>([]);

  // Initial connection test and database seeding
  useEffect(() => {
    testConnection();
    initializeDatabaseDefaults();
    getLabSettings().then(setSettings);
    getAdminCount().then(setAdminCount);

    // Check if invite token exists in URL
    const params = new URLSearchParams(window.location.search);
    const token = params.get('inviteToken');
    if (token) {
      setInviteTokenFromUrl(token);
    }

    // Load saved tracking codes from local storage
    try {
      const stored = JSON.parse(localStorage.getItem('printlab_my_tracking_codes') || '[]');
      if (Array.isArray(stored)) {
        setSavedCodes(stored);
      }
    } catch {
      // ignore
    }
  }, []);

  // Listen for Firebase Auth changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        const adminCheck = await checkIsAdmin(user);
        setIsAdmin(adminCheck);
        if (!adminCheck && activeTab === 'admin') {
          setActiveTab('submit');
        }
      } else {
        setIsAdmin(false);
        if (activeTab === 'admin') {
          setActiveTab('submit');
        }
      }
    });

    return () => unsubscribe();
  }, [activeTab]);

  // Real-time Subscriptions (Filaments, Printer Status, Bookings, Analytics)
  useEffect(() => {
    const unsubFilaments = subscribeToFilaments(setFilaments);
    const unsubPrinter = subscribeToPrinterStatus(setPrinterStatus);
    const unsubBookings = subscribeToBookings(setBookings);
    const unsubAnalytics = subscribeToAnalytics(setBlockedOversizeCount);

    return () => {
      unsubFilaments();
      unsubPrinter();
      unsubBookings();
      unsubAnalytics();
    };
  }, []);

  // Subscriptions when admin is authenticated
  useEffect(() => {
    if (isAdmin) {
      const unsubRequests = subscribeToAllRequests(setAllRequests);
      const unsubLogs = subscribeToActivityLogs(setActivityLogs);
      listAdmins().then(setAdminsList);
      listInvitations().then(setInvitationsList);

      return () => {
        unsubRequests();
        unsubLogs();
      };
    } else {
      // For students, fetch public requests if needed
      const unsubRequests = subscribeToAllRequests((reqs) => {
        setAllRequests(reqs);
      });
      return () => unsubRequests();
    }
  }, [isAdmin]);

  // Calculate Next Available Slot Text
  const nextAvailableSlotText = useMemo(() => {
    if (!printerStatus || printerStatus.status === 'offline') {
      return 'Printer Offline';
    }
    if (printerStatus.status === 'maintenance') {
      return 'In Maintenance';
    }

    const activeBookings = bookings.filter(
      (b) => b.status === 'scheduled' || b.status === 'printing'
    );

    if (activeBookings.length === 0 && printerStatus.status === 'available') {
      return 'Available Now';
    }

    // Find latest end time among active bookings
    let maxEnd = new Date();
    activeBookings.forEach((b) => {
      const end = new Date(b.endTime);
      if (end > maxEnd) maxEnd = end;
    });

    // Add 15 mins buffer
    const nextSlot = new Date(maxEnd.getTime() + 15 * 60 * 1000);
    const isToday = nextSlot.toDateString() === new Date().toDateString();

    const timeStr = nextSlot.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (isToday) {
      return `Today ${timeStr}`;
    }
    return `${nextSlot.toLocaleDateString([], { weekday: 'short' })} ${timeStr}`;
  }, [printerStatus, bookings]);

  // Handle Admin Logout
  const handleAdminLogout = async () => {
    await signOut(auth);
    setIsAdmin(false);
    setActiveTab('submit');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 selection:bg-teal-500 selection:text-white">
      
      {/* Top Navigation Bar */}
      <Navbar
        activeTab={activeTab}
        setActiveTab={(tab) => {
          if (tab === 'admin' && !isAdmin) {
            setShowAdminLoginModal(true);
          } else {
            setActiveTab(tab);
          }
        }}
        printerStatus={printerStatus}
        adminUser={authUser}
        isAdmin={isAdmin}
        myRequestsCount={savedCodes.length}
        onOpenAdminLogin={() => setShowAdminLoginModal(true)}
        onAdminLogout={handleAdminLogout}
        nextAvailableSlotText={nextAvailableSlotText}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'admin' && isAdmin ? (
          <AdminPortal
            requests={allRequests}
            bookings={bookings}
            printerStatus={printerStatus}
            filaments={filaments}
            settings={settings}
            admins={adminsList}
            invitations={invitationsList}
            activityLogs={activityLogs}
            blockedOversizeCount={blockedOversizeCount}
            currentAdminEmail={authUser?.email || 'admin@school.edu'}
          />
        ) : (
          <StudentPortal
            initialTab={activeTab as 'submit' | 'my-requests' | 'schedule'}
            filaments={filaments}
            bookings={bookings}
            printerStatus={printerStatus}
            allRequests={allRequests}
          />
        )}
      </main>

      {/* Footer */}
      <Footer
        isAdmin={isAdmin}
        onOpenAdminLogin={() => setShowAdminLoginModal(true)}
        onOpenAdminDashboard={() => setActiveTab('admin')}
      />

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={showAdminLoginModal}
        onClose={() => setShowAdminLoginModal(false)}
        adminCount={adminCount}
        onLoginSuccess={() => {
          setIsAdmin(true);
          setActiveTab('admin');
        }}
      />

      {/* Accept Invitation Modal (when URL has ?inviteToken=...) */}
      <AcceptInviteModal
        inviteToken={inviteTokenFromUrl}
        onSuccess={() => {
          setInviteTokenFromUrl(null);
          // Clean URL parameter
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsAdmin(true);
          setActiveTab('admin');
        }}
        onClose={() => {
          setInviteTokenFromUrl(null);
          window.history.replaceState({}, document.title, window.location.pathname);
        }}
      />

    </div>
  );
}
