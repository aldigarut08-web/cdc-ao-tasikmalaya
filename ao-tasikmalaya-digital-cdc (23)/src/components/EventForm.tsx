import React, { useEffect, useState } from 'react';
import { EventRecord, EventSession } from '../types';
import {
  LIST_PIC_EVENT,
  TIPE_EVENT_LIST,
  BRAND_EVENT_LIST,
  PEKERJAAN_LIST,
  KELOMPOK_USIA_EVENT,
  LAMA_KONSUMSI_LIST,
  MOMENT_GG_LIST,
  ALL_CIGARETTE_BRANDS,
  PRODUCT_SOLD_EVENT_LIST,
  SELLING_POINTS,
  KECAMATAN_NAMES,
  getOuFromKecamatan,
} from '../data/constants';
import {
  detectLocationFromCoordinates,
  formatDateTime,
  getTodayDateString,
  getDeviceGPSPosition,
} from '../utils/geo';
import { getEventRecords, saveEventRecord } from '../services/storage';
import { exportEventExcel, exportEventSummaryExcel } from '../services/excel';
import {
  appendRecordToGoogleSheet,
  getAppsScriptWebhookUrl,
  pullDataFromGoogleSheet,
} from '../services/googleSheets';
import { SearchSelect } from './SearchSelect';
import {
  CalendarCheck,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  RefreshCw,
  X,
  FileSpreadsheet,
  Download,
  Flame,
  ClipboardList,
  History,
  Search,
  Eye,
  Filter,
  UserCheck,
  Building2,
} from 'lucide-react';

interface EventFormProps {
  session: EventSession;
  setSession: (session: EventSession) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  autoOpenReport?: boolean;
  initialReportDate?: string;
  initialReportAllDates?: boolean;
  onCloseAutoReport?: () => void;
}

// Helper for fuzzy PIC name matching
function isSamePic(recordPic?: string, loggedInPic?: string): boolean {
  if (!recordPic || !loggedInPic) return false;
  const p1 = recordPic.trim().toLowerCase();
  const p2 = loggedInPic.trim().toLowerCase();
  if (p1 === p2) return true;
  const clean1 = p1.replace(/[^a-z0-9]/g, '');
  const clean2 = p2.replace(/[^a-z0-9]/g, '');
  if (clean1 && clean2 && clean1 === clean2) {
    return true;
  }
  const words1 = p1.split(/\s+/).filter(Boolean);
  const words2 = p2.split(/\s+/).filter(Boolean);
  if (words1.length > 1 && words2.length > 1) {
    if (words1.filter((w) => words2.includes(w)).length >= 2) return true;
  } else if (words1.length > 1 && words2.length === 1) {
    if (words1.includes(words2[0])) return true;
  } else if (words2.length > 1 && words1.length === 1) {
    if (words2.includes(words1[0])) return true;
  }
  return false;
}

// Helper for date matching
function isDateMatch(record: any, targetDate: string, isAllDates: boolean): boolean {
  if (isAllDates) return true;
  if (!targetDate) return true;
  const recDate = (
    record.tanggal ||
    record.date ||
    record.timestamp ||
    record.Timestamp ||
    record.created_at ||
    ''
  )
    .toString()
    .trim();

  if (recDate.includes(targetDate)) return true;

  const parts = recDate.split('T')[0].split(' ')[0];
  if (parts === targetDate) return true;

  const m = targetDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    const alt1 = `${d}/${mo}/${y}`;
    const alt2 = `${d}-${mo}-${y}`;
    const alt3 = `${y}/${mo}/${d}`;
    if (recDate.includes(alt1) || recDate.includes(alt2) || recDate.includes(alt3)) {
      return true;
    }
  }
  return false;
}

export const EventForm: React.FC<EventFormProps> = ({
  session,
  setSession,
  onShowToast,
  autoOpenReport,
  initialReportDate,
  initialReportAllDates,
  onCloseAutoReport,
}) => {
  // Login states
  const [selectedPic, setSelectedPic] = useState(session.picName || '');
  const [selectedTipe, setSelectedTipe] = useState(session.tipeEvent || '');
  const [selectedBrandEvent, setSelectedBrandEvent] = useState(
    session.brandEvent || ''
  );
  const [idEvent, setIdEvent] = useState(session.idEvent || '');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Location / GPS
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [kecamatan, setKecamatan] = useState('');
  const [ouCode, setOuCode] = useState<'GRT' | 'TSA'>('TSA');
  const [locationMeta, setLocationMeta] = useState<any>(null);

  // Form Fields
  const [namaKonsumen, setNamaKonsumen] = useState('');
  const [jenisKelamin, setJenisKelamin] = useState('LAKI-LAKI');
  const [usia, setUsia] = useState('');
  const [pekerjaan, setPekerjaan] = useState('');

  const [rokokPrimary, setRokokPrimary] = useState('');
  const [lamaKonsumsi, setLamaKonsumsi] = useState('');

  const [productSold, setProductSold] = useState('');
  const [quantityPack, setQuantityPack] = useState('0');
  const [bundlingVao, setBundlingVao] = useState('TIDAK');
  const [sellingPoint, setSellingPoint] = useState('');

  const [ggSelingan, setGgSelingan] = useState('TIDAK');
  const [ggBrandApa, setGgBrandApa] = useState('');
  const [momentGg, setMomentGg] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Report Modal states (Agregat Harian Event)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDate, setReportDate] = useState(() => getTodayDateString());
  const [reportAllDates, setReportAllDates] = useState(false);
  const [reportTipeFilter, setReportTipeFilter] = useState<string>('ALL');
  const [reportBrandFilter, setReportBrandFilter] = useState<string>('ALL');
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRecords, setReportRecords] = useState<EventRecord[]>([]);
  const [isPullingReport, setIsPullingReport] = useState(false);
  const [pullReportMessage, setPullReportMessage] = useState<string | null>(null);
  const [pullReportNeedUpdate, setPullReportNeedUpdate] = useState(false);

  // Hasil Input Modal states (Histori Khusus PIC yang Login)
  const [showHasilModal, setShowHasilModal] = useState(false);
  const [hasilDate, setHasilDate] = useState(() => getTodayDateString());
  const [hasilAllDates, setHasilAllDates] = useState(false);
  const [hasilLoading, setHasilLoading] = useState(false);
  const [hasilRecords, setHasilRecords] = useState<EventRecord[]>([]);
  const [hasilSearch, setHasilSearch] = useState('');
  const [selectedDetailRecord, setSelectedDetailRecord] =
    useState<EventRecord | null>(null);
  const [isPullingHasil, setIsPullingHasil] = useState(false);
  const [pullHasilMessage, setPullHasilMessage] = useState<string | null>(null);

  useEffect(() => {
    if (session.isLoggedIn) {
      handleGetGPS(true);
    }
  }, [session.isLoggedIn]);

  // Auto-open Report Modal if navigated from Dashboard
  useEffect(() => {
    if (autoOpenReport) {
      const targetDate = initialReportDate || reportDate;
      const targetAllDates =
        initialReportAllDates !== undefined ? initialReportAllDates : reportAllDates;
      if (initialReportDate) setReportDate(initialReportDate);
      if (initialReportAllDates !== undefined) setReportAllDates(initialReportAllDates);
      setShowReportModal(true);
      loadReport(targetDate, targetAllDates);
      handlePullGSheetInReport();
      if (onCloseAutoReport) onCloseAutoReport();
    }
  }, [autoOpenReport, initialReportDate, initialReportAllDates]);

  useEffect(() => {
    if (latitude && longitude) {
      const latNum = parseFloat(latitude);
      const lonNum = parseFloat(longitude);
      if (!isNaN(latNum) && !isNaN(lonNum)) {
        detectLocationFromCoordinates(latNum, lonNum).then((loc) => {
          if (loc) {
            setKecamatan(loc.kecamatan);
            setOuCode(loc.ouCode);
            setLocationMeta(loc);
          }
        });
      }
    }
  }, [latitude, longitude]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!selectedPic) {
      setLoginError('Silakan pilih nama PIC.');
      return;
    }
    if (!selectedTipe) {
      setLoginError('Silakan pilih tipe event.');
      return;
    }
    if (!selectedBrandEvent) {
      setLoginError('Silakan pilih brand event.');
      return;
    }
    if (!idEvent.trim()) {
      setLoginError('ID Event wajib diisi.');
      return;
    }

    setIsLoggingIn(true);
    setTimeout(() => {
      const newSession: EventSession = {
        isLoggedIn: true,
        picName: selectedPic,
        tipeEvent: selectedTipe,
        brandEvent: selectedBrandEvent,
        idEvent: idEvent.trim(),
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('event_pic_logged_in', 'true');
      localStorage.setItem('event_pic_name', selectedPic);
      localStorage.setItem('event_tipe_event', selectedTipe);
      localStorage.setItem('event_brand_event', selectedBrandEvent);
      localStorage.setItem('event_id_event', idEvent.trim());
      localStorage.setItem('event_pic_login_time', newSession.loginTime);
      setSession(newSession);
      onShowToast(
        `Login Event berhasil! Selamat bertugas, ${selectedPic}`,
        'success'
      );
      setIsLoggingIn(false);
    }, 300);
  };

  const handleLogout = () => {
    localStorage.removeItem('event_pic_logged_in');
    localStorage.removeItem('event_pic_name');
    localStorage.removeItem('event_tipe_event');
    localStorage.removeItem('event_brand_event');
    localStorage.removeItem('event_id_event');
    localStorage.removeItem('event_pic_login_time');
    setSession({
      isLoggedIn: false,
      picName: '',
      tipeEvent: '',
      brandEvent: '',
      idEvent: '',
      loginTime: '',
    });
    onShowToast('Berhasil logout.', 'info');
  };

  const handleGetGPS = async (silent = false) => {
    setGpsLoading(true);
    setGpsError('');

    try {
      const coords = await getDeviceGPSPosition();
      setLatitude(coords.latitude);
      setLongitude(coords.longitude);
      setGpsLoading(false);

      try {
        const loc = await detectLocationFromCoordinates(coords.latitude, coords.longitude);
        if (loc) {
          setKecamatan(loc.kecamatan);
          setOuCode(loc.ouCode);
          setLocationMeta(loc);
          if (!silent) {
            onShowToast(
              `Lokasi GPS & Kecamatan ${loc.kecamatan} (${loc.ouCode}) terdeteksi!`,
              'success'
            );
          }
        } else if (!silent) {
          onShowToast('Lokasi GPS berhasil dideteksi!', 'success');
        }
      } catch {
        if (!silent) onShowToast('Lokasi GPS berhasil dideteksi!', 'success');
      }
    } catch (err: any) {
      setGpsLoading(false);
      const errMsg = err?.message || 'Gagal membaca lokasi GPS.';
      setGpsError(errMsg);
      if (!silent) onShowToast(errMsg, 'error');
    }
  };

  const resetForm = () => {
    setNamaKonsumen('');
    setJenisKelamin('LAKI-LAKI');
    setUsia('');
    setPekerjaan('');
    setRokokPrimary('');
    setLamaKonsumsi('');
    setProductSold('');
    setQuantityPack('0');
    setBundlingVao('TIDAK');
    setSellingPoint('');
    setGgSelingan('TIDAK');
    setGgBrandApa('');
    setMomentGg('');
  };

  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session.picName) {
      onShowToast('Sesi Event tidak aktif. Silakan login terlebih dahulu.', 'error');
      return;
    }

    if (!latitude || !longitude) {
      onShowToast('Koordinat GPS wajib diaktifkan sebelum menyimpan survey.', 'error');
      document.getElementById('event-gps-section')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!rokokPrimary) {
      onShowToast('Silakan pilih Rokok Utama Konsumen.', 'error');
      return;
    }

    setIsSubmitting(true);
    const today = getTodayDateString();

    const record: Omit<EventRecord, 'id'> = {
      nama_pic: session.picName,
      nama_spb: session.picName || '-',
      tipe_event: session.tipeEvent,
      brand_event: session.brandEvent,
      id_event: session.idEvent,
      ro: 'BANDUNG',
      ao: 'TASIKMALAYA',
      ou: ouCode,
      kecamatan: kecamatan || 'TASIKMALAYA',
      nama_konsumen: namaKonsumen.trim(),
      jenis_kelamin: jenisKelamin,
      kelompok_usia: usia,
      pekerjaan: pekerjaan,
      rokok_primary: rokokPrimary,
      lama_konsumsi: lamaKonsumsi,
      product_sold_brand: productSold,
      quantity_pack: quantityPack,
      quantity_pack_sold: quantityPack,
      qty_pack: quantityPack,
      bundling_vao: bundlingVao,
      selling_point: sellingPoint,
      gg_selingan: ggSelingan,
      gg_brand_apa: ggSelingan === 'YA' ? ggBrandApa : '-',
      moment_gg: ggSelingan === 'YA' ? momentGg : '-',
      latitude,
      longitude,
      tanggal: today,
      date: today,
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await saveEventRecord(record);
      const fullRecord = { ...record, id: res.id } as EventRecord;

      // Asynchronous instant sync to Google Sheet via Webhook (no Google login required)
      appendRecordToGoogleSheet('event', fullRecord).catch(
        (err) => console.warn('Google Sheet auto-sync notice:', err)
      );

      const hasWebhook = Boolean(getAppsScriptWebhookUrl());
      if (hasWebhook) {
        onShowToast('Survey CDC FP tersimpan & langsung masuk ke Google Sheet!', 'success');
      } else {
        onShowToast('Survey CDC FP Event berhasil tersimpan!', 'success');
      }
      resetForm();
      if (showHasilModal) {
        loadHasilData(hasilDate, hasilAllDates);
      }
    } catch {
      onShowToast('Gagal menyimpan survey Event.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePullGSheetInReport = async () => {
    setIsPullingReport(true);
    setPullReportMessage('Menarik data live CDC FP dari Google Sheet...');
    try {
      const res = await pullDataFromGoogleSheet();
      if (res.success) {
        setPullReportNeedUpdate(false);
        setPullReportMessage(`Data live berhasil ditarik: ${res.totalEvent} Event termuat!`);
        await loadReport(reportDate, reportAllDates);
        setTimeout(() => setPullReportMessage(null), 6000);
      } else {
        setPullReportNeedUpdate(Boolean(res.needScriptUpdate));
        setPullReportMessage(res.message);
      }
    } catch (e: any) {
      setPullReportMessage(`Gagal menarik data: ${e?.message || 'Periksa koneksi'}`);
    } finally {
      setIsPullingReport(false);
    }
  };

  const handlePullGSheetInHasil = async () => {
    setIsPullingHasil(true);
    setPullHasilMessage('Menarik data live dari Google Sheet...');
    try {
      const res = await pullDataFromGoogleSheet();
      if (res.success) {
        setPullHasilMessage('Data live berhasil ditarik!');
        await loadHasilData(hasilDate, hasilAllDates);
        setTimeout(() => setPullHasilMessage(null), 5000);
      } else {
        setPullHasilMessage(res.message);
      }
    } catch (e: any) {
      setPullHasilMessage(`Gagal menarik data: ${e?.message || 'Periksa koneksi'}`);
    } finally {
      setIsPullingHasil(false);
    }
  };

  // Load Hasil Input spesifik untuk PIC yang login
  const loadHasilData = async (dateFilter: string, allDates: boolean) => {
    setHasilLoading(true);
    try {
      const all = await getEventRecords();
      const currentPic = session.picName.trim();
      const userFiltered = all.filter((rec) => {
        const pic = (
          rec.nama_pic ||
          (rec as any).NAMA_PIC ||
          (rec as any).pic ||
          (rec as any).PIC ||
          (rec as any).picName ||
          (rec as any).petugas ||
          rec.nama_spb ||
          (rec as any).NAMA_SPB ||
          ''
        ).toString().trim();
        const matchesPic = isSamePic(pic, currentPic);
        const matchesD = isDateMatch(rec, dateFilter, allDates);
        return matchesPic && matchesD;
      });
      setHasilRecords(userFiltered);
    } catch {
      // Ignore
    } finally {
      setHasilLoading(false);
    }
  };

  const openHasilModal = () => {
    setShowHasilModal(true);
    loadHasilData(hasilDate, hasilAllDates);
  };

  const loadReport = async (dateFilter: string, allDates: boolean) => {
    setReportLoading(true);
    try {
      const all = await getEventRecords();
      const filtered = all.filter((r) => {
        if (allDates) return true;
        return isDateMatch(r, dateFilter, false);
      });
      setReportRecords(filtered);
    } catch {
      // Ignore
    } finally {
      setReportLoading(false);
    }
  };

  const openReportModal = () => {
    setShowReportModal(true);
    loadReport(reportDate, reportAllDates);
    handlePullGSheetInReport();
  };

  // Available unique Tipe Event from constants and records
  const availableTipeList = React.useMemo(() => {
    const set = new Set<string>();
    TIPE_EVENT_LIST.forEach((t) => {
      if (t) set.add(t);
    });
    reportRecords.forEach((r) => {
      const val = (r.tipe_event || (r as any).TIPE_EVENT || (r as any).tipe || '').toString().trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [reportRecords]);

  // Available unique Brand Event from constants and records
  const availableBrandList = React.useMemo(() => {
    const set = new Set<string>();
    BRAND_EVENT_LIST.forEach((b) => {
      if (b) set.add(b);
    });
    reportRecords.forEach((r) => {
      const val = (r.brand_event || (r as any).BRAND_EVENT || (r as any).brand || '').toString().trim();
      if (val) set.add(val);
    });
    return Array.from(set).sort();
  }, [reportRecords]);

  // Filtered records by date (already in reportRecords) + Tipe Event & Brand Event
  const filteredReportRecords = React.useMemo(() => {
    return reportRecords.filter((r) => {
      if (reportTipeFilter !== 'ALL') {
        const tipe = (r.tipe_event || (r as any).TIPE_EVENT || (r as any).tipe || '').toString().trim();
        if (tipe.toLowerCase() !== reportTipeFilter.toLowerCase()) {
          return false;
        }
      }
      if (reportBrandFilter !== 'ALL') {
        const brand = (r.brand_event || (r as any).BRAND_EVENT || (r as any).brand || '').toString().trim();
        if (brand.toLowerCase() !== reportBrandFilter.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
  }, [reportRecords, reportTipeFilter, reportBrandFilter]);

  // Summary Rekapitulasi per PIC untuk Report Harian
  const picGroupSummary = React.useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        events: string[];
        contact: number;
        trial: number;
        pack: number;
      }
    >();

    filteredReportRecords.forEach((r) => {
      const name = (
        r.nama_pic ||
        (r as any).NAMA_PIC ||
        (r as any).pic ||
        (r as any).PIC ||
        (r as any).picName ||
        (r as any).petugas ||
        r.nama_spb ||
        (r as any).NAMA_SPB ||
        'Tanpa Nama'
      ).toString().trim() || 'Tanpa Nama';

      const ev = (r.id_event || (r as any).ID_EVENT || r.brand_event || '').toString().trim();

      const qty = parseInt(
        r.quantity_pack ||
          (r as any).quantity_pack_sold ||
          r.qty_pack ||
          (r as any).QTY_PACK ||
          '0',
        10
      );
      const pack = isNaN(qty) ? 0 : qty;
      // Trial Person: jumlah orang yang melakukan pembelian
      const isTrial = pack > 0;

      if (!map.has(name)) {
        map.set(name, {
          name,
          events: ev ? [ev] : [],
          contact: 1,
          trial: isTrial ? 1 : 0,
          pack: pack,
        });
      } else {
        const existing = map.get(name)!;
        existing.contact += 1;
        if (isTrial) existing.trial += 1;
        existing.pack += pack;
        if (ev && !existing.events.includes(ev)) {
          existing.events.push(ev);
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.contact - a.contact);
  }, [filteredReportRecords]);

  const reportTotalSurvey = filteredReportRecords.length;
  // Trial Person: jumlah orang yang melakukan pembelian
  const reportTotalTrial = filteredReportRecords.filter((r) => {
    const q = parseInt(
      r.quantity_pack || (r as any).quantity_pack_sold || r.qty_pack || (r as any).QTY_PACK || '0',
      10
    );
    return !isNaN(q) && q > 0;
  }).length;
  // Penjualan (Pack): kuantiti pack yang terjual
  const reportTotalPack = filteredReportRecords.reduce((acc, cur) => {
    const q = parseInt(
      cur.quantity_pack ||
        (cur as any).quantity_pack_sold ||
        cur.qty_pack ||
        (cur as any).QTY_PACK ||
        '0',
      10
    );
    return acc + (isNaN(q) ? 0 : q);
  }, 0);

  // Filtered Hasil Input berdasarkan pencarian konsumen / rokok
  const filteredHasilList = hasilRecords.filter((r) => {
    if (!hasilSearch.trim()) return true;
    const q = hasilSearch.toLowerCase();
    const konsumen = (r.nama_konsumen || '').toLowerCase();
    const rokok = (r.rokok_primary || '').toLowerCase();
    const brandSold = (r.product_sold_brand || '').toLowerCase();
    return konsumen.includes(q) || rokok.includes(q) || brandSold.includes(q);
  });

  const hasilTotalSurvey = filteredHasilList.length;
  // Trial Person: jumlah orang yang melakukan pembelian
  const hasilTotalBeli = filteredHasilList.filter((r) => {
    const q = parseInt(
      r.quantity_pack_sold || (r as any).quantity_pack || r.qty_pack || '0',
      10
    );
    return !isNaN(q) && q > 0;
  }).length;
  // Penjualan (Pack): kuantiti pack yang terjual
  const hasilTotalPack = filteredHasilList.reduce((acc, cur) => {
    const q = parseInt(
      cur.quantity_pack_sold || (cur as any).quantity_pack || cur.qty_pack || '0',
      10
    );
    return acc + (isNaN(q) ? 0 : q);
  }, 0);
  const hasilTotalVao = filteredHasilList.filter(
    (r) => (r.bundling_vao || '').toUpperCase() === 'YA'
  ).length;

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#D4D4D4] py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-neutral-900/80 rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        {/* Card Header */}
        <div className="bg-neutral-950 text-white p-6 md:p-8 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-blue-500/20 text-blue-400 border border-blue-500/30 mb-2">
                Event CDC Platform
              </span>
              <h1 className="text-2xl md:text-3xl font-serif font-bold uppercase tracking-tight text-white">
                CDC FP / SPB EVENT
              </h1>
              <p className="text-white/60 text-xs md:text-sm mt-1">
                Kuesioner Konsumen Event, Switching Rokok, & Monitoring Penjualan Produk Lapangan
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session.isLoggedIn && (
                <button
                  type="button"
                  onClick={openHasilModal}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                  title="Lihat histori data yang sudah di-input oleh PIC yang sedang login"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Lihat Hasil Input</span>
                </button>
              )}

              <button
                type="button"
                onClick={openReportModal}
                className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Report Harian</span>
              </button>
            </div>
          </div>

          {/* Session Header Bar */}
          {session.isLoggedIn ? (
            <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 font-bold font-serif text-lg">
                  {session.picName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-extrabold text-sm md:text-base">
                      {session.picName}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                      Aktif
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50">
                    Event: {session.idEvent} ({session.tipeEvent}) • Brand: {session.brandEvent}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleGetGPS(false)}
                  disabled={gpsLoading}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${gpsLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Perbarui GPS</span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Ganti PIC</span>
                </button>
              </div>
            </div>
          ) : (
            /* Login Box */
            <div className="pt-6 max-w-lg mx-auto">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-1.5">
                      <CalendarCheck className="w-4 h-4" />
                      Pilih PIC & Info Event *
                    </label>
                    <span className="text-[10px] text-white/40">Wajib login</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                      Pilih Nama PIC *
                    </label>
                    <select
                      value={selectedPic}
                      onChange={(e) => {
                        setSelectedPic(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                    >
                      <option value="">-- Pilih Nama PIC --</option>
                      {LIST_PIC_EVENT.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                        Tipe Event *
                      </label>
                      <select
                        value={selectedTipe}
                        onChange={(e) => {
                          setSelectedTipe(e.target.value);
                          if (loginError) setLoginError('');
                        }}
                        className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Pilih Tipe --</option>
                        {TIPE_EVENT_LIST.map((tipe) => (
                          <option key={tipe} value={tipe}>
                            {tipe}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                        Brand Event *
                      </label>
                      <select
                        value={selectedBrandEvent}
                        onChange={(e) => {
                          setSelectedBrandEvent(e.target.value);
                          if (loginError) setLoginError('');
                        }}
                        className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Pilih Brand --</option>
                        {BRAND_EVENT_LIST.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                      ID Event / Nama Event *
                    </label>
                    <input
                      type="text"
                      value={idEvent}
                      onChange={(e) => {
                        setIdEvent(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      placeholder="Contoh: MUSIC FEST TASIK 2025"
                      className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {loginError && (
                    <p className="text-xs font-bold text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {loginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3 bg-blue-500 hover:bg-blue-400 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memulai Sesi Event...</span>
                      </>
                    ) : (
                      <span>Mulai Sesi Event</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Event Form */}
        {session.isLoggedIn && (
          <form onSubmit={handleSubmitSurvey} className="p-6 md:p-8 bg-white text-gray-800 space-y-8">
            {/* PART 1: IDENTITAS EVENT & PIC */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-blue-700 uppercase tracking-wider border-b-2 border-blue-200 pb-1 flex items-center gap-1.5">
                <CalendarCheck className="w-4 h-4" /> PART 1: IDENTITAS EVENT & PIC
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Nama PIC *
                  </label>
                  <input
                    type="text"
                    value={session.picName}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-blue-50/80 text-blue-900 cursor-default"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    ID / Nama Event *
                  </label>
                  <input
                    type="text"
                    value={session.idEvent}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold bg-gray-50 text-gray-800 cursor-default"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Tipe Event *
                  </label>
                  <input
                    type="text"
                    value={session.tipeEvent}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold bg-gray-50 text-gray-800 cursor-default"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Brand Event *
                  </label>
                  <input
                    type="text"
                    value={session.brandEvent}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold bg-gray-50 text-gray-800 cursor-default"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-400 uppercase mb-1">
                    AO *
                  </label>
                  <input
                    type="text"
                    value="TASIKMALAYA"
                    readOnly
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold bg-gray-100 text-gray-500 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            {/* PART 2: PROFIL KONSUMEN */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-blue-700 uppercase tracking-wider border-b-2 border-blue-200 pb-1">
                PART 2: PROFIL KONSUMEN
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Nama Konsumen *
                  </label>
                  <input
                    type="text"
                    value={namaKonsumen}
                    onChange={(e) => setNamaKonsumen(e.target.value)}
                    placeholder="Masukkan nama konsumen"
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Jenis Kelamin *
                  </label>
                  <div className="flex items-center gap-6 pt-2">
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="event_gender"
                        value="LAKI-LAKI"
                        checked={jenisKelamin === 'LAKI-LAKI'}
                        onChange={() => setJenisKelamin('LAKI-LAKI')}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Laki-laki</span>
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="event_gender"
                        value="PEREMPUAN"
                        checked={jenisKelamin === 'PEREMPUAN'}
                        onChange={() => setJenisKelamin('PEREMPUAN')}
                        className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Perempuan</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Kelompok Usia *
                  </label>
                  <select
                    value={usia}
                    onChange={(e) => setUsia(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Kelompok Usia</option>
                    {KELOMPOK_USIA_EVENT.map((u) => (
                      <option key={u} value={u}>
                        {u} Tahun
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Pekerjaan *
                  </label>
                  <select
                    value={pekerjaan}
                    onChange={(e) => setPekerjaan(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Pekerjaan</option>
                    {PEKERJAAN_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* PART 3: KONSUMSI ROKOK */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-blue-700 uppercase tracking-wider border-b-2 border-blue-200 pb-1">
                PART 3: KONSUMSI ROKOK
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Rokok Primary Saat Ini *
                  </label>
                  <SearchSelect
                    options={ALL_CIGARETTE_BRANDS}
                    value={rokokPrimary}
                    onChange={setRokokPrimary}
                    placeholder="-- Pilih Rokok Utama Konsumen --"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Lama Konsumsi Rokok Primary *
                  </label>
                  <select
                    value={lamaKonsumsi}
                    onChange={(e) => setLamaKonsumsi(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Pilih Lama Konsumsi</option>
                    {LAMA_KONSUMSI_LIST.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* PART 4: PRODUCT SOLD & BUNDLING */}
            <div className="space-y-4 p-5 bg-blue-50/70 border border-blue-200 rounded-2xl">
              <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider border-b border-blue-300 pb-1">
                PART 4: PRODUCT SOLD & BUNDLING
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-blue-950 uppercase mb-1">
                    Product Sold Brand *
                  </label>
                  <select
                    value={productSold}
                    onChange={(e) => setProductSold(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Pilih Product Sold Brand --</option>
                    {PRODUCT_SOLD_EVENT_LIST.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                    {productSold && !PRODUCT_SOLD_EVENT_LIST.includes(productSold) && (
                      <option value={productSold}>{productSold}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-blue-950 uppercase mb-1">
                    Quantity Pack Sold *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={quantityPack}
                    onChange={(e) => setQuantityPack(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-blue-950 uppercase mb-1">
                    Bundling VAO *
                  </label>
                  <select
                    value={bundlingVao}
                    onChange={(e) => setBundlingVao(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="TIDAK">TIDAK</option>
                    <option value="YA">YA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-blue-950 uppercase mb-1">
                    Selling Point / Lokasi *
                  </label>
                  <select
                    value={sellingPoint}
                    onChange={(e) => setSellingPoint(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Pilih Selling Point / Lokasi --</option>
                    {SELLING_POINTS.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                    {sellingPoint && !SELLING_POINTS.includes(sellingPoint) && (
                      <option value={sellingPoint}>{sellingPoint}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            {/* PART 5: GUDANG GARAM SEBAGAI SELINGAN */}
            <div className="space-y-4 p-5 bg-amber-50/70 border border-amber-200 rounded-2xl">
              <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider border-b border-amber-300 pb-1">
                PART 5: GUDANG GARAM SEBAGAI SELINGAN
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-amber-950 uppercase mb-1">
                    Gudang Garam Selingan? *
                  </label>
                  <select
                    value={ggSelingan}
                    onChange={(e) => {
                      setGgSelingan(e.target.value);
                      if (e.target.value === 'TIDAK') {
                        setGgBrandApa('');
                        setMomentGg('');
                      }
                    }}
                    required
                    className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="TIDAK">TIDAK</option>
                    <option value="YA">YA</option>
                  </select>
                </div>

                {ggSelingan === 'YA' && (
                  <>
                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-extrabold text-amber-950 uppercase mb-1">
                        Brand GG Selingan *
                      </label>
                      <select
                        value={ggBrandApa}
                        onChange={(e) => setGgBrandApa(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Pilih Brand GG</option>
                        <option value="12 GG MERAH">12 GG MERAH</option>
                        <option value="12 GGI FILTER">12 GGI FILTER</option>
                        <option value="12 GGI KRETEK">12 GGI KRETEK</option>
                        <option value="12 SIGNATURE FILTER">12 SIGNATURE FILTER</option>
                        <option value="12 SURYA COKLAT">12 SURYA COKLAT</option>
                        <option value="16 SURYA MERAH">16 SURYA MERAH</option>
                      </select>
                    </div>

                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-extrabold text-amber-950 uppercase mb-1">
                        Moment Mengonsumsi GG *
                      </label>
                      <select
                        value={momentGg}
                        onChange={(e) => setMomentGg(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Pilih Moment Konsumsi</option>
                        {MOMENT_GG_LIST.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PART 6: KOORDINAT LOKASI EVENT */}
            <div
              id="event-gps-section"
              className="space-y-4 p-5 bg-blue-50/80 border border-blue-200 rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-blue-300 pb-1">
                <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> PART 6: KOORDINAT
                  LOKASI EVENT
                </h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-red-600 text-white rounded-md tracking-wider">
                  MANDATORI / WAJIB
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-blue-900 uppercase mb-1">
                    Latitude
                  </label>
                  <input
                    type="text"
                    value={latitude}
                    readOnly
                    placeholder="Menunggu izin lokasi GPS..."
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-mono font-bold bg-blue-100/70 text-blue-900 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-blue-900 uppercase mb-1">
                    Longitude
                  </label>
                  <input
                    type="text"
                    value={longitude}
                    readOnly
                    placeholder="Menunggu izin lokasi GPS..."
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-mono font-bold bg-blue-100/70 text-blue-900 cursor-not-allowed"
                  />
                </div>
              </div>

              {/* Kecamatan & Wilayah Operasional (OU) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-extrabold text-blue-900 uppercase">
                      Kecamatan (Otomatis GPS / Pilih) *
                    </label>
                    {locationMeta ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        {locationMeta.source === 'gps_reverse_api' ? 'Terverifikasi GPS' : 'Centroid GPS'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300">
                        Wajib Terisi
                      </span>
                    )}
                  </div>
                  <select
                    value={kecamatan}
                    onChange={(e) => {
                      const newKec = e.target.value;
                      setKecamatan(newKec);
                      const ouInfo = getOuFromKecamatan(newKec);
                      setOuCode(ouInfo.ou);
                      setLocationMeta(prev => prev ? { ...prev, kecamatan: newKec, ouCode: ouInfo.ou, regency: ouInfo.regency } : null);
                    }}
                    required
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">-- Pilih / Deteksi Kecamatan --</option>
                    {KECAMATAN_NAMES.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                    {kecamatan && !KECAMATAN_NAMES.includes(kecamatan) && (
                      <option value={kecamatan}>{kecamatan}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-blue-900 uppercase mb-1">
                    Wilayah Operasional / OU
                  </label>
                  <input
                    type="text"
                    value={kecamatan ? `${ouCode} (${locationMeta?.regency || (ouCode === 'GRT' ? 'GARUT' : 'TASIKMALAYA')})` : '-'}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-blue-300 rounded-xl text-sm font-bold bg-blue-100/70 text-blue-900 cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="pt-2">
                {gpsLoading ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Mendeteksi koordinat GPS event...</span>
                  </div>
                ) : latitude && longitude ? (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      GPS Terkunci ({latitude}, {longitude})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleGetGPS(false)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer"
                    >
                      Perbarui Koordinat
                    </button>
                  </div>
                ) : (
                  <div>
                    <button
                      type="button"
                      onClick={() => handleGetGPS(false)}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md"
                    >
                      <MapPin className="w-4 h-4" />
                      <span>Izinkan & Ambil Lokasi GPS</span>
                    </button>
                    {gpsError && (
                      <p className="text-xs font-bold text-rose-600 mt-2 flex items-center gap-1">
                        <AlertCircle className="w-4 h-4" />
                        {gpsError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-gray-200">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:flex-1 py-4 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-extrabold text-sm uppercase tracking-wider rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Menyimpan Survey Event...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Simpan Survey CDC FP / Event</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={resetForm}
                className="w-full sm:w-auto px-6 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm rounded-2xl transition-colors cursor-pointer"
              >
                Reset Form
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Report Modal - Summary Rekapitulasi Semua Petugas PIC Lapangan */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="p-5 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-blue-200" />
                  <h3 className="font-extrabold text-base md:text-lg">
                    📊 Report Harian CDC FP / SPB Event
                  </h3>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">
                  Monitoring Progress Tanggal: {reportAllDates ? 'Seluruh Riwayat Tanggal' : reportDate}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-blue-50/80 border-b border-blue-200 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-blue-950 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5 text-blue-700" /> Tanggal:
                  </span>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => {
                      setReportDate(e.target.value);
                      setReportAllDates(false);
                      loadReport(e.target.value, false);
                    }}
                    className="px-3 py-1.5 border border-blue-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const today = getTodayDateString();
                      setReportDate(today);
                      setReportAllDates(false);
                      loadReport(today, false);
                    }}
                    className="px-2.5 py-1.5 rounded-xl bg-blue-100 hover:bg-blue-200 text-blue-900 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Hari Ini
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const toggle = !reportAllDates;
                      setReportAllDates(toggle);
                      loadReport(reportDate, toggle);
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                      reportAllDates
                        ? 'bg-blue-600 text-white shadow'
                        : 'bg-blue-100 hover:bg-blue-200 text-blue-900'
                    }`}
                  >
                    {reportAllDates ? '✓ Semua Riwayat Tanggal' : 'Semua Tanggal'}
                  </button>
                  <button
                    type="button"
                    onClick={() => loadReport(reportDate, reportAllDates)}
                    disabled={reportLoading}
                    className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1 shadow transition-colors cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`}
                    />
                    <span>Refresh</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePullGSheetInReport()}
                    disabled={isPullingReport || reportLoading}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
                    title="Tarik data terbaru dari Google Sheet"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPullingReport ? 'animate-spin' : ''}`} />
                    <span>{isPullingReport ? 'Menarik...' : 'Tarik Data Spreadsheet'}</span>
                  </button>
                </div>

                <span className="text-xs font-bold text-blue-950 bg-blue-200/80 px-2.5 py-1.5 rounded-lg border border-blue-300">
                  Total: {filteredReportRecords.length} Survey ({picGroupSummary.length} PIC)
                </span>
              </div>

              {/* Row 2: Filter Tipe Event & Brand Event */}
              <div className="pt-2.5 border-t border-blue-200/60 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  {/* Tipe Event Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-600" /> Tipe Event:
                    </span>
                    <select
                      value={reportTipeFilter}
                      onChange={(e) => setReportTipeFilter(e.target.value)}
                      className="px-3 py-1.5 border border-blue-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
                    >
                      <option value="ALL">Semua Tipe Event ({reportRecords.length})</option>
                      {availableTipeList.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Brand Event Filter */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-blue-900 flex items-center gap-1">
                      <Flame className="w-3.5 h-3.5 text-blue-600" /> Brand Event:
                    </span>
                    <select
                      value={reportBrandFilter}
                      onChange={(e) => setReportBrandFilter(e.target.value)}
                      className="px-3 py-1.5 border border-blue-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-sm"
                    >
                      <option value="ALL">Semua Brand Event</option>
                      {availableBrandList.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Reset Filters */}
                  {(reportTipeFilter !== 'ALL' || reportBrandFilter !== 'ALL') && (
                    <button
                      type="button"
                      onClick={() => {
                        setReportTipeFilter('ALL');
                        setReportBrandFilter('ALL');
                      }}
                      className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Reset filter tipe dan brand event"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>Reset Filter</span>
                    </button>
                  )}
                </div>

                {/* Active filter badges */}
                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  {reportTipeFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-blue-100 text-blue-800 border border-blue-300">
                      Tipe: {reportTipeFilter}
                    </span>
                  )}
                  {reportBrandFilter !== 'ALL' && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-bold bg-indigo-100 text-indigo-800 border border-indigo-300">
                      Brand: {reportBrandFilter}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {pullReportMessage && (
              <div
                className={`mx-4 mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2 border ${
                  pullReportNeedUpdate
                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                    : pullReportMessage.includes('berhasil')
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                    : 'bg-blue-50 text-blue-900 border-blue-300'
                }`}
              >
                {pullReportNeedUpdate ? (
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <div className="flex-1">{pullReportMessage}</div>
              </div>
            )}

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* 4 Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-blue-900">
                    {picGroupSummary.length}
                  </div>
                  <div className="text-[10px] font-extrabold text-blue-900 uppercase mt-0.5">
                    Petugas PIC
                  </div>
                </div>

                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-emerald-700">
                    {reportTotalSurvey}
                  </div>
                  <div className="text-[10px] font-extrabold text-emerald-900 uppercase mt-0.5">
                    Consumer Contact
                  </div>
                </div>

                <div className="p-3.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-indigo-700">
                    {reportTotalTrial}
                  </div>
                  <div className="text-[10px] font-extrabold text-indigo-900 uppercase mt-0.5">
                    Trial Person
                  </div>
                </div>

                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-amber-700">
                    {reportTotalPack}
                  </div>
                  <div className="text-[10px] font-extrabold text-amber-900 uppercase mt-0.5">
                    Penjualan (Pack)
                  </div>
                </div>
              </div>

              {/* Table Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    Summary Rekapitulasi Semua Petugas PIC CDC FP
                  </h4>
                  <span className="text-[11px] font-bold text-blue-900 bg-blue-100 px-2.5 py-1 rounded-lg border border-blue-300">
                    {picGroupSummary.length} PIC Terdata
                  </span>
                </div>

                {reportLoading ? (
                  <div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                    <span>Memuat rekapitulasi data CDC FP...</span>
                  </div>
                ) : picGroupSummary.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                    Belum ada data survey CDC FP untuk filter {reportAllDates ? 'semua riwayat tanggal' : `tanggal ${reportDate}`}.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-blue-200 rounded-2xl shadow-sm">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-blue-600 text-white font-extrabold uppercase text-[11px] tracking-wider">
                        <tr>
                          <th className="p-3 text-center w-12">No</th>
                          <th className="p-3">Nama PIC</th>
                          <th className="p-3">ID Event / Brand</th>
                          <th className="p-3 text-center">Consumer Contact</th>
                          <th className="p-3 text-center">Trial Person</th>
                          <th className="p-3 text-center">Penjualan (Pack)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 text-gray-800 bg-white">
                        {picGroupSummary.map((pic, idx) => (
                          <tr key={pic.name + idx} className="hover:bg-blue-50/50 transition-colors">
                            <td className="p-3 text-center font-bold text-gray-500">{idx + 1}</td>
                            <td className="p-3 font-extrabold text-blue-950 flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {pic.name.charAt(0).toUpperCase()}
                              </span>
                              <span>{pic.name}</span>
                            </td>
                            <td className="p-3 font-medium text-gray-600">
                              {pic.events.join(', ') || '-'}
                            </td>
                            <td className="p-3 text-center font-black text-blue-900 bg-blue-50/40">
                              {pic.contact}
                            </td>
                            <td className="p-3 text-center font-bold text-indigo-700">
                              {pic.trial}
                            </td>
                            <td className="p-3 text-center font-black text-amber-700 bg-amber-50/40">
                              {pic.pack} pack
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-blue-100/80 font-black text-blue-950 border-t-2 border-blue-300">
                        <tr>
                          <td colSpan={3} className="p-3 text-right uppercase tracking-wider text-xs">
                            TOTAL REKAPITULASI ({picGroupSummary.length} PIC):
                          </td>
                          <td className="p-3 text-center text-sm font-black text-blue-900">
                            {reportTotalSurvey}
                          </td>
                          <td className="p-3 text-center text-sm font-black text-indigo-800">
                            {reportTotalTrial}
                          </td>
                          <td className="p-3 text-center text-sm font-black text-amber-800">
                            {reportTotalPack} pack
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportEventSummaryExcel(picGroupSummary, reportDate, reportAllDates)}
                  disabled={picGroupSummary.length === 0}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                  title="Export ringkasan rekapitulasi per PIC ke Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Rekap PIC (.xlsx)</span>
                </button>
                <button
                  type="button"
                  onClick={() => exportEventExcel(filteredReportRecords)}
                  disabled={filteredReportRecords.length === 0}
                  className="px-3.5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  title="Export seluruh rincian kuesioner konsumen ke Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Detail Survey ({filteredReportRecords.length}) (.xlsx)</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histori Hasil Input PIC */}
      {showHasilModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-amber-600 to-amber-800 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-200" />
                  <h3 className="font-extrabold text-base md:text-lg">
                    📋 Histori Hasil Input PIC (Event)
                  </h3>
                </div>
                <p className="text-xs text-amber-200 mt-0.5">
                  PIC: <span className="font-bold underline">{session.picName}</span> • Event: {session.idEvent} ({session.tipeEvent}) • Brand: {session.brandEvent}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowHasilModal(false)}
                className="p-1.5 hover:bg-white/20 rounded-xl text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filter Bar */}
            <div className="p-4 bg-amber-50/70 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-amber-950 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-amber-700" /> Tanggal:
                </span>
                <input
                  type="date"
                  value={hasilDate}
                  onChange={(e) => {
                    setHasilDate(e.target.value);
                    setHasilAllDates(false);
                    loadHasilData(e.target.value, false);
                  }}
                  className="px-3 py-1.5 border border-amber-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayDateString();
                    setHasilDate(today);
                    setHasilAllDates(false);
                    loadHasilData(today, false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-colors cursor-pointer"
                  title="Kembali ke Hari Ini (WIB)"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const toggle = !hasilAllDates;
                    setHasilAllDates(toggle);
                    loadHasilData(hasilDate, toggle);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    hasilAllDates
                      ? 'bg-amber-600 text-white shadow'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                  }`}
                >
                  {hasilAllDates ? '✓ Semua Riwayat Tanggal' : 'Semua Tanggal'}
                </button>
                <button
                  type="button"
                  onClick={() => loadHasilData(hasilDate, hasilAllDates)}
                  disabled={hasilLoading}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1 shadow transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${hasilLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePullGSheetInHasil()}
                  disabled={isPullingHasil || hasilLoading}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
                  title="Tarik data terbaru dari Google Sheet"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isPullingHasil ? 'animate-spin' : ''}`} />
                  <span>{isPullingHasil ? 'Menarik...' : 'Tarik Data Spreadsheet'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari konsumen / rokok..."
                    value={hasilSearch}
                    onChange={(e) => setHasilSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-amber-300 rounded-xl text-xs font-medium bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <span className="text-xs font-bold text-amber-900 bg-amber-200/80 px-2.5 py-1.5 rounded-lg border border-amber-300 whitespace-nowrap">
                  Total: {filteredHasilList.length} Survey
                </span>
              </div>
            </div>

            {pullHasilMessage && (
              <div className="mx-4 mt-3 p-3 rounded-xl text-xs font-medium flex items-center gap-2 border bg-emerald-50 text-emerald-900 border-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div className="flex-1">{pullHasilMessage}</div>
              </div>
            )}

            {/* Body Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Summary Badges */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-amber-800">
                    {hasilTotalSurvey}
                  </div>
                  <div className="text-[10px] font-extrabold text-amber-900 uppercase">
                    Total Survey
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-emerald-800">
                    {hasilTotalBeli}
                  </div>
                  <div className="text-[10px] font-extrabold text-emerald-900 uppercase">
                    Konsumen Beli
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-blue-800">
                    {hasilTotalPack} pack
                  </div>
                  <div className="text-[10px] font-extrabold text-blue-900 uppercase">
                    Total Terjual
                  </div>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-purple-800">
                    {hasilTotalVao}
                  </div>
                  <div className="text-[10px] font-extrabold text-purple-900 uppercase">
                    Bundling VAO
                  </div>
                </div>
              </div>

              {/* Data Table / Empty State */}
              <div className="space-y-2">
                <div className="flex items-center justify-between pt-1">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ClipboardList className="w-4 h-4 text-amber-600" />
                    Rincian Responden Survey ({filteredHasilList.length} Data)
                  </h4>
                  <span className="text-[11px] font-bold text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-300">
                    👤 Histori Data PIC: {session.picName}
                  </span>
                </div>

                {hasilLoading ? (
                  <div className="py-12 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
                    <Loader2 className="w-7 h-7 animate-spin text-amber-600" />
                    <span>Memuat histori data input PIC {session.picName}...</span>
                  </div>
                ) : filteredHasilList.length === 0 ? (
                  <div className="py-12 text-center text-gray-500 text-sm flex flex-col items-center gap-3">
                    <span className="text-3xl">📭</span>
                    <p className="font-semibold text-gray-700">
                      Belum ada data input untuk <span className="font-bold text-amber-700">{session.picName}</span> pada{' '}
                      {hasilAllDates ? 'semua riwayat tanggal' : `tanggal ${hasilDate}`}.
                    </p>
                    {!hasilAllDates && (
                      <button
                        type="button"
                        onClick={() => {
                          setHasilAllDates(true);
                          loadHasilData(hasilDate, true);
                        }}
                        className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-colors"
                      >
                        Tampilkan Semua Riwayat Tanggal
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-amber-50/80 text-amber-950 uppercase font-extrabold border-b border-amber-200">
                      <tr>
                        <th className="p-3">No</th>
                        <th className="p-3">Waktu</th>
                        <th className="p-3">Nama Konsumen</th>
                        <th className="p-3">Rokok Utama</th>
                        <th className="p-3">Produk Terjual & Qty</th>
                        <th className="p-3 text-center">VAO</th>
                        <th className="p-3 text-center">Selingan GG</th>
                        <th className="p-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-800">
                      {filteredHasilList.map((rec, idx) => {
                        const rawTime =
                          rec.timestamp ||
                          rec.Timestamp ||
                          rec.created_at ||
                          rec.date ||
                          rec.tanggal ||
                          '-';
                        const waktuFormatted = formatDateTime(rawTime);
                        const qty =
                          rec.quantity_pack_sold ||
                          rec.quantity_pack ||
                          rec.qty_pack ||
                          '0';
                        const isBeli = parseInt(qty, 10) > 0;
                        const vao = (rec.bundling_vao || 'TIDAK').toUpperCase();
                        const selingan = (rec.gg_selingan || 'TIDAK').toUpperCase();

                        return (
                          <tr
                            key={rec.id || idx}
                            className="hover:bg-amber-50/40 transition-colors"
                          >
                            <td className="p-3 font-bold text-gray-500">
                              {idx + 1}
                            </td>
                            <td className="p-3 text-gray-500 font-mono whitespace-nowrap text-[11px]">
                              {waktuFormatted}
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-gray-900">
                                {rec.nama_konsumen || '-'}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {rec.jenis_kelamin} • {rec.kelompok_usia || rec.usia} thn
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-gray-800">
                                {rec.rokok_primary || '-'}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {rec.lama_konsumsi}
                              </div>
                            </td>
                            <td className="p-3">
                              {isBeli ? (
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-blue-700">
                                    {rec.product_sold_brand || 'Produk GG'}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-emerald-100 text-emerald-800">
                                    {qty} pack
                                  </span>
                                </div>
                              ) : (
                                <span className="text-gray-400 italic">
                                  Tidak Beli
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  vao === 'YA'
                                    ? 'bg-purple-100 text-purple-800 font-extrabold'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {vao}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  selingan === 'YA'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {selingan}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedDetailRecord(rec)}
                                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 mx-auto cursor-pointer"
                                title="Lihat detail lengkap survey ini"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Detail</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => exportEventExcel(filteredHasilList)}
                disabled={filteredHasilList.length === 0}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Data PIC ({filteredHasilList.length}) ke Excel</span>
              </button>

              <button
                type="button"
                onClick={() => setShowHasilModal(false)}
                className="px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Detail Survey Konsumen */}
      {selectedDetailRecord && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-sm">
                  Detail Survey: {selectedDetailRecord.nama_konsumen}
                </h4>
                <p className="text-[11px] text-gray-400">
                  PIC: {selectedDetailRecord.nama_pic} • Waktu: {formatDateTime(selectedDetailRecord.timestamp || selectedDetailRecord.tanggal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetailRecord(null)}
                className="p-1 hover:bg-white/20 rounded-lg text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-gray-50 rounded-xl border border-gray-200">
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Nama Konsumen</span>
                  <p className="font-bold text-gray-900">{selectedDetailRecord.nama_konsumen}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Jenis Kelamin & Usia</span>
                  <p className="font-bold text-gray-900">
                    {selectedDetailRecord.jenis_kelamin} ({selectedDetailRecord.kelompok_usia || selectedDetailRecord.usia} thn)
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Pekerjaan</span>
                  <p className="font-medium text-gray-800">{selectedDetailRecord.pekerjaan || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Nama PIC</span>
                  <p className="font-medium text-gray-800">{selectedDetailRecord.nama_pic || selectedDetailRecord.nama_spb || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-200">
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Rokok Primary</span>
                  <p className="font-bold text-blue-950">{selectedDetailRecord.rokok_primary}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Lama Konsumsi</span>
                  <p className="font-medium text-blue-950">{selectedDetailRecord.lama_konsumsi}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Produk Beli</span>
                  <p className="font-bold text-blue-950">{selectedDetailRecord.product_sold_brand || 'Tidak Beli'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Jumlah Beli (Qty)</span>
                  <p className="font-extrabold text-blue-950">{selectedDetailRecord.quantity_pack_sold || selectedDetailRecord.quantity_pack || '0'} pack</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Bundling VAO</span>
                  <p className="font-bold text-blue-950">{selectedDetailRecord.bundling_vao}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Selling Point</span>
                  <p className="font-medium text-blue-950">{selectedDetailRecord.selling_point || '-'}</p>
                </div>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Selingan GG</span>
                    <p className="font-bold text-amber-950">{selectedDetailRecord.gg_selingan}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Brand GG</span>
                    <p className="font-medium text-amber-950">{selectedDetailRecord.gg_brand_apa || '-'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-amber-800 uppercase">Momen</span>
                    <p className="font-medium text-amber-950">{selectedDetailRecord.moment_gg || '-'}</p>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Lokasi & GPS</span>
                <p className="text-gray-800 font-mono text-[11px]">
                  {selectedDetailRecord.latitude}, {selectedDetailRecord.longitude} (Kec. {selectedDetailRecord.kecamatan || '-'})
                </p>
              </div>
            </div>

            <div className="p-3 bg-gray-100 border-t flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedDetailRecord(null)}
                className="px-4 py-1.5 bg-gray-800 hover:bg-gray-900 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
