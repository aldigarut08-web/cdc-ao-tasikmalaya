import React, { useEffect, useState } from 'react';
import { ActiveTab, AllSummaryStats, UserRole } from '../types';
import {
  calculateAllSummary,
  getSpbRecords,
  isDateMatch,
  seedSampleSpbRecords,
} from '../services/storage';
import {
  exportAllDatabase,
  exportEventExcel,
  exportHajatanExcel,
  exportSPBExcel,
} from '../services/excel';
import {
  CalendarCheck,
  Download,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  FileSpreadsheet,
  ArrowRight,
  ExternalLink,
  RefreshCw,
  Sparkles,
  Link2,
  Calendar,
  Filter,
  Users,
  Store,
  MapPin,
  Activity,
  ChevronDown,
  ChevronUp,
  Zap,
  AlertCircle,
} from 'lucide-react';
import {
  GoogleSheetsConfig,
  getSavedGoogleSheetConfig,
  syncAllDataToSpreadsheet,
  getAppsScriptWebhookUrl,
  pullDataFromGoogleSheet,
  TARGET_SPREADSHEET_ID,
  TARGET_SPREADSHEET_URL,
} from '../services/googleSheets';
import { getTodayDateString } from '../utils/geo';

export interface SpbPersonSummary {
  name: string;
  stores: string[];
  contact: number;
  trial: number;
  selling: number;
}

interface DashboardProps {
  onSelectTab: (tab: ActiveTab) => void;
  userRole: UserRole;
  onOpenGoogleSheets?: () => void;
  onNavigateToSpbReport?: (date?: string, allDates?: boolean) => void;
  onNavigateToEventReport?: (date?: string, allDates?: boolean) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  onSelectTab,
  userRole = 'admin',
  onOpenGoogleSheets,
  onNavigateToSpbReport,
  onNavigateToEventReport,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() =>
    getTodayDateString()
  );
  const [isAllDates, setIsAllDates] = useState<boolean>(false);
  const [showDetailActivities, setShowDetailActivities] = useState<boolean>(true);

  const [stats, setStats] = useState<AllSummaryStats>({
    spb: { consumerContact: 0, trialPerson: 0, totalSelling: 0 },
    event: { consumerContact: 0, trialPerson: 0, totalSelling: 0 },
    hajatan: { consumerContact: 0, trialPerson: 0, totalSelling: 0 },
    isLoading: true,
  });

  const [spbBreakdown, setSpbBreakdown] = useState<SpbPersonSummary[]>([]);
  const [isPullingGSheet, setIsPullingGSheet] = useState(false);
  const [pullNotice, setPullNotice] = useState<{
    message: string;
    isError?: boolean;
    needScriptUpdate?: boolean;
    time?: string;
  } | null>(null);

  const [downloadingType, setDownloadingType] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const [gsheetConfig, setGsheetConfig] = useState<GoogleSheetsConfig | null>(() =>
    getSavedGoogleSheetConfig()
  );
  const [isSyncingGSheet, setIsSyncingGSheet] = useState(false);

  const todayStr = getTodayDateString();
  const getYesterdayStr = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getTodayDateString(d);
  };
  const yesterdayStr = getYesterdayStr();

  const formatDisplayDate = (dateStr: string) => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return dt.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const loadStats = async (
    date: string = selectedDate,
    allDates: boolean = isAllDates
  ) => {
    setStats((prev) => ({ ...prev, isLoading: true }));
    try {
      const [data, allSpb] = await Promise.all([
        calculateAllSummary(date, allDates),
        getSpbRecords(),
      ]);
      setStats(data);

      const filteredSpb = allDates || !date
        ? allSpb
        : allSpb.filter((r) => isDateMatch(r, date, allDates));

      const groupMap = new Map<string, SpbPersonSummary>();
      filteredSpb.forEach((r) => {
        const name = (r.nama_spb || (r as any).NAMA_SPB || 'Tanpa Nama').trim() || 'Tanpa Nama';
        const store = (r.nama_toko || (r as any).NAMA_TOKO || r.kode_toko || '').trim();
        const isBeli = (r.beli_gg || (r as any).BELI_GG || '').toString().trim().toUpperCase() === 'YA';
        const qty = parseInt(
          r.qty_gg || (r as any).QTY_GG || r.quantity_pack_sold || (r as any).bungkus_gg || '0',
          10
        );
        const sellingQty = isNaN(qty) ? 0 : qty;
        // Trial Person: jumlah orang yang melakukan pembelian
        const isTrial = isBeli || sellingQty > 0;

        if (!groupMap.has(name)) {
          groupMap.set(name, {
            name,
            stores: store ? [store] : [],
            contact: 1,
            trial: isTrial ? 1 : 0,
            selling: sellingQty,
          });
        } else {
          const existing = groupMap.get(name)!;
          existing.contact += 1;
          if (isTrial) existing.trial += 1;
          existing.selling += sellingQty;
          if (store && !existing.stores.includes(store)) {
            existing.stores.push(store);
          }
        }
      });
      setSpbBreakdown(Array.from(groupMap.values()));
    } catch {
      setStats((prev) => ({ ...prev, isLoading: false }));
    }
  };

  const handlePullFromGSheet = async (silent: boolean = false) => {
    setIsPullingGSheet(true);
    if (!silent) {
      setPullNotice({
        message: 'Sedang menarik data langsung dari baris Google Sheet...',
      });
    }
    try {
      const res = await pullDataFromGoogleSheet();
      if (res.success) {
        setPullNotice({
          message: `Berhasil tersinkronisasi: ${res.totalSpb} Tracking SPB, ${res.totalEvent} Event, ${res.totalHajatan} Hajatan termuat dari Google Sheet!`,
          time: new Date().toLocaleTimeString('id-ID'),
        });
        await loadStats(selectedDate, isAllDates);
        if (!silent) {
          setTimeout(() => setPullNotice(null), 7000);
        }
      } else {
        setPullNotice({
          message: res.message,
          isError: !res.needScriptUpdate,
          needScriptUpdate: res.needScriptUpdate,
          time: new Date().toLocaleTimeString('id-ID'),
        });
      }
    } catch (err: any) {
      if (!silent) {
        setPullNotice({
          message: `Gagal menarik data dari Google Sheet: ${err?.message || 'Periksa koneksi'}`,
          isError: true,
          time: new Date().toLocaleTimeString('id-ID'),
        });
      }
    } finally {
      setIsPullingGSheet(false);
    }
  };

  const handleLoadSampleSpb = async () => {
    seedSampleSpbRecords(selectedDate);
    await loadStats(selectedDate, isAllDates);
    setPullNotice({
      message: 'Contoh data survey SPB (simulasi) berhasil dimuat ke dashboard!',
      time: new Date().toLocaleTimeString('id-ID'),
    });
  };

  useEffect(() => {
    loadStats(selectedDate, isAllDates);
  }, [selectedDate, isAllDates]);

  useEffect(() => {
    // Initial pull on dashboard load
    handlePullFromGSheet(true);

    // Auto-sync polling every 25 seconds for real-time dashboard updates
    const timer = setInterval(() => {
      handlePullFromGSheet(true);
    }, 25000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleUpdate = () => loadStats(selectedDate, isAllDates);
    const handleGSheetUpdate = (e: any) => setGsheetConfig(e.detail);
    const handlePulled = () => loadStats(selectedDate, isAllDates);

    window.addEventListener('spb_records_updated', handleUpdate);
    window.addEventListener('event_records_updated', handleUpdate);
    window.addEventListener('hajatan_records_updated', handleUpdate);
    window.addEventListener('google_sheets_config_updated', handleGSheetUpdate);
    window.addEventListener('google_sheets_data_pulled', handlePulled);

    return () => {
      window.removeEventListener('spb_records_updated', handleUpdate);
      window.removeEventListener('event_records_updated', handleUpdate);
      window.removeEventListener('hajatan_records_updated', handleUpdate);
      window.removeEventListener(
        'google_sheets_config_updated',
        handleGSheetUpdate
      );
      window.removeEventListener('google_sheets_data_pulled', handlePulled);
    };
  }, [selectedDate, isAllDates]);

  const handleDirectSyncGSheet = async () => {
    if (!gsheetConfig?.spreadsheetId) {
      if (onOpenGoogleSheets) onOpenGoogleSheets();
      return;
    }
    setIsSyncingGSheet(true);
    setExportMessage('Menyinkronkan seluruh database ke Google Sheet...');
    try {
      const res = await syncAllDataToSpreadsheet(gsheetConfig.spreadsheetId);
      setGsheetConfig(getSavedGoogleSheetConfig());
      setExportMessage(
        `Sukses sinkron ke Google Sheet: ${res.totalSpb} SPB, ${res.totalEvent} Event, ${res.totalHajatan} Hajatan!`
      );
      setTimeout(() => setExportMessage(null), 6000);
    } catch (err: any) {
      setExportMessage(
        `Gagal sinkronisasi Google Sheet: ${err?.message || 'Hubungkan kembali akun'}`
      );
      setTimeout(() => setExportMessage(null), 8000);
    } finally {
      setIsSyncingGSheet(false);
    }
  };

  const handleExportAll = async () => {
    setDownloadingType('all');
    setExportMessage('Menarik database dan menyusun file Excel 3 Sheet...');
    try {
      const res = await exportAllDatabase();
      setExportMessage(
        `Berhasil diunduh: ${res.fileName} (${res.totalSPB} SPB, ${res.totalEvent} CDC FP, ${res.totalHajatan} Hajatan)`
      );
      setTimeout(() => setExportMessage(null), 6000);
    } catch (err: any) {
      setExportMessage(
        `Gagal mengeksport database: ${err?.message || 'Coba lagi'}`
      );
      setTimeout(() => setExportMessage(null), 8000);
    } finally {
      setDownloadingType(null);
    }
  };

  const handleExportSPB = async () => {
    setDownloadingType('spb');
    setExportMessage('Mengunduh data Tracking SPB...');
    try {
      const res = await exportSPBExcel();
      setExportMessage(
        `Berhasil diunduh: ${res.fileName} (${res.total} record SPB)`
      );
      setTimeout(() => setExportMessage(null), 6000);
    } catch (err: any) {
      setExportMessage(`Gagal export SPB: ${err?.message || 'Error'}`);
    } finally {
      setDownloadingType(null);
    }
  };

  const handleExportEvent = async () => {
    setDownloadingType('event');
    setExportMessage('Mengunduh data CDC FP Event...');
    try {
      const res = await exportEventExcel();
      setExportMessage(
        `Berhasil diunduh: ${res.fileName} (${res.total} record Event)`
      );
      setTimeout(() => setExportMessage(null), 6000);
    } catch (err: any) {
      setExportMessage(`Gagal export Event: ${err?.message || 'Error'}`);
    } finally {
      setDownloadingType(null);
    }
  };

  const handleExportHajatan = async () => {
    setDownloadingType('hajatan');
    setExportMessage('Mengunduh data Hajatan Event...');
    try {
      const res = await exportHajatanExcel();
      setExportMessage(
        `Berhasil diunduh: ${res.fileName} (${res.total} record Hajatan)`
      );
      setTimeout(() => setExportMessage(null), 6000);
    } catch (err: any) {
      setExportMessage(`Gagal export Hajatan: ${err?.message || 'Error'}`);
    } finally {
      setDownloadingType(null);
    }
  };

  const totalContacts =
    stats.spb.consumerContact +
    stats.event.consumerContact +
    stats.hajatan.consumerContact;
  const totalTrials =
    stats.spb.trialPerson +
    stats.event.trialPerson +
    stats.hajatan.trialPerson;
  const totalPacks =
    stats.spb.totalSelling +
    stats.event.totalSelling +
    stats.hajatan.totalSelling;

  return (
    <div className="relative min-h-[calc(100vh-4rem)] bg-[#0A0A0A] text-[#D4D4D4] py-10 px-4 md:px-8 overflow-hidden">
      {/* Background radial effects */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/[0.02] rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-amber-500/[0.02] rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-5xl mx-auto space-y-10">
        {/* Title & Tagline */}
        <div className="text-center space-y-4 pt-4">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-white/90 text-xs font-semibold uppercase tracking-widest shadow-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
            <span>Aplikasi Digital Real-Time CDC</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-serif text-white tracking-tight leading-tight">
            AO Tasikmalaya{' '}
            <span className="italic text-white/70">Digital CDC</span>
          </h1>

          <p className="text-white/60 text-sm md:text-base font-normal max-w-2xl mx-auto leading-relaxed">
            Platform Tracking & Event CDC Tim Marketing AO Tasikmalaya. Riset
            Konsumen, Brand Switching, dan Monitoring Penjualan Lapangan.
          </p>

          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              Sistem Aktif & Terverifikasi
            </span>
          </div>
        </div>

        {/* Performance Table & Date Filter for Actual Survey Activities */}
        <div className="bg-neutral-900/80 rounded-2xl p-6 md:p-8 border border-white/10 shadow-2xl space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xl md:text-2xl font-serif text-white font-bold flex items-center gap-2.5">
                  <CalendarCheck className="w-6 h-6 text-amber-400" />
                  Summary Performance & Aktivitas Aktual
                </h3>
                {stats.isLoading && (
                  <span className="text-xs text-amber-400 flex items-center gap-1.5 font-medium shrink-0 ml-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat data...
                  </span>
                )}
              </div>
              <p className="text-white/50 text-xs md:text-sm mt-1">
                Filter tanggal untuk memonitor jenis survey yang aktif/berjalan serta pencapaian Consumer Contact (survey), Trial Person (orang yang membeli), dan Penjualan (kuantiti pack).
              </p>
            </div>

            {/* Quick Filter Info Badge */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-white/90">
                <span
                  className={`w-2 h-2 rounded-full ${
                    (stats.runningDetail?.spb.isRunning ||
                      stats.runningDetail?.event.isRunning ||
                      stats.runningDetail?.hajatan.isRunning)
                      ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]'
                      : 'bg-neutral-500'
                  }`}
                />
                <span>
                  {isAllDates
                    ? 'Mode: Semua Tanggal'
                    : selectedDate === todayStr
                    ? 'Hari Ini'
                    : selectedDate === yesterdayStr
                    ? 'Kemarin'
                    : selectedDate}
                </span>
              </span>
            </div>
          </div>

          {/* Real-time Google Sheet Cloud Sync Bar */}
          <div className="bg-gradient-to-r from-emerald-950/40 via-neutral-900 to-black p-3.5 md:p-4 rounded-xl border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                <FileSpreadsheet className="w-5 h-5" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">
                    Sinkronisasi Real-Time Google Sheet
                  </span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Live Cloud Sync
                  </span>
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">
                  ID: <span className="font-mono text-white/70">1c79z-EWoG0IwfgconEVU53_0Uj34smDsdSuiJ7aD8ec</span>
                  {pullNotice?.time && (
                    <span className="ml-2 text-emerald-400 font-mono text-[10px]">
                      (Terakhir ditarik pukul {pullNotice.time})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handlePullFromGSheet(false)}
                disabled={isPullingGSheet}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition-all cursor-pointer disabled:opacity-50"
                title="Tarik data survey terbaru yang disimpan surveyor di HP mereka"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isPullingGSheet ? 'animate-spin' : ''}`} />
                <span>{isPullingGSheet ? 'Menyinkronkan...' : 'Tarik Data Terbaru dari Spreadsheet'}</span>
              </button>

              {onOpenGoogleSheets && (
                <button
                  type="button"
                  onClick={onOpenGoogleSheets}
                  className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-bold border border-white/10 transition-colors cursor-pointer"
                  title="Kelola Webhook & Akun Google Sheet"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Pull Notice / Feedback */}
          {pullNotice && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2 transition-all ${
                pullNotice.isError
                  ? 'bg-red-950/30 border-red-500/30 text-red-300'
                  : pullNotice.needScriptUpdate
                  ? 'bg-amber-950/40 border-amber-500/40 text-amber-200'
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {pullNotice.isError ? (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                ) : pullNotice.needScriptUpdate ? (
                  <Zap className="w-4 h-4 text-amber-400 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>{pullNotice.message}</span>
              </div>
              {pullNotice.needScriptUpdate && onOpenGoogleSheets && (
                <button
                  type="button"
                  onClick={onOpenGoogleSheets}
                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold rounded-lg shrink-0 cursor-pointer"
                >
                  Salin Kode Script Baru
                </button>
              )}
            </div>
          )}

          {/* Date Filter Bar */}
          <div className="bg-black/50 border border-white/10 rounded-xl p-3.5 md:p-4 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
            {/* Presets and Date Input */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white/70 flex items-center gap-1.5 mr-1">
                <Filter className="w-3.5 h-3.5 text-amber-400" />
                Filter Tanggal:
              </span>

              <button
                type="button"
                onClick={() => {
                  setIsAllDates(false);
                  setSelectedDate(todayStr);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  !isAllDates && selectedDate === todayStr
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                <span>Hari Ini</span>
                <span className="text-[10px] opacity-70">({todayStr})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAllDates(false);
                  setSelectedDate(yesterdayStr);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  !isAllDates && selectedDate === yesterdayStr
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                <span>Kemarin</span>
                <span className="text-[10px] opacity-70">({yesterdayStr})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsAllDates(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isAllDates
                    ? 'bg-amber-500 text-black shadow-md shadow-amber-500/20'
                    : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white border border-white/5'
                }`}
              >
                <span>Semua Tanggal</span>
              </button>

              {/* Custom Date Input */}
              <div className="relative flex items-center">
                <Calendar className="w-3.5 h-3.5 text-white/40 absolute left-3 pointer-events-none" />
                <input
                  type="date"
                  value={isAllDates ? '' : selectedDate}
                  onChange={(e) => {
                    if (e.target.value) {
                      setSelectedDate(e.target.value);
                      setIsAllDates(false);
                    }
                  }}
                  className="pl-8 pr-3 py-1.5 bg-neutral-800/90 border border-white/15 focus:border-amber-400 rounded-lg text-xs font-medium text-white focus:outline-none transition-colors"
                  placeholder="Pilih Tanggal..."
                />
              </div>
            </div>

            {/* Active Status Text */}
            <div className="text-xs text-white/60 flex items-center gap-2">
              <span className="text-white font-medium">
                {isAllDates
                  ? 'Menampilkan akumulasi seluruh data tersimpan'
                  : `Menampilkan data aktual: ${formatDisplayDate(selectedDate)}`}
              </span>
            </div>
          </div>

          {/* Actual Surveys Running Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-white/[0.04] to-transparent p-3.5 rounded-xl border border-white/10">
            <div className="flex items-center gap-2.5">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold text-white">
                Status Aktual di Lapangan:
              </span>
              <span className="text-xs text-white/80">
                {[
                  stats.runningDetail?.spb.isRunning,
                  stats.runningDetail?.event.isRunning,
                  stats.runningDetail?.hajatan.isRunning,
                ].filter(Boolean).length > 0 ? (
                  <span className="text-emerald-400 font-bold">
                    {[
                      stats.runningDetail?.spb.isRunning,
                      stats.runningDetail?.event.isRunning,
                      stats.runningDetail?.hajatan.isRunning,
                    ].filter(Boolean).length}{' '}
                    dari 3 jenis survey sedang berjalan
                  </span>
                ) : (
                  <span className="text-white/40">
                    Tidak ada aktivitas survey pada tanggal ini
                  </span>
                )}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowDetailActivities((prev) => !prev)}
              className="text-xs text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
            >
              <span>
                {showDetailActivities
                  ? 'Sembunyikan Rincian Lapangan'
                  : 'Lihat Rincian Lapangan'}
              </span>
              {showDetailActivities ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {/* Performance Table */}
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
            <table className="w-full text-left text-xs md:text-sm">
              <thead className="bg-white/5 text-white/80 font-bold uppercase tracking-wider text-[11px] md:text-xs border-b border-white/10">
                <tr>
                  <th className="py-3.5 px-4 md:px-6">Jenis Survey</th>
                  <th className="py-3.5 px-4 md:px-6 text-center">Status Aktual</th>
                  <th className="py-3.5 px-4 md:px-6 text-center">Consumer Contact</th>
                  <th className="py-3.5 px-4 md:px-6 text-center">Trial Person</th>
                  <th className="py-3.5 px-4 md:px-6 text-center">Penjualan (Pack)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-200 font-medium">
                {/* SPB */}
                <tr
                  onClick={() => {
                    if (onNavigateToSpbReport) {
                      onNavigateToSpbReport(selectedDate, isAllDates);
                    } else {
                      onSelectTab('spb');
                    }
                  }}
                  className="hover:bg-emerald-500/10 transition-colors cursor-pointer group"
                  title="Klik untuk membuka Report Harian Tracking SPB"
                >
                  <td className="py-4 px-4 md:px-6 font-bold text-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                        <span className="group-hover:text-emerald-300 transition-colors">Tracking SPB</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-md border border-emerald-500/30 group-hover:bg-emerald-500/30 transition-all">
                        <span>Report Harian</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center">
                    {stats.runningDetail?.spb.isRunning ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Aktif Berjalan ({stats.spb.consumerContact} survey)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/5 text-white/40 border border-white/10">
                        Tidak Berjalan
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-bold text-white">
                    {stats.spb.consumerContact.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-bold text-amber-300">
                    {stats.spb.trialPerson.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-extrabold text-emerald-400">
                    {stats.spb.totalSelling.toLocaleString('id-ID')}
                  </td>
                </tr>

                {/* Event */}
                <tr
                  onClick={() => {
                    if (onNavigateToEventReport) {
                      onNavigateToEventReport(selectedDate, isAllDates);
                    } else {
                      onSelectTab('event');
                    }
                  }}
                  className="hover:bg-blue-500/10 transition-colors cursor-pointer group"
                  title="Klik untuk membuka Report Harian CDC FP / SPB"
                >
                  <td className="py-4 px-4 md:px-6 font-bold text-white">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_#60a5fa]" />
                        <span className="group-hover:text-blue-300 transition-colors">CDC FP/SPB</span>
                      </div>
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-400 bg-blue-500/15 px-2 py-0.5 rounded-md border border-blue-500/30 group-hover:bg-blue-500/30 transition-all">
                        <span>Report Harian</span>
                        <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                      </span>
                    </div>
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center">
                    {stats.runningDetail?.event.isRunning ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Aktif Berjalan ({stats.event.consumerContact} survey)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/5 text-white/40 border border-white/10">
                        Tidak Berjalan
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-bold text-white">
                    {stats.event.consumerContact.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-bold text-amber-300">
                    {stats.event.trialPerson.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-extrabold text-emerald-400">
                    {stats.event.totalSelling.toLocaleString('id-ID')}
                  </td>
                </tr>

                {/* Hajatan */}
                <tr className="hover:bg-white/[0.02] transition-colors">
                  <td className="py-4 px-4 md:px-6 font-bold text-white flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-purple-400 shadow-[0_0_8px_#c084fc]" />
                    Hajatan Event
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center">
                    {stats.runningDetail?.hajatan.isRunning ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/30">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                        Aktif Berjalan ({stats.hajatan.consumerContact} survey)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-white/5 text-white/40 border border-white/10">
                        Tidak Berjalan
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-bold text-white">
                    {stats.hajatan.consumerContact.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-bold text-amber-300">
                    {stats.hajatan.trialPerson.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center font-extrabold text-emerald-400">
                    {stats.hajatan.totalSelling.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-white/5 border-t border-white/10 font-bold text-white">
                <tr>
                  <td className="py-4 px-4 md:px-6 uppercase tracking-wider text-xs font-black">
                    Total Overall
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center text-xs text-white/70">
                    {isAllDates ? 'Akumulasi Total' : 'Total Tanggal Terpilih'}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center text-white font-extrabold text-base">
                    {totalContacts.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center text-amber-300 font-extrabold text-base">
                    {totalTrials.toLocaleString('id-ID')}
                  </td>
                  <td className="py-4 px-4 md:px-6 text-center text-emerald-400 font-extrabold text-base">
                    {totalPacks.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Table click navigation helper */}
          <p className="text-[11px] text-white/50 flex items-center gap-1.5 px-1">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>
              Klik baris <strong className="text-emerald-400">Tracking SPB</strong> atau <strong className="text-blue-400">CDC FP/SPB</strong> di atas untuk langsung membuka <em>Report Harian</em> aktivitas tersebut.
            </span>
          </p>

          {/* Rincian Aktivitas Lapangan yang Berjalan */}
          {showDetailActivities && (
            <div className="pt-2 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-white/70">
                  Rincian Lapangan Jenis Survey Berjalan:
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* SPB Detail Card */}
                <div
                  className={`rounded-xl p-4 border transition-all ${
                    stats.runningDetail?.spb.isRunning
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-white/[0.02] border-white/5 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      Tracking SPB
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stats.runningDetail?.spb.isRunning
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {stats.runningDetail?.spb.isRunning ? 'Aktif' : 'Nihil'}
                    </span>
                  </div>

                  {stats.runningDetail?.spb.isRunning ? (
                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-white/40 block text-[11px]">
                          Petugas SPB yang Bertugas:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stats.runningDetail.spb.activePersonnel.length > 0 ? (
                            stats.runningDetail.spb.activePersonnel.map((name, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[11px] border border-emerald-500/20 font-medium"
                              >
                                <Users className="w-2.5 h-2.5" />
                                {name}
                              </span>
                            ))
                          ) : (
                            <span className="text-white/60">Terdata di sistem</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-white/40 block text-[11px]">
                          Toko / Outlet Terdata:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stats.runningDetail.spb.activeLocations.length > 0 ? (
                            stats.runningDetail.spb.activeLocations.slice(0, 4).map((loc, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-white/80 text-[11px] border border-white/10"
                              >
                                <Store className="w-2.5 h-2.5 text-amber-400" />
                                {loc}
                              </span>
                            ))
                          ) : (
                            <span className="text-white/60">-</span>
                          )}
                          {stats.runningDetail.spb.activeLocations.length > 4 && (
                            <span className="text-[10px] text-white/50 self-center">
                              +{stats.runningDetail.spb.activeLocations.length - 4} toko lainnya
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/10 flex justify-between text-[11px]">
                        <span className="text-white/60">Penjualan:</span>
                        <span className="text-emerald-400 font-bold">
                          {stats.spb.totalSelling} pack ({stats.spb.consumerContact} responden)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-white/40 italic">
                      Tidak ada survey SPB yang berjalan pada tanggal ini.
                    </p>
                  )}
                </div>

                {/* Event Detail Card */}
                <div
                  className={`rounded-xl p-4 border transition-all ${
                    stats.runningDetail?.event.isRunning
                      ? 'bg-blue-950/20 border-blue-500/30'
                      : 'bg-white/[0.02] border-white/5 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400" />
                      CDC FP / Event
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stats.runningDetail?.event.isRunning
                          ? 'bg-blue-500/20 text-blue-300'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {stats.runningDetail?.event.isRunning ? 'Aktif' : 'Nihil'}
                    </span>
                  </div>

                  {stats.runningDetail?.event.isRunning ? (
                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-white/40 block text-[11px]">
                          Event yang Berjalan:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stats.runningDetail.event.activeEvents.length > 0 ? (
                            stats.runningDetail.event.activeEvents.map((evt, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 text-[11px] border border-blue-500/20 font-medium"
                              >
                                <Activity className="w-2.5 h-2.5" />
                                {evt}
                              </span>
                            ))
                          ) : (
                            <span className="text-white/60">Event Lapangan</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-white/40 block text-[11px]">
                          PIC Lapangan:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stats.runningDetail.event.activePersonnel.length > 0 ? (
                            stats.runningDetail.event.activePersonnel.map((pic, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-white/80 text-[11px] border border-white/10"
                              >
                                <Users className="w-2.5 h-2.5 text-blue-400" />
                                {pic}
                              </span>
                            ))
                          ) : (
                            <span className="text-white/60">-</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/10 flex justify-between text-[11px]">
                        <span className="text-white/60">Penjualan:</span>
                        <span className="text-blue-400 font-bold">
                          {stats.event.totalSelling} pack ({stats.event.consumerContact} responden)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-white/40 italic">
                      Tidak ada survey CDC FP/Event yang berjalan pada tanggal ini.
                    </p>
                  )}
                </div>

                {/* Hajatan Detail Card */}
                <div
                  className={`rounded-xl p-4 border transition-all ${
                    stats.runningDetail?.hajatan.isRunning
                      ? 'bg-purple-950/20 border-purple-500/30'
                      : 'bg-white/[0.02] border-white/5 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-purple-400" />
                      Hajatan Event
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        stats.runningDetail?.hajatan.isRunning
                          ? 'bg-purple-500/20 text-purple-300'
                          : 'bg-white/5 text-white/40'
                      }`}
                    >
                      {stats.runningDetail?.hajatan.isRunning ? 'Aktif' : 'Nihil'}
                    </span>
                  </div>

                  {stats.runningDetail?.hajatan.isRunning ? (
                    <div className="space-y-2.5 text-xs">
                      <div>
                        <span className="text-white/40 block text-[11px]">
                          Hajatan yang Dimonitor:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stats.runningDetail.hajatan.activeHajatan.length > 0 ? (
                            stats.runningDetail.hajatan.activeHajatan.map((hjt, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-purple-500/10 text-purple-300 text-[11px] border border-purple-500/20 font-medium"
                              >
                                <MapPin className="w-2.5 h-2.5" />
                                {hjt}
                              </span>
                            ))
                          ) : (
                            <span className="text-white/60">Acara Hajatan</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-white/40 block text-[11px]">
                          PIC Lapangan:
                        </span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {stats.runningDetail.hajatan.activePersonnel.length > 0 ? (
                            stats.runningDetail.hajatan.activePersonnel.map((pic, i) => (
                              <span
                                key={i}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/5 text-white/80 text-[11px] border border-white/10"
                              >
                                <Users className="w-2.5 h-2.5 text-purple-400" />
                                {pic}
                              </span>
                            ))
                          ) : (
                            <span className="text-white/60">-</span>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-white/10 flex justify-between text-[11px]">
                        <span className="text-white/60">Penjualan:</span>
                        <span className="text-purple-400 font-bold">
                          {stats.hajatan.totalSelling} pack ({stats.hajatan.consumerContact} responden)
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-white/40 italic">
                      Tidak ada survey Hajatan yang berjalan pada tanggal ini.
                    </p>
                  )}
                </div>
              </div>

              {/* Rekapitulasi Harian Semua Petugas SPB (Real-Time) */}
              <div className="pt-5 border-t border-white/10 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold uppercase tracking-wider text-white">
                      Rekapitulasi Harian Semua Petugas SPB Lapangan ({spbBreakdown.length} Personel Aktif):
                    </span>
                  </div>
                  <span className="text-xs text-white/50 font-medium">
                    {isAllDates ? 'Seluruh Tanggal' : selectedDate}
                  </span>
                </div>

                {spbBreakdown.length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-amber-500/30 bg-amber-500/5 text-center text-xs space-y-3">
                    <p className="text-white/80 font-bold">
                      Belum ada data input survey SPB pada tanggal{' '}
                      <span className="text-amber-400 underline">{isAllDates ? 'Seluruh Tanggal' : selectedDate}</span>.
                    </p>
                    <p className="text-[11px] text-white/60 max-w-md mx-auto leading-relaxed">
                      Jika surveyor baru saja menekan <em>"Simpan Survey"</em> di HP mereka, data sudah tersimpan di Google Sheet. Klik tombol di bawah untuk menariknya atau muat contoh data untuk melihat simulasi visual.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handlePullFromGSheet(false)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isPullingGSheet ? 'animate-spin' : ''}`} />
                        <span>Tarik Data Terbaru dari Spreadsheet</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleLoadSampleSpb}
                        className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>🧪 Muat Contoh Data SPB (Simulasi)</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-white/10 bg-black/40">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-white/5 text-white/80 font-bold uppercase tracking-wider text-[11px] border-b border-white/10">
                        <tr>
                          <th className="py-3 px-4">No</th>
                          <th className="py-3 px-4">Nama SPB</th>
                          <th className="py-3 px-4">Toko / Outlet Dikunjungi</th>
                          <th className="py-3 px-4 text-center">Consumer Contact</th>
                          <th className="py-3 px-4 text-center">Trial Person</th>
                          <th className="py-3 px-4 text-center">Penjualan (Pack)</th>
                          <th className="py-3 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-gray-200">
                        {spbBreakdown.map((item, idx) => (
                          <tr key={item.name} className="hover:bg-white/[0.03] transition-colors">
                            <td className="py-3 px-4 font-bold text-white/40">{idx + 1}</td>
                            <td className="py-3 px-4 font-bold text-white">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                                <span>{item.name}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-white/70">
                              {item.stores.length > 0 ? item.stores.join(', ') : '-'}
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-white">
                              {item.contact}
                            </td>
                            <td className="py-3 px-4 text-center font-bold text-amber-300">
                              {item.trial}
                            </td>
                            <td className="py-3 px-4 text-center font-extrabold text-emerald-400">
                              {item.selling}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Aktif ({item.contact} survey)
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-white/5 border-t border-white/10 font-bold text-white text-xs">
                        <tr>
                          <td colSpan={3} className="py-3.5 px-4 text-right uppercase tracking-wider text-[11px] font-black">
                            Total Rekapitulasi Semua SPB:
                          </td>
                          <td className="py-3.5 px-4 text-center font-black text-white text-sm">
                            {spbBreakdown.reduce((sum, s) => sum + s.contact, 0)}
                          </td>
                          <td className="py-3.5 px-4 text-center font-black text-amber-300 text-sm">
                            {spbBreakdown.reduce((sum, s) => sum + s.trial, 0)}
                          </td>
                          <td className="py-3.5 px-4 text-center font-black text-emerald-400 text-sm">
                            {spbBreakdown.reduce((sum, s) => sum + s.selling, 0)}
                          </td>
                          <td className="py-3.5 px-4"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Admin Section: Google Sheets Auto-Sync & Database Export */}
        {userRole === 'admin' && (
          <>
            {/* Google Sheets Live Sync Integration Center - Admin Only */}
            {userRole === 'admin' && (
              <div className="bg-gradient-to-r from-emerald-950/70 via-neutral-900/95 to-neutral-900/90 rounded-2xl p-6 md:p-8 border border-emerald-500/40 shadow-2xl space-y-5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        <FileSpreadsheet className="w-3.5 h-3.5" />
                        <span>Google Sheets Auto-Sync (Admin)</span>
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                      </div>

                      {getAppsScriptWebhookUrl() ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                          <span>Webhook Aktif (Tanpa Perlu Login HP)</span>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={onOpenGoogleSheets}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
                        >
                          <Zap className="w-3 h-3 text-amber-400" />
                          <span>Pasang Webhook Apps Script</span>
                        </button>
                      )}
                    </div>

                    <h3 className="text-xl md:text-2xl font-serif text-white font-bold tracking-tight flex items-center gap-2">
                      <span>Database Google Sheet Otomatis</span>
                      <span className="text-xs font-sans font-bold px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Target Terkunci
                      </span>
                    </h3>
                    <p className="text-white/70 text-xs md:text-sm max-w-2xl leading-relaxed">
                      Target Spreadsheet ID:{' '}
                      <code className="px-1.5 py-0.5 rounded bg-black/40 text-emerald-300 font-mono text-xs border border-emerald-500/30 font-bold select-all">
                        {TARGET_SPREADSHEET_ID}
                      </code>
                      . Setiap surveyor klik <strong className="text-white">"Simpan Survey"</strong> di HP mereka, data otomatis langsung masuk ke baris baru Google Sheet tanpa perlu login akun Google.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    <a
                      href={gsheetConfig?.spreadsheetUrl || TARGET_SPREADSHEET_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl flex items-center gap-2 transition-colors cursor-pointer border border-white/10"
                    >
                      <span>Buka Google Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                    </a>
                    <button
                      type="button"
                      onClick={handleDirectSyncGSheet}
                      disabled={isSyncingGSheet}
                      className="px-5 py-3 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isSyncingGSheet ? 'animate-spin' : ''}`}
                      />
                      <span>{isSyncingGSheet ? 'Menyinkronkan...' : 'Sinkronkan Semua Sekarang'}</span>
                    </button>
                    {onOpenGoogleSheets && (
                      <button
                        type="button"
                        onClick={onOpenGoogleSheets}
                        className="px-4 py-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-bold text-xs rounded-xl transition-colors cursor-pointer border border-emerald-500/40 flex items-center gap-1.5"
                        title="Pengaturan Webhook & Salin Script"
                      >
                        <Zap className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Kelola Webhook & Akun</span>
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-1">
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-white/50 text-[10px] font-semibold uppercase">Sheet 1</div>
                    <div className="text-amber-300 font-bold mt-0.5">Ringkasan KPI</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-white/50 text-[10px] font-semibold uppercase">Sheet 2</div>
                    <div className="text-emerald-400 font-bold mt-0.5">
                      {stats.spb.consumerContact} Record SPB
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-white/50 text-[10px] font-semibold uppercase">Sheet 3</div>
                    <div className="text-blue-400 font-bold mt-0.5">
                      {stats.event.consumerContact} Record Event
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5">
                    <div className="text-white/50 text-[10px] font-semibold uppercase">Sheet 4</div>
                    <div className="text-purple-400 font-bold mt-0.5">
                      {stats.hajatan.consumerContact} Record Hajatan
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Database Export Center */}
            <div className="bg-gradient-to-r from-emerald-950/50 via-neutral-900/90 to-neutral-900/80 rounded-2xl p-6 md:p-8 border border-emerald-500/30 shadow-2xl space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div className="space-y-1.5">
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Database Export Center (.xlsx)</span>
                  </div>
                  <h3 className="text-xl md:text-2xl font-serif text-white font-bold tracking-tight flex items-center gap-2">
                    <span>Export Data Excel Master</span>
                    <span className="text-xs font-sans font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                      Kolom Database 100% Presisi
                    </span>
                  </h3>
                  <p className="text-white/60 text-xs md:text-sm max-w-2xl leading-relaxed">
                    Unduh file Excel dengan detail kolom lengkap dan identik
                    dengan struktur database (termasuk ID Dokumen, Timestamp,
                    GPS, Demografi, Rating Uji Rasa, Switching Brand, dan
                    Penjualan).
                  </p>
                  {exportMessage && (
                    <div className="text-xs font-semibold text-emerald-300 bg-emerald-950/80 px-3.5 py-2 rounded-xl border border-emerald-500/40 inline-flex items-center gap-2 mt-2 shadow-inner">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>{exportMessage}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExportAll}
                  disabled={downloadingType !== null}
                  className="shrink-0 w-full md:w-auto px-7 py-4 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:from-emerald-900 disabled:to-emerald-950 text-black font-extrabold text-xs md:text-sm uppercase tracking-wider rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                >
                  {downloadingType === 'all' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-black" />
                      <span>Mengeksport Database...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5 text-black" />
                      <span>Export Seluruh Database (3 Sheet)</span>
                    </>
                  )}
                </button>
              </div>

              {/* 3 Single Module Export Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
                {/* SPB */}
                <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-emerald-500/40 p-4 rounded-xl flex flex-col justify-between transition-all group">
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        Tracking SPB
                      </span>
                      <span className="text-[11px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded">
                        {stats.spb.consumerContact} data
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50">
                      Riset konsumen, uji rasa GIK, & monitoring toko
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportSPB}
                    disabled={downloadingType !== null}
                    className="w-full py-2 px-3 bg-white/10 hover:bg-emerald-500 hover:text-black text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {downloadingType === 'spb' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Unduh Excel SPB</span>
                  </button>
                </div>

                {/* Event */}
                <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-blue-500/40 p-4 rounded-xl flex flex-col justify-between transition-all group">
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-400" />
                        CDC FP / Event
                      </span>
                      <span className="text-[11px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded">
                        {stats.event.consumerContact} data
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50">
                      Selling point, VAO bundling, & switching event
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportEvent}
                    disabled={downloadingType !== null}
                    className="w-full py-2 px-3 bg-white/10 hover:bg-blue-500 hover:text-black text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {downloadingType === 'event' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Unduh Excel Event</span>
                  </button>
                </div>

                {/* Hajatan */}
                <div className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 hover:border-purple-500/40 p-4 rounded-xl flex flex-col justify-between transition-all group">
                  <div className="space-y-1 mb-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-purple-400 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-purple-400" />
                        Hajatan Event
                      </span>
                      <span className="text-[11px] font-mono text-white/50 bg-white/5 px-2 py-0.5 rounded">
                        {stats.hajatan.consumerContact} data
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50">
                      Monitoring acara hajatan & distribusi produk
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleExportHajatan}
                    disabled={downloadingType !== null}
                    className="w-full py-2 px-3 bg-white/10 hover:bg-purple-500 hover:text-black text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {downloadingType === 'hajatan' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Unduh Excel Hajatan</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Survey Selection Header */}
        <div className="text-center pt-2">
          <h2 className="text-2xl font-serif text-white tracking-tight">
            Pilih Jenis Event / Survey
          </h2>
          <p className="text-white/50 text-xs md:text-sm mt-1">
            Klik salah satu modul di bawah ini untuk memulai pengisian kuesioner
          </p>
        </div>

        {/* 3 Survey Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: SPB */}
          <div
            onClick={() => onSelectTab('spb')}
            className="group relative bg-neutral-900/60 rounded-2xl p-6 md:p-8 border border-white/10 shadow-xl hover:border-white/30 hover:bg-neutral-900 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform text-white">
                  🔐
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Aktif
                </span>
              </div>
              <h3 className="text-xl font-serif text-white group-hover:text-white transition-colors mb-2">
                Tracking SPB/FP GIK
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Survey konsumen toko, uji rasa GIK 12, tracking penjualan SPB,
                dan profil responden lapangan.
              </p>
            </div>
            <div className="flex items-center text-emerald-400 text-xs font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
              <span>Buka Form SPB</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </div>
          </div>

          {/* Card 2: CDC FP/SPB */}
          <div
            onClick={() => onSelectTab('event')}
            className="group relative bg-neutral-900/60 rounded-2xl p-6 md:p-8 border border-white/10 shadow-xl hover:border-white/30 hover:bg-neutral-900 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform text-white">
                  🎯
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                  Aktif
                </span>
              </div>
              <h3 className="text-xl font-serif text-white group-hover:text-white transition-colors mb-2">
                CDC FP/SPB
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Survey konsumen event lapangan, brand switching, evaluasi
                konsumsi rokok, & monitoring selling point.
              </p>
            </div>
            <div className="flex items-center text-blue-400 text-xs font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
              <span>Buka Form Event</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </div>
          </div>

          {/* Card 3: Hajatan */}
          <div
            onClick={() => onSelectTab('hajatan')}
            className="group relative bg-neutral-900/60 rounded-2xl p-6 md:p-8 border border-white/10 shadow-xl hover:border-white/30 hover:bg-neutral-900 transition-all duration-300 hover:-translate-y-1 cursor-pointer flex flex-col justify-between overflow-hidden"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform text-white">
                  🎪
                </div>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                  Aktif
                </span>
              </div>
              <h3 className="text-xl font-serif text-white group-hover:text-white transition-colors mb-2">
                Hajatan Survey
              </h3>
              <p className="text-white/60 text-sm leading-relaxed mb-6">
                Survey dan pencatatan distribusi rokok pada acara hajatan
                masyarakat, monitoring PIC & kuantitas pack.
              </p>
            </div>
            <div className="flex items-center text-purple-400 text-xs font-bold uppercase tracking-wider group-hover:translate-x-1 transition-transform">
              <span>Buka Form Hajatan</span>
              <ArrowRight className="w-4 h-4 ml-1" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
