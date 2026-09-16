import React, { useEffect, useState } from 'react';
import { SpbRecord, SpbSession } from '../types';
import {
  LIST_SPB,
  ALL_CIGARETTE_BRANDS,
  RENTANG_UMUR_SPB,
  PENGELUARAN_LIST,
  RATINGS_KERAPIHAN,
  RATINGS_TEMBAKAU_MULUT,
  RATINGS_TARIKAN,
  KECAMATAN_NAMES,
  getOuFromKecamatan,
} from '../data/constants';
import {
  detectLocationFromCoordinates,
  formatDateTime,
  getTodayDateString,
  getDeviceGPSPosition,
} from '../utils/geo';
import {
  getSpbRecords,
  saveSpbRecord,
  isDateMatch,
  seedSampleSpbRecords,
} from '../services/storage';
import { exportSPBExcel } from '../services/excel';
import {
  appendRecordToGoogleSheet,
  getAppsScriptWebhookUrl,
  pullDataFromGoogleSheet,
  flushPendingRecords,
  getPendingRecordsCount,
  verifyAndSyncSpbRecords,
  isRecordPendingSync,
  type SpbSyncStatus,
  GOOGLE_APPS_SCRIPT_CODE,
  TARGET_SPREADSHEET_URL,
  TARGET_SPREADSHEET_ID,
} from '../services/googleSheets';
import { SearchSelect } from './SearchSelect';
import { RatingInput } from './RatingInput';
import {
  ClipboardList,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Calendar,
  LogOut,
  RefreshCw,
  X,
  FileSpreadsheet,
  Download,
  Building2,
  Search,
  Eye,
  Filter,
  Copy,
  Check,
  ExternalLink,
  HelpCircle,
  Sparkles,
  Zap,
} from 'lucide-react';

interface SpbFormProps {
  session: SpbSession;
  setSession: (session: SpbSession) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
  autoOpenReport?: boolean;
  initialReportDate?: string;
  initialReportAllDates?: boolean;
  onCloseAutoReport?: () => void;
}

// Helper for SPB name matching (strictly matching logged-in SPB/PIC)
function isSameSpb(recordSpb?: string, loggedInSpb?: string): boolean {
  if (!recordSpb || !loggedInSpb) return false;
  const p1 = recordSpb.trim().toLowerCase();
  const p2 = loggedInSpb.trim().toLowerCase();
  if (p1 === p2) return true;
  const clean1 = p1.replace(/[^a-z0-9]/g, '');
  const clean2 = p2.replace(/[^a-z0-9]/g, '');
  if (clean1 === clean2) return true;

  const words1 = p1.split(/\s+/).filter(Boolean);
  const words2 = p2.split(/\s+/).filter(Boolean);
  if (words1.length > 1 && words2.length > 1) {
    const common = words1.filter((w) => words2.includes(w));
    if (common.length >= 2) return true;
  } else if (words1.length > 1 && words2.length === 1) {
    if (words1.includes(words2[0])) return true;
  } else if (words2.length > 1 && words1.length === 1) {
    if (words2.includes(words1[0])) return true;
  }
  return false;
}

export const SpbForm: React.FC<SpbFormProps> = ({
  session,
  setSession,
  onShowToast,
  autoOpenReport,
  initialReportDate,
  initialReportAllDates,
  onCloseAutoReport,
}) => {
  // Login states
  const [selectedSpb, setSelectedSpb] = useState(session.spbName || '');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Store params from URL (?id=...&nama=...)
  const [kodeToko, setKodeToko] = useState('Direct Link');
  const [namaToko, setNamaToko] = useState('Direct Link');
  const [hasStoreParams, setHasStoreParams] = useState(false);

  // GPS & Location states
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [ouCode, setOuCode] = useState<'GRT' | 'TSA'>('GRT');
  const [kecamatan, setKecamatan] = useState('');
  const [locationMeta, setLocationMeta] = useState<any>(null);

  // Form Fields
  const [namaResponden, setNamaResponden] = useState('');
  const [umur, setUmur] = useState('');
  const [pengeluaranRata, setPengeluaranRata] = useState('');
  const [pengeluaranMaks, setPengeluaranMaks] = useState('');
  const [berkenanHp, setBerkenanHp] = useState('Tidak');
  const [noHp, setNoHp] = useState('');

  const [brandUtama, setBrandUtama] = useState('');
  const [brandSebelumnya, setBrandSebelumnya] = useState('');
  const [brandRutinLain, setBrandRutinLain] = useState<string[]>(['TIDAK ADA']);
  const [brandSelingan, setBrandSelingan] = useState<string[]>(['TIDAK ADA']);

  const [pernahBeliGgi, setPernahBeliGgi] = useState('');
  const [kerapihanBatang, setKerapihanBatang] = useState(0);
  const [tembakauMulut, setTembakauMulut] = useState(0);
  const [konsistensiTarikan, setKonsistensiTarikan] = useState(0);
  const [minat16rb, setMinat16rb] = useState('');
  const [frekuensiBeli, setFrekuensiBeli] = useState('');

  const [beliGg, setBeliGg] = useState('TIDAK');
  const [qtyGg, setQtyGg] = useState('0');
  const [bundlingGarpit, setBundlingGarpit] = useState('TIDAK');
  const [bundlingLighter, setBundlingLighter] = useState('TIDAK');

  const [mantanPerokokGg, setMantanPerokokGg] = useState('TIDAK');
  const [brandGgDulu, setBrandGgDulu] = useState('');
  const [alasanPindah, setAlasanPindah] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Report Modal states (Agregat Harian SPB)
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDate, setReportDate] = useState(() => getTodayDateString());
  const [reportAllDates, setReportAllDates] = useState(false);
  const [reportSpbFilter, setReportSpbFilter] = useState('ALL');
  const [reportLoading, setReportLoading] = useState(false);
  const [isPullingReport, setIsPullingReport] = useState(false);
  const [pullReportMessage, setPullReportMessage] = useState<string | null>(null);
  const [pullReportNeedUpdate, setPullReportNeedUpdate] = useState(false);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(false);
  const [isCopiedScriptCode, setIsCopiedScriptCode] = useState(false);
  const [reportRecords, setReportRecords] = useState<SpbRecord[]>([]);
  const [pendingCount, setPendingCount] = useState(() => getPendingRecordsCount());
  const [isFlushingPending, setIsFlushingPending] = useState(false);

  // Check pending offline records whenever window gets focus or storage updates
  useEffect(() => {
    const updateCount = () => setPendingCount(getPendingRecordsCount());
    updateCount();
    window.addEventListener('focus', updateCount);
    window.addEventListener('storage', updateCount);
    window.addEventListener('spb_records_updated', updateCount);
    return () => {
      window.removeEventListener('focus', updateCount);
      window.removeEventListener('storage', updateCount);
      window.removeEventListener('spb_records_updated', updateCount);
    };
  }, []);

  // Hasil Input Modal states (Histori Khusus SPB yang Login)
  const [showHasilModal, setShowHasilModal] = useState(false);
  const [hasilDate, setHasilDate] = useState(() => getTodayDateString());
  const [hasilAllDates, setHasilAllDates] = useState(false);
  const [hasilLoading, setHasilLoading] = useState(false);
  const [hasilRecords, setHasilRecords] = useState<SpbRecord[]>([]);
  const [hasilSearch, setHasilSearch] = useState('');
  const [selectedDetailRecord, setSelectedDetailRecord] =
    useState<SpbRecord | null>(null);

  // Auto-refresh Report Modal and Hasil Modal whenever data is pulled or updated
  useEffect(() => {
    const handleDataRefreshed = () => {
      if (showReportModal) {
        loadReport(reportDate, reportAllDates, reportSpbFilter);
      }
      if (showHasilModal) {
        loadHasilData(hasilDate, hasilAllDates);
      }
    };
    window.addEventListener('spb_records_updated', handleDataRefreshed);
    window.addEventListener('google_sheets_data_pulled', handleDataRefreshed);
    return () => {
      window.removeEventListener('spb_records_updated', handleDataRefreshed);
      window.removeEventListener('google_sheets_data_pulled', handleDataRefreshed);
    };
  }, [showReportModal, showHasilModal, reportDate, reportAllDates, reportSpbFilter, hasilDate, hasilAllDates]);

  // Sync Verification states for SPB records in Google Sheet
  const [syncStatus, setSyncStatus] = useState<SpbSyncStatus | null>(null);
  const [isVerifyingSync, setIsVerifyingSync] = useState(false);
  const [syncedIds, setSyncedIds] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('ao_tasik_synced_spb_ids');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  // Parse URL search params on mount
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.has('id') && params.has('nama')) {
        setKodeToko(params.get('id') || '');
        setNamaToko(params.get('nama') || '');
        setHasStoreParams(true);
      }
    } catch {
      // Ignore
    }
  }, []);

  // Request GPS automatically when logged in
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
      loadReport(targetDate, targetAllDates, reportSpbFilter);
      handlePullGSheetInReport();
      if (onCloseAutoReport) onCloseAutoReport();
    }
  }, [autoOpenReport, initialReportDate, initialReportAllDates]);

  // Update reverse geocode when coordinates change
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

  // Handle Login Session
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (!selectedSpb) {
      setLoginError('Silakan pilih nama SPB terlebih dahulu.');
      return;
    }
    setIsLoggingIn(true);
    setTimeout(() => {
      const newSession: SpbSession = {
        isLoggedIn: true,
        spbName: selectedSpb,
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('spb_logged_in', 'true');
      localStorage.setItem('spb_name', selectedSpb);
      localStorage.setItem('spb_login_time', newSession.loginTime);
      setSession(newSession);
      onShowToast(
        `Login berhasil! Selamat bekerja, ${selectedSpb.split(' ')[0]}`,
        'success'
      );
      setIsLoggingIn(false);
    }, 300);
  };

  const handleLogout = () => {
    localStorage.removeItem('spb_logged_in');
    localStorage.removeItem('spb_name');
    localStorage.removeItem('spb_login_time');
    setSession({ isLoggedIn: false, spbName: '', loginTime: '' });
    onShowToast('Berhasil logout.', 'info');
  };

  // Handle GPS detection
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
              `Lokasi GPS & Kecamatan ${loc.kecamatan} (${loc.ouCode}) terdeteksi otomatis!`,
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

  // Toggle multi-select brand checkboxes
  const handleMultiBrandToggle = (
    brand: string,
    current: string[],
    setFn: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (brand === 'TIDAK ADA') {
      setFn(['TIDAK ADA']);
      return;
    }
    let updated = current.filter((b) => b !== 'TIDAK ADA');
    if (updated.includes(brand)) {
      updated = updated.filter((b) => b !== brand);
    } else {
      updated.push(brand);
    }
    if (updated.length === 0) {
      updated = ['TIDAK ADA'];
    }
    setFn(updated);
  };

  // Reset form
  const resetForm = () => {
    setNamaResponden('');
    setUmur('');
    setPengeluaranRata('');
    setPengeluaranMaks('');
    setBerkenanHp('Tidak');
    setNoHp('');
    setBrandUtama('');
    setBrandSebelumnya('');
    setBrandRutinLain(['TIDAK ADA']);
    setBrandSelingan(['TIDAK ADA']);
    setPernahBeliGgi('');
    setKerapihanBatang(0);
    setTembakauMulut(0);
    setKonsistensiTarikan(0);
    setMinat16rb('');
    setFrekuensiBeli('');
    setBeliGg('TIDAK');
    setQtyGg('0');
    setBundlingGarpit('TIDAK');
    setBundlingLighter('TIDAK');
    setMantanPerokokGg('TIDAK');
    setBrandGgDulu('');
    setAlasanPindah('');
  };

  // Submit survey
  const handleSubmitSurvey = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!session.spbName) {
      onShowToast('Sesi SPB tidak aktif. Silakan login kembali.', 'error');
      return;
    }

    if (!latitude || !longitude) {
      onShowToast(
        'Koordinat GPS wajib diaktifkan sebelum menyimpan survey.',
        'error'
      );
      document.getElementById('gps-section')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!kecamatan) {
      onShowToast(
        'Kecamatan belum terdeteksi. Silakan segarkan GPS.',
        'error'
      );
      return;
    }

    if (!brandUtama) {
      onShowToast('Silakan pilih Merek Utama saat ini.', 'error');
      return;
    }

    if (!brandSebelumnya) {
      onShowToast('Silakan pilih Merek Sebelumnya.', 'error');
      return;
    }

    if (!pernahBeliGgi) {
      onShowToast('Pertanyaan Pernah Membeli GGI 12 wajib dijawab.', 'error');
      return;
    }

    setIsSubmitting(true);
    const today = getTodayDateString();

    const record: Omit<SpbRecord, 'id'> = {
      nama_spb: session.spbName,
      kode_toko: kodeToko,
      nama_toko: namaToko,
      ou: ouCode,
      ou_code: ouCode,
      kecamatan: kecamatan,
      ro: 'BANDUNG',
      ao: 'TASIKMALAYA',
      nama_responden: namaResponden.trim(),
      umur,
      pengeluaran_rata: pengeluaranRata,
      pengeluaran_maks: pengeluaranMaks,
      berkenan_hp: berkenanHp,
      no_hp: berkenanHp === 'Ya' ? noHp.trim() : '-',
      brand_utama: brandUtama,
      brand_sebelumnya: brandSebelumnya,
      brand_rutin_lain: brandRutinLain.join(', '),
      brand_selingan: brandSelingan.join(', '),
      pernah_beli_ggi: pernahBeliGgi,
      kerapihan_batang: kerapihanBatang,
      tembakau_mulut: tembakauMulut,
      konsistensi_tarikan: konsistensiTarikan,
      minat_16rb: minat16rb,
      frekuensi_beli: frekuensiBeli,
      beli_gg: beliGg,
      qty_gg: beliGg === 'YA' ? qtyGg : '0',
      bundling_garpit: bundlingGarpit,
      bundling_lighter: bundlingLighter,
      mantan_perokok_gg: mantanPerokokGg,
      brand_gg_dulu: mantanPerokokGg === 'YA' ? brandGgDulu : '-',
      alasan_pindah: mantanPerokokGg === 'YA' ? alasanPindah : '-',
      latitude,
      longitude,
      tanggal: today,
      date: today,
      timestamp: new Date().toISOString(),
    };

    try {
      const res = await saveSpbRecord(record);
      const fullRecord = { ...record, id: res.id } as SpbRecord;
      
      // Asynchronous instant sync to Google Sheet via Webhook (no Google login required)
      appendRecordToGoogleSheet('spb', fullRecord).catch(
        (err) => console.warn('Google Sheet auto-sync notice:', err)
      );

      const hasWebhook = Boolean(getAppsScriptWebhookUrl());
      if (hasWebhook) {
        onShowToast('Survey SPB tersimpan & langsung masuk ke Google Sheet!', 'success');
      } else {
        onShowToast('Survey SPB berhasil tersimpan!', 'success');
      }
      resetForm();
      if (showHasilModal) {
        loadHasilData(hasilDate, hasilAllDates);
      }
    } catch {
      onShowToast('Gagal menyimpan survey SPB. Periksa koneksi.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Fetch report records
  const loadReport = async (
    dateFilter: string,
    allDates: boolean,
    spbFilter: string = reportSpbFilter
  ) => {
    setReportLoading(true);
    try {
      const all = await getSpbRecords();
      const dateFiltered = all.filter((r) => isDateMatch(r, dateFilter, allDates));
      const finalFiltered =
        spbFilter === 'ALL'
          ? dateFiltered
          : dateFiltered.filter((r) => {
              const pic = (r.nama_spb || (r as any).NAMA_SPB || '').trim();
              return isSameSpb(pic, spbFilter);
            });
      setReportRecords(finalFiltered);
    } catch {
      // Ignore
    } finally {
      setReportLoading(false);
    }
  };

  const handleCopyScriptCode = () => {
    try {
      navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
      setIsCopiedScriptCode(true);
      onShowToast('Kode Google Apps Script terbaru berhasil disalin ke clipboard!', 'success');
      setTimeout(() => setIsCopiedScriptCode(false), 3000);
    } catch {
      onShowToast('Gagal menyalin kode. Silakan buka tab Apps Script.', 'error');
    }
  };

  const handleLoadSampleData = () => {
    seedSampleSpbRecords(reportDate);
    loadReport(reportDate, reportAllDates, reportSpbFilter);
    onShowToast('Contoh data survey SPB (simulasi) berhasil dimuat!', 'success');
  };

  const handlePullGSheetInReport = async () => {
    setIsPullingReport(true);
    setPullReportMessage('Menarik data live dari Google Sheet...');
    try {
      const res = await pullDataFromGoogleSheet();
      if (res.success) {
        setPullReportNeedUpdate(false);
        setPullReportMessage(`Data berhasil ditarik: ${res.totalSpb} SPB di-refresh!`);
        await loadReport(reportDate, reportAllDates, reportSpbFilter);
        setTimeout(() => setPullReportMessage(null), 6000);
      } else {
        setPullReportNeedUpdate(Boolean(res.needScriptUpdate));
        setPullReportMessage(res.message);
      }
    } catch (e: any) {
      setPullReportMessage(`Gagal menarik data: ${e.message}`);
    } finally {
      setIsPullingReport(false);
    }
  };

  const handleFlushPending = async () => {
    setIsFlushingPending(true);
    try {
      const count = await flushPendingRecords();
      const rem = getPendingRecordsCount();
      setPendingCount(rem);
      if (count > 0) {
        onShowToast(`Berhasil menyinkronkan ${count} survey tertunda ke Google Sheet!`, 'success');
        await handlePullGSheetInReport();
      } else if (rem === 0) {
        onShowToast('Semua survey offline sudah tersinkronkan ke Google Sheet.', 'info');
      } else {
        onShowToast('Gagal mengirim data tertunda. Periksa koneksi internet perangkat.', 'error');
      }
    } catch (e: any) {
      onShowToast(`Gagal sinkron antrean: ${e.message}`, 'error');
    } finally {
      setIsFlushingPending(false);
    }
  };

  const openReportModal = () => {
    setShowReportModal(true);
    loadReport(reportDate, reportAllDates, reportSpbFilter);
    handlePullGSheetInReport();
  };

  // Load Hasil Input spesifik untuk SPB yang login
  const loadHasilData = async (dateFilter: string, allDates: boolean) => {
    setHasilLoading(true);
    try {
      const all = await getSpbRecords();
      const currentSpb = session.spbName.trim();
      const userFiltered = all.filter((rec) => {
        const spb = (
          rec.nama_spb ||
          (rec as any).NAMA_SPB ||
          (rec as any).spb ||
          (rec as any).SPB ||
          (rec as any).spbName ||
          (rec as any).petugas ||
          ''
        ).toString().trim();
        const matchesSpb = isSameSpb(spb, currentSpb);
        const matchesD = isDateMatch(rec, dateFilter, allDates);
        return matchesSpb && matchesD;
      });
      setHasilRecords(userFiltered);
    } catch {
      // Ignore
    } finally {
      setHasilLoading(false);
    }
  };

  // Verifikasi real-time kecocokan data SPB dengan Google Spreadsheet
  const triggerVerifySync = async (spbName: string, recordsToCheck?: SpbRecord[]) => {
    if (!spbName) return;
    setIsVerifyingSync(true);
    try {
      const list =
        recordsToCheck && recordsToCheck.length > 0 ? recordsToCheck : hasilRecords;
      const res = await verifyAndSyncSpbRecords(spbName, list);
      setSyncStatus(res);
      if (res.syncedRecordIds && res.syncedRecordIds.length > 0) {
        setSyncedIds((prev) => new Set([...prev, ...res.syncedRecordIds]));
      }
      if (res.uploadedCount > 0) {
        onShowToast(
          `Berhasil mengunggah ${res.uploadedCount} data SPB ke Google Sheet!`,
          'success'
        );
      }
    } catch (err: any) {
      console.warn('triggerVerifySync error:', err);
    } finally {
      setIsVerifyingSync(false);
    }
  };

  const openHasilModal = () => {
    setShowHasilModal(true);
    loadHasilData(hasilDate, hasilAllDates);
    triggerVerifySync(session.spbName);
  };

  // Filtered Hasil Input berdasarkan pencarian responden / rokok / toko
  const filteredHasilList = hasilRecords.filter((r) => {
    if (!hasilSearch.trim()) return true;
    const q = hasilSearch.toLowerCase();
    const resp = (r.nama_responden || '').toLowerCase();
    const brand = (r.brand_utama || '').toLowerCase();
    const toko = (r.nama_toko || '').toLowerCase();
    return resp.includes(q) || brand.includes(q) || toko.includes(q);
  });

  const hasilTotalSurvey = filteredHasilList.length;
  // Trial Person adalah jumlah orang yang melakukan pembelian
  const hasilTotalTrial = filteredHasilList.filter((r) => {
    const isBeli = (r.beli_gg || (r as any).BELI_GG || '').toString().trim().toUpperCase() === 'YA';
    const q = parseInt(r.qty_gg || (r as any).QTY_GG || '0', 10);
    return isBeli || (!isNaN(q) && q > 0);
  }).length;
  const hasilTotalBeli = hasilTotalTrial;
  // Penjualan (Pack) adalah kuantiti pack yang terjual
  const hasilTotalPack = filteredHasilList.reduce((acc, cur) => {
    const q = parseInt(cur.qty_gg || (cur as any).QTY_GG || '0', 10);
    return acc + (isNaN(q) ? 0 : q);
  }, 0);

  // Report statistics
  const reportTotalSurvey = reportRecords.length;
  // Trial Person adalah jumlah orang yang melakukan pembelian
  const reportTotalTrial = reportRecords.filter((r) => {
    const isBeli = (r.beli_gg || (r as any).BELI_GG || '').toString().trim().toUpperCase() === 'YA';
    const q = parseInt(r.qty_gg || (r as any).QTY_GG || '0', 10);
    return isBeli || (!isNaN(q) && q > 0);
  }).length;
  // Penjualan (Pack) adalah kuantiti pack yang terjual
  const reportTotalPack = reportRecords.reduce((acc, cur) => {
    const q = parseInt(cur.qty_gg || (cur as any).QTY_GG || '0', 10);
    return acc + (isNaN(q) ? 0 : q);
  }, 0);

  // Aggregated summary per SPB
  const spbGroupSummary = React.useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        stores: string[];
        contact: number;
        trial: number;
        selling: number;
      }
    >();

    reportRecords.forEach((r) => {
      const name = (r.nama_spb || (r as any).NAMA_SPB || 'Tanpa Nama').trim() || 'Tanpa Nama';
      const store = (r.nama_toko || (r as any).NAMA_TOKO || r.kode_toko || '').trim();
      const isBeli = (r.beli_gg || (r as any).BELI_GG || '').toString().trim().toUpperCase() === 'YA';
      const q = parseInt(r.qty_gg || (r as any).QTY_GG || '0', 10);
      const qty = isNaN(q) ? 0 : q;
      // Trial Person adalah jumlah orang yang melakukan pembelian
      const isTrial = isBeli || qty > 0;

      if (!map.has(name)) {
        map.set(name, {
          name,
          stores: store ? [store] : [],
          contact: 1,
          trial: isTrial ? 1 : 0,
          selling: qty,
        });
      } else {
        const item = map.get(name)!;
        item.contact += 1;
        if (isTrial) item.trial += 1;
        item.selling += qty;
        if (store && !item.stores.includes(store)) {
          item.stores.push(store);
        }
      }
    });

    return Array.from(map.values());
  }, [reportRecords]);

  // List of SPB names present in records for filter dropdown
  const availableSpbNames = React.useMemo(() => {
    const set = new Set<string>();
    reportRecords.forEach((r) => {
      const n = (r.nama_spb || (r as any).NAMA_SPB || '').trim();
      if (n) set.add(n);
    });
    return Array.from(set);
  }, [reportRecords]);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#D4D4D4] py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-neutral-900/80 rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        {/* Card Header */}
        <div className="bg-neutral-950 text-white p-6 md:p-8 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-white/5 text-white/80 border border-white/10 mb-2">
                Digital Survey v2.0
              </span>
              <h1 className="text-2xl md:text-3xl font-serif font-bold uppercase tracking-tight text-white">
                TRACKING SPB / FP GIK
              </h1>
              <p className="text-white/60 text-xs md:text-sm mt-1">
                Kuesioner Riset Konsumen, Uji Rasa Produk, & Monitoring Penjualan SPB
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {session.isLoggedIn && (
                <button
                  type="button"
                  onClick={openHasilModal}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                  title="Lihat histori data yang sudah di-input oleh SPB yang sedang login"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Lihat Hasil Input</span>
                </button>
              )}

              <button
                type="button"
                onClick={openReportModal}
                className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Report Harian</span>
              </button>
            </div>
          </div>

          {/* Session Header Bar */}
          {session.isLoggedIn ? (
            <>
              <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold font-serif text-lg">
                    {session.spbName.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-extrabold text-sm md:text-base">
                        {session.spbName}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Aktif
                      </span>
                    </div>
                    <p className="text-[11px] text-white/50">
                      Sesi Dimulai: {formatDateTime(session.loginTime)}
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
                    <span>Ganti SPB</span>
                  </button>
                </div>
              </div>

              {pendingCount > 0 && (
                <div className="mt-3 p-3 bg-amber-500/15 border border-amber-500/30 rounded-xl text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Ada <strong className="text-amber-300 font-bold">{pendingCount} survey offline</strong> di HP ini yang belum masuk ke Google Sheet.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleFlushPending}
                    disabled={isFlushingPending}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isFlushingPending ? 'animate-spin' : ''}`} />
                    <span>{isFlushingPending ? 'Menyinkronkan...' : 'Kirim Sekarang'}</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Login Box */
            <div className="pt-6 max-w-lg mx-auto">
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4" />
                      Pilih SPB yang Bertugas *
                    </label>
                    <span className="text-[10px] text-white/40">Wajib login</span>
                  </div>

                  <select
                    value={selectedSpb}
                    onChange={(e) => {
                      setSelectedSpb(e.target.value);
                      if (loginError) setLoginError('');
                    }}
                    className="w-full px-3.5 py-3 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">-- Pilih Nama SPB --</option>
                    {LIST_SPB.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  {loginError && (
                    <p className="text-xs font-bold text-rose-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {loginError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memulai Sesi...</span>
                      </>
                    ) : (
                      <span>Mulai Sesi SPB</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Survey Questionnaire Form */}
        {session.isLoggedIn && (
          <form onSubmit={handleSubmitSurvey} className="p-6 md:p-8 bg-white text-gray-800 space-y-8">
            {/* Store detection banner if loaded via QR link */}
            {hasStoreParams && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center gap-3 text-blue-900 text-xs md:text-sm font-semibold">
                <Building2 className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <span className="font-bold uppercase">Terdeteksi Lokasi Toko:</span>{' '}
                  {kodeToko} - {namaToko}
                </div>
              </div>
            )}

            {/* PART 1: TIM LAPANGAN & WILAYAH */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider border-b-2 border-emerald-200 pb-1 flex items-center gap-1.5">
                <ClipboardList className="w-4 h-4" /> PART 1: TIM LAPANGAN & WILAYAH
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Nama SPB *
                  </label>
                  <input
                    type="text"
                    value={session.spbName}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-emerald-300 rounded-xl text-sm font-bold bg-emerald-50/80 text-emerald-900 cursor-default"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-extrabold text-gray-400 uppercase mb-1">
                      RO *
                    </label>
                    <input
                      type="text"
                      value="BANDUNG"
                      readOnly
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-bold bg-gray-100 text-gray-500 cursor-not-allowed"
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

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-extrabold text-gray-700 uppercase">
                      OU (Otomatis GPS) *
                    </label>
                    {locationMeta ? (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Auto GPS ({locationMeta.ouCode})
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                        Otomatis
                      </span>
                    )}
                  </div>
                  <div className="w-full px-3.5 py-2.5 border border-gray-200 bg-gray-100/90 rounded-xl text-sm font-bold text-gray-800 flex items-center justify-between">
                    <span>
                      {ouCode
                        ? ouCode === 'GRT'
                          ? 'GRT (Garut)'
                          : 'TSA (Tasikmalaya)'
                        : 'Menunggu Lokasi GPS...'}
                    </span>
                    <MapPin className="w-4 h-4 text-gray-400 shrink-0" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-extrabold text-gray-700 uppercase">
                      Kecamatan (Otomatis GPS / Pilih) *
                    </label>
                    <div className="flex items-center gap-1.5">
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
                      <button
                        type="button"
                        onClick={() => handleGetGPS(false)}
                        className="text-[11px] text-emerald-700 hover:text-emerald-900 font-bold underline cursor-pointer ml-1"
                      >
                        {kecamatan ? 'Refresh GPS' : 'Ambil GPS'}
                      </button>
                    </div>
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
                    className="w-full px-3.5 py-2.5 border border-emerald-300 bg-emerald-50/80 rounded-xl text-sm font-bold text-emerald-950 focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">-- {latitude ? 'Pilih / Konfirmasi Kecamatan' : 'Menunggu Lokasi GPS / Pilih Kecamatan'} --</option>
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
              </div>
            </div>

            {/* PART 2: PROFIL KONSUMEN */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider border-b-2 border-emerald-200 pb-1">
                PART 2: PROFIL KONSUMEN
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Nama Responden *
                  </label>
                  <input
                    type="text"
                    value={namaResponden}
                    onChange={(e) => setNamaResponden(e.target.value)}
                    placeholder="Masukkan nama lengkap responden"
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Rentang Umur *
                  </label>
                  <select
                    value={umur}
                    onChange={(e) => setUmur(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="">Pilih Rentang Umur</option>
                    {RENTANG_UMUR_SPB.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    <option value="> 64 Tahun">&gt; 64 Tahun</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Rata-Rata Pengeluaran / Hari *
                  </label>
                  <select
                    value={pengeluaranRata}
                    onChange={(e) => setPengeluaranRata(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="">Pilih Pengeluaran Rata-rata</option>
                    <option value="< 15000">&lt; Rp 15.000</option>
                    {PENGELUARAN_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Maksimal Pengeluaran / Hari *
                  </label>
                  <select
                    value={pengeluaranMaks}
                    onChange={(e) => setPengeluaranMaks(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  >
                    <option value="">Pilih Pengeluaran Maksimal</option>
                    <option value="< 15000">&lt; Rp 15.000</option>
                    {PENGELUARAN_LIST.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-3">
                <label className="block text-xs font-extrabold text-gray-700 uppercase mb-2">
                  Berkenan Memberikan No Handphone? *
                </label>
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="berkenan_hp_radio"
                      value="Ya"
                      checked={berkenanHp === 'Ya'}
                      onChange={() => setBerkenanHp('Ya')}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Ya</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="berkenan_hp_radio"
                      value="Tidak"
                      checked={berkenanHp === 'Tidak'}
                      onChange={() => {
                        setBerkenanHp('Tidak');
                        setNoHp('');
                      }}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Tidak</span>
                  </label>
                </div>

                {berkenanHp === 'Ya' && (
                  <div className="pt-2 animate-in fade-in duration-200">
                    <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                      Nomor Handphone (WhatsApp) *
                    </label>
                    <input
                      type="tel"
                      value={noHp}
                      onChange={(e) => setNoHp(e.target.value)}
                      placeholder="Contoh: 081234567890"
                      required
                      className="w-full px-3.5 py-2.5 border border-emerald-300 rounded-xl text-sm font-mono font-medium focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* PART 3: KEBIASAAN MERK */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider border-b-2 border-emerald-200 pb-1">
                PART 3: KEBIASAAN MERK
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Merek Utama Saat Ini *
                  </label>
                  <SearchSelect
                    options={ALL_CIGARETTE_BRANDS}
                    value={brandUtama}
                    onChange={setBrandUtama}
                    placeholder="-- Pilih Merek Utama --"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Merek Sebelumnya *
                  </label>
                  <SearchSelect
                    options={['Tidak Pernah Beralih', ...ALL_CIGARETTE_BRANDS]}
                    value={brandSebelumnya}
                    onChange={setBrandSebelumnya}
                    placeholder="-- Pilih Merek Sebelumnya --"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-gray-700 uppercase">
                  Merek Rutin Lain (Bisa pilih lebih dari satu)
                </label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {ALL_CIGARETTE_BRANDS.map((brand) => (
                    <label
                      key={brand}
                      className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-100 rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={brandRutinLain.includes(brand)}
                        onChange={() =>
                          handleMultiBrandToggle(
                            brand,
                            brandRutinLain,
                            setBrandRutinLain
                          )
                        }
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <span className="font-medium text-gray-800">{brand}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer p-1 bg-gray-200/70 rounded-lg sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={brandRutinLain.includes('TIDAK ADA')}
                      onChange={() =>
                        handleMultiBrandToggle(
                          'TIDAK ADA',
                          brandRutinLain,
                          setBrandRutinLain
                        )
                      }
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span className="font-bold text-gray-900">
                      Tidak Ada Merek Lain
                    </span>
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-extrabold text-gray-700 uppercase">
                  Merek Selingan (Bisa pilih lebih dari satu)
                </label>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-2xl max-h-48 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {ALL_CIGARETTE_BRANDS.map((brand) => (
                    <label
                      key={brand}
                      className="flex items-center gap-2 cursor-pointer p-1 hover:bg-gray-100 rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={brandSelingan.includes(brand)}
                        onChange={() =>
                          handleMultiBrandToggle(
                            brand,
                            brandSelingan,
                            setBrandSelingan
                          )
                        }
                        className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                      />
                      <span className="font-medium text-gray-800">{brand}</span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 cursor-pointer p-1 bg-gray-200/70 rounded-lg sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={brandSelingan.includes('TIDAK ADA')}
                      onChange={() =>
                        handleMultiBrandToggle(
                          'TIDAK ADA',
                          brandSelingan,
                          setBrandSelingan
                        )
                      }
                      className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                    />
                    <span className="font-bold text-gray-900">
                      Tidak Ada Merek Lain
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* PART 4: FEEDBACK GGI KRETEK 12 */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-emerald-700 uppercase tracking-wider border-b-2 border-emerald-200 pb-1">
                PART 4: FEEDBACK GGI KRETEK 12
              </h3>

              <div>
                <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1.5">
                  Pernah Membeli GGI Kretek 12? *
                </label>
                <div className="flex items-center gap-6">
                  <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="pernah_beli_ggi_radio"
                      value="Ya"
                      checked={pernahBeliGgi === 'Ya'}
                      onChange={() => setPernahBeliGgi('Ya')}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Ya</span>
                  </label>

                  <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="pernah_beli_ggi_radio"
                      value="Tidak"
                      checked={pernahBeliGgi === 'Tidak'}
                      onChange={() => setPernahBeliGgi('Tidak')}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Tidak</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50/80 p-4 border border-gray-200 rounded-2xl">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Kerapihan Batang *
                  </label>
                  <RatingInput
                    value={kerapihanBatang}
                    onChange={setKerapihanBatang}
                    labels={RATINGS_KERAPIHAN}
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Serpihan Tembakau Mulut *
                  </label>
                  <RatingInput
                    value={tembakauMulut}
                    onChange={setTembakauMulut}
                    labels={RATINGS_TEMBAKAU_MULUT}
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Konsistensi Tarikan *
                  </label>
                  <RatingInput
                    value={konsistensiTarikan}
                    onChange={setKonsistensiTarikan}
                    labels={RATINGS_TARIKAN}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Minat Beli Rp 16.000 *
                  </label>
                  <select
                    value={minat16rb}
                    onChange={(e) => setMinat16rb(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Pilih Minat Beli Rp 16.000</option>
                    <option value="Pasti Akan Membeli">Pasti Akan Membeli</option>
                    <option value="Mungkin Akan Membeli">Mungkin Akan Membeli</option>
                    <option value="Belum Bisa Memutuskan">Belum Bisa Memutuskan</option>
                    <option value="Pasti Tidak Akan Membeli">Pasti Tidak Akan Membeli</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Frekuensi Pembelian *
                  </label>
                  <select
                    value={frekuensiBeli}
                    onChange={(e) => setFrekuensiBeli(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="">Pilih Frekuensi Pembelian</option>
                    <option value="Setiap hari sebagai rokok utama">
                      Setiap hari sebagai rokok utama
                    </option>
                    <option value="Setiap hari tapi bukan utama">
                      Setiap hari tapi bukan utama
                    </option>
                    <option value="Kadang-kadang saja">Kadang-kadang saja</option>
                  </select>
                </div>
              </div>
            </div>

            {/* PART 5: REAL TRANSAKSI */}
            <div className="space-y-4 p-5 bg-emerald-50/80 border border-emerald-200 rounded-2xl">
              <h3 className="text-xs font-extrabold text-emerald-800 uppercase tracking-wider border-b border-emerald-300 pb-1">
                PART 5: REAL TRANSAKSI
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-emerald-900 uppercase mb-1">
                    Konsumen Membeli Gudang Garam? *
                  </label>
                  <select
                    value={beliGg}
                    onChange={(e) => {
                      setBeliGg(e.target.value);
                      if (e.target.value === 'YA' && qtyGg === '0') setQtyGg('1');
                      if (e.target.value === 'TIDAK') {
                        setQtyGg('0');
                        setBundlingGarpit('TIDAK');
                        setBundlingLighter('TIDAK');
                      }
                    }}
                    required
                    className="w-full px-3.5 py-2.5 border border-emerald-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="YA">YA</option>
                    <option value="TIDAK">TIDAK</option>
                  </select>
                </div>

                {beliGg === 'YA' && (
                  <>
                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-extrabold text-emerald-900 uppercase mb-1">
                        Jumlah Pembelian (Pack) *
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={qtyGg}
                        onChange={(e) => setQtyGg(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 border border-emerald-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>

                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-extrabold text-emerald-900 uppercase mb-1">
                        Bundling Garpit? *
                      </label>
                      <select
                        value={bundlingGarpit}
                        onChange={(e) => setBundlingGarpit(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-emerald-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="YA">YA</option>
                        <option value="TIDAK">TIDAK</option>
                      </select>
                    </div>

                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-extrabold text-emerald-900 uppercase mb-1">
                        Bundling Lighter? *
                      </label>
                      <select
                        value={bundlingLighter}
                        onChange={(e) => setBundlingLighter(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-emerald-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-emerald-500"
                      >
                        <option value="YA">YA</option>
                        <option value="TIDAK">TIDAK</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PART 6: HISTORI MANTAN PEROKOK GG */}
            <div className="space-y-4 p-5 bg-amber-50/80 border border-amber-200 rounded-2xl">
              <h3 className="text-xs font-extrabold text-amber-900 uppercase tracking-wider border-b border-amber-300 pb-1">
                PART 6: HISTORI MANTAN PEROKOK GG
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-amber-950 uppercase mb-1">
                    Pernah Merokok GG? *
                  </label>
                  <select
                    value={mantanPerokokGg}
                    onChange={(e) => {
                      setMantanPerokokGg(e.target.value);
                      if (e.target.value === 'TIDAK') {
                        setBrandGgDulu('');
                        setAlasanPindah('');
                      }
                    }}
                    required
                    className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="YA">YA</option>
                    <option value="TIDAK">TIDAK</option>
                  </select>
                </div>

                {mantanPerokokGg === 'YA' && (
                  <>
                    <div className="animate-in fade-in duration-200">
                      <label className="block text-xs font-extrabold text-amber-950 uppercase mb-1">
                        Brand GG Dulu? *
                      </label>
                      <select
                        value={brandGgDulu}
                        onChange={(e) => setBrandGgDulu(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Pilih Brand Dulu</option>
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
                        Alasan Pindah? *
                      </label>
                      <select
                        value={alasanPindah}
                        onChange={(e) => setAlasanPindah(e.target.value)}
                        required
                        className="w-full px-3.5 py-2.5 border border-amber-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-amber-500"
                      >
                        <option value="">Pilih Alasan Pindah</option>
                        <option value="Harga Rokok Mahal">Harga Rokok Mahal</option>
                        <option value="Ingin Rasa Rokok Lain">Ingin Rasa Rokok Lain</option>
                        <option value="Ketersediaan Rokok Jarang">Ketersediaan Rokok Jarang</option>
                        <option value="Pengaruh Teman atau Lingkungan">
                          Pengaruh Teman atau Lingkungan
                        </option>
                      </select>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* PART 7: KOORDINAT LOKASI SPB */}
            <div
              id="gps-section"
              className="space-y-4 p-5 bg-blue-50/80 border border-blue-200 rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-blue-300 pb-1">
                <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> PART 7: KOORDINAT
                  LOKASI SPB
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

              <div className="pt-2">
                {gpsLoading ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Mendeteksi koordinat GPS presisi tinggi...</span>
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
                className="w-full sm:flex-1 py-4 px-6 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-extrabold text-sm uppercase tracking-wider rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Menyimpan Survey SPB...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Simpan Survey SPB</span>
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

      {/* Report Harian Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-amber-600 to-amber-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base">📊 Report Harian SPB</h3>
                <p className="text-xs text-amber-200">
                  Monitoring Progress Tanggal: {reportDate}
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

            <div className="p-4 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-amber-900">Tanggal:</span>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => {
                    setReportDate(e.target.value);
                    setReportAllDates(false);
                    loadReport(e.target.value, false, reportSpbFilter);
                  }}
                  className="px-3 py-1.5 border border-amber-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayDateString();
                    setReportDate(today);
                    setReportAllDates(false);
                    loadReport(today, false, reportSpbFilter);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-bold transition-colors cursor-pointer"
                >
                  Hari Ini
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const toggle = !reportAllDates;
                    setReportAllDates(toggle);
                    loadReport(reportDate, toggle, reportSpbFilter);
                  }}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors cursor-pointer ${
                    reportAllDates
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-900'
                  }`}
                >
                  {reportAllDates ? '✓ Semua Tanggal' : 'Semua Tanggal'}
                </button>

                {/* Filter SPB */}
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-xs font-bold text-amber-900">Filter SPB:</span>
                  <select
                    value={reportSpbFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReportSpbFilter(val);
                      loadReport(reportDate, reportAllDates, val);
                    }}
                    className="px-2.5 py-1.5 border border-amber-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="ALL">👥 Semua SPB (Summary)</option>
                    {availableSpbNames.map((name) => (
                      <option key={name} value={name}>
                        👤 {name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => handlePullGSheetInReport()}
                  disabled={isPullingReport || reportLoading}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer disabled:opacity-50"
                  title="Tarik data terbaru yang diinput surveyor dari Google Sheet"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isPullingReport ? 'animate-spin' : ''}`}
                  />
                  <span>{isPullingReport ? 'Menarik...' : 'Tarik Data Spreadsheet'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-300">
                  {spbGroupSummary.length} SPB Aktif • {reportRecords.length} Record
                </span>
              </div>
            </div>

            {pendingCount > 0 && (
              <div className="p-3.5 bg-amber-500/15 border-b border-amber-500/30 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span className="text-xs font-semibold text-amber-900">
                    Ada <strong>{pendingCount} survey</strong> di perangkat ini yang belum tersinkronkan ke Google Sheet (karena offline/gangguan sinyal).
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleFlushPending}
                  disabled={isFlushingPending}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFlushingPending ? 'animate-spin' : ''}`} />
                  <span>{isFlushingPending ? 'Mengirim...' : 'Kirim ke Spreadsheet Sekarang'}</span>
                </button>
              </div>
            )}

            {pullReportNeedUpdate ? (
              <div className="p-4 bg-amber-500/10 border-b border-amber-500/30 text-amber-900 space-y-3">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1 flex-1">
                    <h5 className="font-extrabold text-xs text-amber-950 uppercase tracking-wide">
                      Kode Google Apps Script di Spreadsheet Perlu Diperbarui
                    </h5>
                    <p className="text-xs text-amber-900/90 leading-relaxed">
                      Webhook Google Apps Script saat ini masih versi awal (hanya bisa menerima simpan survey, belum bisa membaca data ke Dashboard/Report). Perbarui kodenya dalam 3 langkah mudah agar sinkronisasi data dari spreadsheet berjalan lancar.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleCopyScriptCode}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                  >
                    {isCopiedScriptCode ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Kode Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode Script Baru</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowAppsScriptGuide(true)}
                    className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold flex items-center gap-1.5 border border-amber-300 transition-colors cursor-pointer"
                  >
                    <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                    <span>Panduan Update (3 Langkah)</span>
                  </button>

                  <a
                    href={TARGET_SPREADSHEET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded-xl bg-white hover:bg-gray-50 text-gray-800 text-xs font-bold flex items-center gap-1.5 border border-gray-300 transition-colors"
                  >
                    <span>Buka Spreadsheet ↗</span>
                  </a>
                </div>
              </div>
            ) : pullReportMessage ? (
              <div
                className={`px-4 py-2.5 border-b text-xs font-semibold flex items-center gap-2 ${
                  pullReportMessage.toLowerCase().includes('gagal') ||
                  pullReportMessage.toLowerCase().includes('error')
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : isPullingReport
                    ? 'bg-blue-50 border-blue-200 text-blue-800'
                    : 'bg-emerald-100 border-emerald-200 text-emerald-800'
                }`}
              >
                {isPullingReport ? (
                  <RefreshCw className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
                ) : pullReportMessage.toLowerCase().includes('gagal') ||
                  pullReportMessage.toLowerCase().includes('error') ? (
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
                <span className="flex-1">{pullReportMessage}</span>
              </div>
            ) : null}

            <div className="p-4 overflow-y-auto flex-1 space-y-5">
              {/* Metric Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-neutral-800">
                    {spbGroupSummary.length}
                  </div>
                  <div className="text-[10px] font-extrabold text-neutral-600 uppercase mt-0.5">
                    Petugas SPB
                  </div>
                </div>

                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-emerald-700">
                    {reportTotalSurvey}
                  </div>
                  <div className="text-[10px] font-extrabold text-emerald-900 uppercase mt-0.5">
                    Consumer Contact
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-blue-700">
                    {reportTotalTrial}
                  </div>
                  <div className="text-[10px] font-extrabold text-blue-900 uppercase mt-0.5">
                    Trial Person
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-amber-700">
                    {reportTotalPack}
                  </div>
                  <div className="text-[10px] font-extrabold text-amber-900 uppercase mt-0.5">
                    Penjualan (Pack)
                  </div>
                </div>
              </div>

              {/* SECTION: Rekapitulasi Semua SPB */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    Summary Rekapitulasi Semua Petugas SPB Lapangan
                  </h4>
                  <span className="text-[11px] text-gray-500 font-medium">
                    {reportAllDates ? 'Seluruh Tanggal' : reportDate}
                  </span>
                </div>

                {spbGroupSummary.length === 0 ? (
                  <div className="p-6 rounded-2xl border-2 border-dashed border-amber-300/80 bg-amber-50/50 text-center space-y-3">
                    <p className="text-sm font-bold text-gray-800">
                      Belum ada data survey SPB pada tanggal{' '}
                      <span className="text-amber-800 underline">
                        {reportAllDates ? 'Seluruh Tanggal' : reportDate}
                      </span>
                    </p>
                    <p className="text-xs text-gray-600 max-w-md mx-auto leading-relaxed">
                      Data di browser HP ini masih kosong karena survey tersimpan di memori perangkat masing-masing (LocalStorage). Silakan tekan tombol <strong>Tarik Data Spreadsheet</strong> di bawah untuk menyinkronkan data live dari Google Sheet ke HP Anda.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handlePullGSheetInReport()}
                        disabled={isPullingReport}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${isPullingReport ? 'animate-spin' : ''}`} />
                        <span>{isPullingReport ? 'Sedang Menarik Data Live...' : '🔄 Tarik Data dari Spreadsheet Sekarang'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleLoadSampleData}
                        className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow transition-colors cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>🧪 Muat Contoh Data (Simulasi)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAppsScriptGuide(true)}
                        className="px-3 py-2 rounded-xl bg-white hover:bg-gray-100 text-amber-900 border border-amber-300 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                        <span>Panduan Apps Script</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="overflow-x-auto border rounded-xl shadow-xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-amber-100/70 font-bold text-amber-950 uppercase border-b border-amber-200 text-[11px]">
                        <tr>
                          <th className="py-2.5 px-3">No</th>
                          <th className="py-2.5 px-3">Nama SPB</th>
                          <th className="py-2.5 px-3">Toko / Outlet</th>
                          <th className="py-2.5 px-3 text-center">Consumer Contact</th>
                          <th className="py-2.5 px-3 text-center">Trial Person</th>
                          <th className="py-2.5 px-3 text-center">Penjualan (Pack)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-800">
                        {spbGroupSummary.map((spb, idx) => (
                          <tr key={spb.name} className="hover:bg-amber-50/50 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-gray-400">{idx + 1}</td>
                            <td className="py-2.5 px-3 font-bold text-gray-900">
                              {spb.name}
                            </td>
                            <td className="py-2.5 px-3 text-gray-600">
                              {spb.stores.length > 0
                                ? spb.stores.join(', ')
                                : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-emerald-700">
                              {spb.contact}
                            </td>
                            <td className="py-2.5 px-3 text-center font-bold text-blue-700">
                              {spb.trial}
                            </td>
                            <td className="py-2.5 px-3 text-center font-extrabold text-amber-700">
                              {spb.selling}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-amber-50 font-extrabold text-amber-950 border-t border-amber-200 text-xs">
                        <tr>
                          <td colSpan={3} className="py-2.5 px-3 text-right uppercase">
                            Total Keseluruhan SPB:
                          </td>
                          <td className="py-2.5 px-3 text-center text-emerald-800">
                            {reportTotalSurvey}
                          </td>
                          <td className="py-2.5 px-3 text-center text-blue-800">
                            {reportTotalTrial}
                          </td>
                          <td className="py-2.5 px-3 text-center text-amber-800">
                            {reportTotalPack}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => exportSPBExcel(reportRecords)}
                disabled={reportRecords.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Rekap SPB (.xlsx)</span>
              </button>

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

      {/* Modal Panduan Update Google Apps Script */}
      {showAppsScriptGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white text-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-amber-600 to-amber-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <HelpCircle className="w-6 h-6 text-amber-200 shrink-0" />
                <div>
                  <h3 className="font-extrabold text-base md:text-lg">
                    Panduan Update Google Apps Script
                  </h3>
                  <p className="text-xs text-amber-100">
                    Hanya perlu 1-2 menit agar data survey dari spreadsheet masuk ke Dashboard & Report
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAppsScriptGuide(false)}
                className="p-1.5 rounded-full hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 leading-relaxed">
                <strong>Mengapa data masih kosong?</strong><br />
                Saat survey disubmit, data langsung masuk ke Google Sheet. Namun untuk menampilkannya kembali ke layar HP/Dashboard ini, Google Apps Script membutuhkan fungsi <code>doGet()</code> terbaru yang sudah kami buatkan.
              </div>

              {/* Langkah 1 */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-800 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black">
                    1
                  </span>
                  Buka Spreadsheet & Menu Apps Script
                </div>
                <p className="text-gray-600 pl-8">
                  Buka spreadsheet target Anda, lalu klik menu <strong>Ekstensi</strong> di bilah atas, lalu pilih <strong>Apps Script</strong>.
                </p>
                <div className="pl-8 pt-1">
                  <a
                    href={TARGET_SPREADSHEET_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    <span>Buka Spreadsheet Sekarang ↗</span>
                  </a>
                </div>
              </div>

              {/* Langkah 2 */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-800 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black">
                    2
                  </span>
                  Ganti / Paste Kode Terbaru di File Code.gs
                </div>
                <p className="text-gray-600 pl-8">
                  Hapus semua kode lama di file <code>Code.gs</code>, lalu paste kode lengkap berikut:
                </p>
                <div className="pl-8 pt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyScriptCode}
                    className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold flex items-center gap-2 shadow"
                  >
                    {isCopiedScriptCode ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Kode Berhasil Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Salin Kode Script Lengkap (1-Klik)</span>
                      </>
                    )}
                  </button>
                  <span className="text-gray-500 text-[11px]">
                    (Kode mencakup fungsi pembaca tab TRACKING SPB, CDC FP SPB, & HAJATAN SURVEY)
                  </span>
                </div>
              </div>

              {/* Langkah 3 */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-800 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs font-black">
                    3
                  </span>
                  Deploy Versi Baru (Sangat Penting!)
                </div>
                <ol className="list-decimal pl-12 space-y-1 text-gray-700">
                  <li>Klik tombol <strong>Deploy (Terapkan)</strong> di kanan atas Apps Script.</li>
                  <li>Pilih <strong>Manage deployments (Kelola penerapan)</strong>.</li>
                  <li>Klik ikon <strong>Pensil (Edit)</strong> di samping versi yang aktif.</li>
                  <li>Pada dropdown <em>Version</em>, pilih <strong>New version (Versi baru)</strong>.</li>
                  <li>Pastikan <em>Who has access</em> adalah <strong>Anyone (Siapa saja)</strong>.</li>
                  <li>Klik <strong>Deploy</strong>. Selesai!</li>
                </ol>
              </div>

              {/* Langkah 4 */}
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-black text-emerald-900 uppercase tracking-wide">
                  <span className="w-6 h-6 rounded-full bg-emerald-700 text-white flex items-center justify-center text-xs font-black">
                    4
                  </span>
                  Tarik Data di Aplikasi
                </div>
                <p className="text-emerald-950 pl-8">
                  Setelah deploy berhasil, tutup modal ini lalu klik tombol hijau <strong>"Tarik Data Spreadsheet"</strong>. Semua data survey dari spreadsheet akan langsung masuk ke tabel!
                </p>
              </div>
            </div>

            <div className="p-4 border-t bg-gray-100 flex items-center justify-between">
              <button
                type="button"
                onClick={handleLoadSampleData}
                className="px-4 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold border border-amber-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                <span>Muat Contoh Data Sekarang</span>
              </button>

              <button
                type="button"
                onClick={() => setShowAppsScriptGuide(false)}
                className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-black text-white font-bold cursor-pointer"
              >
                Tutup Panduan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histori Hasil Input SPB */}
      {showHasilModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-200" />
                  <h3 className="font-extrabold text-base md:text-lg">
                    📋 Rincian Responden Survey (Histori Hasil Input)
                  </h3>
                </div>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Petugas SPB / PIC: <span className="font-bold underline">{session.spbName}</span> • Outlet: {namaToko} ({kodeToko})
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
            <div className="p-4 bg-emerald-50/70 border-b border-emerald-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-emerald-950 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-emerald-700" /> Tanggal:
                </span>
                <input
                  type="date"
                  value={hasilDate}
                  onChange={(e) => {
                    setHasilDate(e.target.value);
                    setHasilAllDates(false);
                    loadHasilData(e.target.value, false);
                  }}
                  className="px-3 py-1.5 border border-emerald-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayDateString();
                    setHasilDate(today);
                    setHasilAllDates(false);
                    loadHasilData(today, false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-xs font-bold transition-colors cursor-pointer"
                  title="Kembali ke Hari Ini"
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
                      ? 'bg-emerald-700 text-white shadow'
                      : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900'
                  }`}
                >
                  {hasilAllDates ? '✓ Semua Riwayat Tanggal' : 'Semua Tanggal'}
                </button>
                <button
                  type="button"
                  onClick={() => loadHasilData(hasilDate, hasilAllDates)}
                  disabled={hasilLoading}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center gap-1 shadow transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${hasilLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </button>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-56">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari responden / rokok / toko..."
                    value={hasilSearch}
                    onChange={(e) => setHasilSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-emerald-300 rounded-xl text-xs font-medium bg-white text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <span className="text-xs font-bold text-emerald-900 bg-emerald-200/80 px-2.5 py-1.5 rounded-lg border border-emerald-300 whitespace-nowrap">
                  Total: {filteredHasilList.length} Survey
                </span>
              </div>
            </div>

            {/* Body Content */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Google Sheet Live Sync Status Banner */}
              <div className="p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-50 border border-emerald-300 rounded-2xl shadow-sm space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-emerald-700 text-white flex items-center justify-center shrink-0 shadow mt-0.5">
                      <FileSpreadsheet className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5 font-black text-xs text-emerald-950">
                        <span>Status Google Sheet (Sheet: TRACKING SPB)</span>
                        {isVerifyingSync ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 font-bold bg-emerald-100 px-2 py-0.5 rounded-full">
                            <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                            Memeriksa...
                          </span>
                        ) : syncStatus?.success ? (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-800 font-extrabold bg-emerald-200/90 px-2 py-0.5 rounded-full border border-emerald-400">
                            <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                            100% Terverifikasi di Google Sheet
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-900 font-bold bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
                            Cek Koneksi
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-emerald-800 font-medium mt-0.5">
                        {isVerifyingSync
                          ? 'Mengecek data SPB live ke Google Spreadsheet...'
                          : syncStatus
                          ? syncStatus.message
                          : `Memverifikasi keberadaan data SPB ${session.spbName} di Google Sheet...`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => triggerVerifySync(session.spbName)}
                      disabled={isVerifyingSync}
                      className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingSync ? 'animate-spin' : ''}`} />
                      <span>{isVerifyingSync ? 'Memeriksa...' : 'Cek & Sinkronkan Ulang'}</span>
                    </button>

                    <a
                      href={TARGET_SPREADSHEET_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center gap-1 cursor-pointer"
                      title="Buka Google Sheet target di browser"
                    >
                      <span>Buka Sheet</span>
                      <ExternalLink className="w-3 h-3 text-emerald-700" />
                    </a>
                  </div>
                </div>

                {syncStatus?.rowRange && (
                  <div className="text-[11px] text-emerald-950 bg-white/90 p-2 rounded-xl border border-emerald-200 flex flex-wrap items-center justify-between gap-1 font-mono">
                    <span>📍 Posisi Data di Sheet: <strong className="text-emerald-800">{syncStatus.rowRange}</strong></span>
                    <span className="font-sans text-[10px] text-emerald-700 font-bold">Total Baris Sheet: {syncStatus.totalInSheet} baris</span>
                  </div>
                )}
              </div>

              {/* Summary Badges */}
              <div className="grid grid-cols-3 gap-2.5">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-emerald-800">
                    {hasilTotalSurvey}
                  </div>
                  <div className="text-[10px] font-extrabold text-emerald-900 uppercase">
                    Consumer Contact
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-blue-800">
                    {hasilTotalTrial}
                  </div>
                  <div className="text-[10px] font-extrabold text-blue-900 uppercase">
                    Trial Person
                  </div>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-purple-800">
                    {hasilTotalPack} pack
                  </div>
                  <div className="text-[10px] font-extrabold text-purple-900 uppercase">
                    Penjualan (Pack)
                  </div>
                </div>
              </div>

              {/* Header Title Section Rincian Responden Survey */}
              <div className="flex items-center justify-between pt-1">
                <h4 className="text-xs font-extrabold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardList className="w-4 h-4 text-emerald-600" />
                  Rincian Responden Survey ({filteredHasilList.length} Data)
                </h4>
                <span className="text-[11px] font-bold text-emerald-900 bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-300">
                  👤 Histori Data PIC: {session.spbName}
                </span>
              </div>

              {/* Data Table / Empty State */}
              {hasilLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                  <span>Memuat histori data input SPB {session.spbName}...</span>
                </div>
              ) : filteredHasilList.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm flex flex-col items-center gap-3">
                  <span className="text-3xl">📭</span>
                  <p className="font-semibold text-gray-700">
                    Belum ada data input untuk SPB <span className="font-bold text-emerald-700">{session.spbName}</span> pada{' '}
                    {hasilAllDates ? 'semua riwayat tanggal' : `tanggal ${hasilDate}`}.
                  </p>
                  {!hasilAllDates && (
                    <button
                      type="button"
                      onClick={() => {
                        setHasilAllDates(true);
                        loadHasilData(hasilDate, true);
                      }}
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow cursor-pointer transition-colors"
                    >
                      Tampilkan Semua Riwayat Tanggal
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto border border-gray-200 rounded-2xl shadow-sm">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-emerald-50/80 text-emerald-950 uppercase font-extrabold border-b border-emerald-200">
                      <tr>
                        <th className="p-3">No</th>
                        <th className="p-3">Waktu</th>
                        <th className="p-3">Responden</th>
                        <th className="p-3">Outlet / Toko</th>
                        <th className="p-3">Brand Utama</th>
                        <th className="p-3 text-center">Trial GGI</th>
                        <th className="p-3 text-center">Beli GG & Qty</th>
                        <th className="p-3 text-center">Status Cloud</th>
                        <th className="p-3 text-center">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-800">
                      {filteredHasilList.map((rec, idx) => {
                        const rawTime =
                          rec.timestamp ||
                          (rec as any).Timestamp ||
                          (rec as any).created_at ||
                          rec.tanggal ||
                          rec.date ||
                          '-';
                        const waktuFormatted = formatDateTime(rawTime);
                        const isBeli = rec.beli_gg === 'YA';
                        const qty = rec.qty_gg || '0';

                        return (
                          <tr
                            key={rec.id || idx}
                            className="hover:bg-emerald-50/40 transition-colors"
                          >
                            <td className="p-3 font-bold text-gray-500">
                              {idx + 1}
                            </td>
                            <td className="p-3 text-gray-500 font-mono whitespace-nowrap text-[11px]">
                              {waktuFormatted}
                            </td>
                            <td className="p-3">
                              <div className="font-bold text-gray-900">
                                {rec.nama_responden || '-'}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {rec.umur} thn • HP: {rec.no_hp || '-'}
                              </div>
                            </td>
                            <td className="p-3">
                              <div className="font-medium text-gray-800">
                                {rec.nama_toko || '-'}
                              </div>
                              <div className="text-[10px] text-gray-500 font-mono">
                                {rec.kode_toko || '-'}
                              </div>
                            </td>
                            <td className="p-3">
                              <span className="font-medium text-gray-900">
                                {rec.brand_utama || '-'}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  rec.pernah_beli_ggi === 'Ya' ||
                                  rec.pernah_beli_ggi === 'YA'
                                    ? 'bg-blue-100 text-blue-800 font-extrabold'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {rec.pernah_beli_ggi || 'Tidak'}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              {isBeli ? (
                                <span className="inline-block px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-emerald-100 text-emerald-800">
                                  Beli ({qty} pack)
                                </span>
                              ) : (
                                <span className="text-gray-400 italic text-[11px]">
                                  Tidak Beli
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center whitespace-nowrap">
                              {syncedIds.has(rec.id) || (syncStatus?.sheetRowMap && (syncStatus.sheetRowMap[rec.id] || syncStatus.sheetRowMap[(rec.nama_responden || '').trim().toLowerCase()])) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>{syncStatus?.sheetRowMap?.[rec.id] ? `GSheet #${syncStatus.sheetRowMap[rec.id]}` : 'Di Google Sheet'}</span>
                                </span>
                              ) : isRecordPendingSync(rec.id) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-extrabold text-[10px] bg-amber-100 text-amber-900 border border-amber-300">
                                  <AlertCircle className="w-3 h-3 text-amber-600" />
                                  <span>Antrean HP</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  <span>Tersimpan</span>
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => setSelectedDetailRecord(rec)}
                                className="px-2.5 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-900 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 mx-auto cursor-pointer"
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

            {/* Modal Footer */}
            <div className="p-4 border-t bg-gray-50 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => exportSPBExcel(filteredHasilList)}
                  disabled={filteredHasilList.length === 0}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export Data SPB ({filteredHasilList.length}) ke Excel</span>
                </button>

                <button
                  type="button"
                  onClick={() => triggerVerifySync(session.spbName)}
                  disabled={isVerifyingSync}
                  className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow"
                  title="Cek dan sinkronkan ke Google Sheet"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isVerifyingSync ? 'animate-spin' : ''}`} />
                  <span>{isVerifyingSync ? 'Menyinkronkan...' : 'Sinkronkan ke Google Sheet'}</span>
                </button>
              </div>

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

      {/* Modal Detail Survey Responden SPB */}
      {selectedDetailRecord && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-sm">
                  Detail Survey: {selectedDetailRecord.nama_responden}
                </h4>
                <p className="text-[11px] text-gray-400">
                  SPB: {selectedDetailRecord.nama_spb} • Outlet: {selectedDetailRecord.nama_toko}
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
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Nama Responden</span>
                  <p className="font-bold text-gray-900">{selectedDetailRecord.nama_responden}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Umur & HP</span>
                  <p className="font-bold text-gray-900">
                    {selectedDetailRecord.umur} thn • {selectedDetailRecord.no_hp || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Pengeluaran Rokok</span>
                  <p className="font-medium text-gray-800">
                    Rata-rata: {selectedDetailRecord.pengeluaran_rata || '-'} <br />
                    Maks: {selectedDetailRecord.pengeluaran_maks || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Outlet / Toko</span>
                  <p className="font-medium text-gray-800">
                    {selectedDetailRecord.nama_toko} ({selectedDetailRecord.kode_toko})
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-blue-50/60 rounded-xl border border-blue-200">
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Brand Utama</span>
                  <p className="font-bold text-blue-950">{selectedDetailRecord.brand_utama}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Brand Sebelumnya</span>
                  <p className="font-medium text-blue-950">{selectedDetailRecord.brand_sebelumnya || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Beli GG Saat Kunjungan</span>
                  <p className="font-bold text-blue-950">
                    {selectedDetailRecord.beli_gg === 'YA' ? `YA (${selectedDetailRecord.qty_gg || '0'} pack)` : 'TIDAK'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Bundling Garpit</span>
                  <p className="font-bold text-blue-950">{selectedDetailRecord.bundling_garpit || 'TIDAK'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Bundling Lighter</span>
                  <p className="font-bold text-blue-950">{selectedDetailRecord.bundling_lighter || 'TIDAK'}</p>
                </div>
              </div>

              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 space-y-2">
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Uji Rasa & Rating Produk (GGI)</span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-gray-500">Kerapihan Batang</span>
                    <p className="font-bold text-amber-950">{selectedDetailRecord.kerapihan_batang || 0} / 5</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500">Tembakau di Mulut</span>
                    <p className="font-bold text-amber-950">{selectedDetailRecord.tembakau_mulut || 0} / 5</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500">Konsistensi Tarikan</span>
                    <p className="font-bold text-amber-950">{selectedDetailRecord.konsistensi_tarikan || 0} / 5</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-amber-200/60">
                  <div>
                    <span className="text-[10px] text-gray-500">Minat Beli (16rb)</span>
                    <p className="font-bold text-amber-950">{selectedDetailRecord.minat_16rb || '-'}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500">Frekuensi Beli</span>
                    <p className="font-bold text-amber-950">{selectedDetailRecord.frekuensi_beli || '-'}</p>
                  </div>
                </div>
              </div>

              {selectedDetailRecord.mantan_perokok_gg === 'YA' && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200">
                  <span className="text-[10px] font-bold text-red-800 uppercase block">Mantan Perokok GG</span>
                  <p className="text-gray-800 text-xs mt-1">
                    Brand GG Dulu: <span className="font-bold">{selectedDetailRecord.brand_gg_dulu || '-'}</span> <br />
                    Alasan Pindah: <span className="font-medium">{selectedDetailRecord.alasan_pindah || '-'}</span>
                  </p>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Lokasi GPS & OU</span>
                <p className="text-gray-800 font-mono text-[11px]">
                  {selectedDetailRecord.latitude}, {selectedDetailRecord.longitude} (Kec. {selectedDetailRecord.kecamatan || '-'} • OU: {selectedDetailRecord.ou || selectedDetailRecord.ou_code || '-'})
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
