import { useState, useCallback, useEffect } from 'react';
import { safeGetItem, safeSetItem, safeRemoveItem } from './utils/polyfills';
import { ActiveTab, ToastMessage, UserRole, SpbSession, EventSession, HajatanSession } from './types';
import { Header } from './components/Header';
import { PinModal } from './components/PinModal';
import { Dashboard } from './components/Dashboard';
import { SpbForm } from './components/SpbForm';
import { EventForm } from './components/EventForm';
import { HajatanForm } from './components/HajatanForm';
import { ToastContainer } from './components/ToastContainer';
import { GoogleSheetsModal } from './components/GoogleSheetsModal';

export default function App() {
  // Authentication Role: 'user' | 'admin' | null
  const [userRole, setUserRole] = useState<UserRole>(() => {
    const saved = safeGetItem('ao_tasik_access_role');
    return saved === 'user' || saved === 'admin' ? saved : null;
  });

  // Current active navigation tab
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');

  // Auto-open Report Harian navigation states
  const [autoOpenSpbReport, setAutoOpenSpbReport] = useState(false);
  const [autoOpenEventReport, setAutoOpenEventReport] = useState(false);
  const [reportTargetDate, setReportTargetDate] = useState<string | undefined>(undefined);
  const [reportTargetAllDates, setReportTargetAllDates] = useState<boolean | undefined>(undefined);

  const handleNavigateToSpbReport = (date?: string, allDates?: boolean) => {
    setReportTargetDate(date);
    setReportTargetAllDates(allDates);
    setAutoOpenSpbReport(true);
    setActiveTab('spb');
  };

  const handleNavigateToEventReport = (date?: string, allDates?: boolean) => {
    setReportTargetDate(date);
    setReportTargetAllDates(allDates);
    setAutoOpenEventReport(true);
    setActiveTab('event');
  };

  // Google Sheets modal
  const [isGoogleSheetsModalOpen, setIsGoogleSheetsModalOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info') => {
      const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // SPB Session
  const [spbSession, setSpbSession] = useState<SpbSession>(() => {
    const isLogged = safeGetItem('spb_logged_in') === 'true';
    const name = safeGetItem('spb_name') || '';
    const loginTime = safeGetItem('spb_login_time') || '';
    return {
      isLoggedIn: isLogged,
      spbName: name,
      loginTime: loginTime,
    };
  });

  // Event Session
  const [eventSession, setEventSession] = useState<EventSession>(() => {
    const isLogged = safeGetItem('event_pic_logged_in') === 'true';
    const name = safeGetItem('event_pic_name') || '';
    const tipe = safeGetItem('event_tipe_event') || '';
    const brand = safeGetItem('event_brand_event') || '';
    const id = safeGetItem('event_id_event') || '';
    const loginTime = safeGetItem('event_pic_login_time') || '';
    return {
      isLoggedIn: isLogged,
      picName: name,
      tipeEvent: tipe,
      brandEvent: brand,
      idEvent: id,
      loginTime: loginTime,
    };
  });

  // Hajatan Session
  const [hajatanSession, setHajatanSession] = useState<HajatanSession>(() => {
    const isLogged = safeGetItem('hajatan_pic_logged_in') === 'true';
    const name = safeGetItem('hajatan_pic_name') || '';
    const acara = safeGetItem('hajatan_nama_acara') || '';
    const lokasi = safeGetItem('hajatan_lokasi_acara') || '';
    const loginTime = safeGetItem('hajatan_pic_login_time') || '';
    return {
      isLoggedIn: isLogged,
      picName: name,
      namaHajatan: acara,
      lokasiHajatan: lokasi,
      loginTime: loginTime,
    };
  });

  // On mount check if URL params direct to spb
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('id') && params.has('nama')) {
        setActiveTab('spb');
      }
    } catch {
      // Ignore
    }
  }, []);

  // Handle PIN authentication
  const handleAuthenticate = (role: UserRole) => {
    if (role) {
      safeSetItem('ao_tasik_access_role', role);
      setUserRole(role);
      showToast(
        `Berhasil masuk sebagai ${role === 'admin' ? 'Admin' : 'User'}`,
        'success'
      );
    }
  };

  // Handle Logout / Ganti PIN
  const handleLogoutPin = () => {
    safeRemoveItem('ao_tasik_access_role');
    setUserRole(null);
    setActiveTab('dashboard');
    showToast('Berhasil keluar. Silakan masukkan PIN kembali.', 'info');
  };

  // If not authenticated, show PIN modal
  if (!userRole) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] font-sans antialiased text-[#D4D4D4]">
        <PinModal onAuthenticate={handleAuthenticate} />
        <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] font-sans antialiased text-[#D4D4D4] flex flex-col selection:bg-amber-500/30 selection:text-white">
      {/* Top sticky navigation bar */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        spbLoggedIn={spbSession.isLoggedIn}
        eventLoggedIn={eventSession.isLoggedIn}
        hajatanLoggedIn={hajatanSession.isLoggedIn}
        spbName={spbSession.spbName}
        eventPicName={eventSession.picName}
        userRole={userRole}
        onLogoutPin={handleLogoutPin}
      />

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'dashboard' && (
          <Dashboard
            onSelectTab={(tab) => setActiveTab(tab)}
            userRole={userRole}
            onOpenGoogleSheets={() => setIsGoogleSheetsModalOpen(true)}
            onNavigateToSpbReport={handleNavigateToSpbReport}
            onNavigateToEventReport={handleNavigateToEventReport}
          />
        )}

        {activeTab === 'spb' && (
          <SpbForm
            session={spbSession}
            setSession={setSpbSession}
            onShowToast={showToast}
            autoOpenReport={autoOpenSpbReport}
            initialReportDate={reportTargetDate}
            initialReportAllDates={reportTargetAllDates}
            onCloseAutoReport={() => setAutoOpenSpbReport(false)}
          />
        )}

        {activeTab === 'event' && (
          <EventForm
            session={eventSession}
            setSession={setEventSession}
            onShowToast={showToast}
            autoOpenReport={autoOpenEventReport}
            initialReportDate={reportTargetDate}
            initialReportAllDates={reportTargetAllDates}
            onCloseAutoReport={() => setAutoOpenEventReport(false)}
          />
        )}

        {activeTab === 'hajatan' && (
          <HajatanForm
            session={hajatanSession}
            setSession={setHajatanSession}
            onShowToast={showToast}
          />
        )}
      </main>

      {/* Google Sheets Live Sync Modal */}
      <GoogleSheetsModal
        isOpen={isGoogleSheetsModalOpen}
        onClose={() => setIsGoogleSheetsModalOpen(false)}
        onShowToast={showToast}
      />

      {/* Floating Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
