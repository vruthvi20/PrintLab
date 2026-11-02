import React from 'react';
import { 
  Printer, 
  Calendar, 
  PlusCircle, 
  ListFilter, 
  ShieldCheck, 
  LogOut, 
  AlertCircle, 
  Clock,
  Wrench,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import { PrinterStatus, PrinterStatusCode } from '../types';
import { User } from 'firebase/auth';

interface NavbarProps {
  activeTab: 'submit' | 'my-requests' | 'schedule' | 'admin';
  setActiveTab: (tab: 'submit' | 'my-requests' | 'schedule' | 'admin') => void;
  printerStatus: PrinterStatus | null;
  adminUser: User | null;
  isAdmin: boolean;
  myRequestsCount: number;
  onOpenAdminLogin: () => void;
  onAdminLogout: () => void;
  nextAvailableSlotText: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  setActiveTab,
  printerStatus,
  adminUser,
  isAdmin,
  myRequestsCount,
  onOpenAdminLogin,
  onAdminLogout,
  nextAvailableSlotText,
}) => {
  const getStatusBadge = (status: PrinterStatusCode) => {
    switch (status) {
      case 'available':
        return {
          bg: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          dot: 'bg-emerald-500',
          label: 'Available',
          icon: CheckCircle2,
        };
      case 'printing':
        return {
          bg: 'bg-teal-50 text-teal-700 border-teal-200',
          dot: 'bg-teal-500',
          label: 'Printing',
          icon: Clock,
        };
      case 'maintenance':
        return {
          bg: 'bg-amber-50 text-amber-800 border-amber-200',
          dot: 'bg-amber-500',
          label: 'Maintenance',
          icon: Wrench,
        };
      case 'offline':
      default:
        return {
          bg: 'bg-rose-50 text-rose-700 border-rose-200',
          dot: 'bg-rose-500',
          label: 'Offline',
          icon: AlertCircle,
        };
    }
  };

  const currentStatus = printerStatus?.status || 'available';
  const badge = getStatusBadge(currentStatus);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-20">
          
          {/* Logo & Lab Title */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('submit')}>
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-gradient-to-tr from-teal-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-teal-600/20">
              <Printer className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-slate-900">
                  Print<span className="text-teal-600">Lab</span>
                </span>
                <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-teal-100 text-teal-800 border border-teal-200/60">
                  STEAM Lab
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium hidden sm:block">
                Bambu Lab A1 mini • 180 × 180 mm
              </p>
            </div>
          </div>

          {/* Live Printer Status & Next Free Slot Indicator (Desktop) */}
          <div className="hidden lg:flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${badge.bg}`}>
              <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
              <span>Printer: {badge.label}</span>
              {currentStatus === 'printing' && printerStatus?.currentJobTitle && (
                <span className="text-teal-900 font-normal truncate max-w-[140px]">
                  ({printerStatus.currentJobTitle})
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200/80 text-xs text-slate-600 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span>Next slot:</span>
              <span className="font-semibold text-slate-800">{nextAvailableSlotText}</span>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <nav className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setActiveTab('submit')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'submit'
                    ? 'bg-white text-teal-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <PlusCircle className="w-4 h-4" />
                <span className="hidden xs:inline">New Print</span>
                <span className="xs:hidden">Submit</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('my-requests')}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'my-requests'
                    ? 'bg-white text-teal-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <ListFilter className="w-4 h-4" />
                <span>My Requests</span>
                {myRequestsCount > 0 && (
                  <span className="w-5 h-5 flex items-center justify-center rounded-full bg-teal-600 text-white text-[11px] font-bold">
                    {myRequestsCount}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('schedule')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all cursor-pointer ${
                  activeTab === 'schedule'
                    ? 'bg-white text-teal-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Calendar className="w-4 h-4" />
                <span className="hidden sm:inline">Lab Schedule</span>
                <span className="sm:hidden">Schedule</span>
              </button>
            </nav>

            {/* Admin Access Button */}
            {isAdmin && adminUser ? (
              <div className="flex items-center gap-1.5 pl-1 sm:pl-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all cursor-pointer ${
                    activeTab === 'admin'
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
                <button
                  type="button"
                  onClick={onAdminLogout}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                  title="Sign out of Admin"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAdminLogin}
                className="ml-1 sm:ml-2 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Management Team Sign In"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Staff</span>
              </button>
            )}

          </div>

        </div>

        {/* Mobile Live Status Banner */}
        <div className="lg:hidden py-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
            <span className="font-semibold text-slate-700">A1 mini: {badge.label}</span>
          </div>
          <div className="text-slate-500">
            Next slot: <span className="font-semibold text-slate-800">{nextAvailableSlotText}</span>
          </div>
        </div>

      </div>
    </header>
  );
};
