import React, { useEffect, useState } from 'react';
import { HajatanRecord, HajatanSession } from '../types';
import {
  LIST_PIC_HAJATAN,
  PEKERJAAN_LIST,
  KELOMPOK_USIA_EVENT,
  LAMA_KONSUMSI_LIST,
  MOMENT_GG_LIST,
  ALL_CIGARETTE_BRANDS,
  KECAMATAN_NAMES,
  getOuFromKecamatan,
} from '../data/constants';
import {
  detectLocationFromCoordinates,
  formatDateTime,
  getTodayDateString,
  getDeviceGPSPosition,
} from '../utils/geo';
import { getHajatanRecords, saveHajatanRecord } from '../services/storage';
import { exportHajatanExcel } from '../services/excel';
import { appendRecordToGoogleSheet, getAppsScriptWebhookUrl } from '../services/googleSheets';
import { SearchSelect } from './SearchSelect';
import {
  PartyPopper,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Loader2,
  LogOut,
  RefreshCw,
  X,
  FileSpreadsheet,
  Download,
  Building,
  ClipboardList,
  Search,
  Eye,
  Filter,
} from 'lucide-react';

interface HajatanFormProps {
  session: HajatanSession;
  setSession: (session: HajatanSession) => void;
  onShowToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

// Helper for fuzzy PIC name matching
function isSamePic(recordPic?: string, loggedInPic?: string): boolean {
  if (!recordPic || !loggedInPic) return false;
  const p1 = recordPic.trim().toLowerCase();
  const p2 = loggedInPic.trim().toLowerCase();
  if (p1 === p2) return true;
  const clean1 = p1.replace(/[^a-z0-9]/g, '');
  const clean2 = p2.replace(/[^a-z0-9]/g, '');
  if (clean1 && clean2 && (clean1 === clean2 || clean1.includes(clean2) || clean2.includes(clean1))) {
    return true;
  }
  const words1 = p1.split(/\s+/).filter(Boolean);
  const words2 = p2.split(/\s+/).filter(Boolean);
  if (words1.length > 0 && words2.length > 0) {
    if (words1.filter((w) => words2.includes(w)).length >= 2) return true;
    if (words1.length === 1 && words2.includes(words1[0])) return true;
    if (words2.length === 1 && words1.includes(words2[0])) return true;
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

export const HajatanForm: React.FC<HajatanFormProps> = ({
  session,
  setSession,
  onShowToast,
}) => {
  // Login states
  const [selectedPic, setSelectedPic] = useState(session.picName || '');
  const [namaHajatan, setNamaHajatan] = useState(session.namaHajatan || '');
  const [lokasiHajatan, setLokasiHajatan] = useState(session.lokasiHajatan || '');
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

  // Report Modal states
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDate, setReportDate] = useState(() => getTodayDateString());
  const [reportAllDates, setReportAllDates] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportRecords, setReportRecords] = useState<HajatanRecord[]>([]);

  // Hasil Input Modal states (Histori Khusus PIC yang Login)
  const [showHasilModal, setShowHasilModal] = useState(false);
  const [hasilDate, setHasilDate] = useState(() => getTodayDateString());
  const [hasilAllDates, setHasilAllDates] = useState(false);
  const [hasilLoading, setHasilLoading] = useState(false);
  const [hasilRecords, setHasilRecords] = useState<HajatanRecord[]>([]);
  const [hasilSearch, setHasilSearch] = useState('');
  const [selectedDetailRecord, setSelectedDetailRecord] = useState<HajatanRecord | null>(null);

  useEffect(() => {
    if (session.isLoggedIn) {
      handleGetGPS(true);
    }
  }, [session.isLoggedIn]);

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
    if (!namaHajatan.trim()) {
      setLoginError('Nama / Tuan Rumah Hajatan wajib diisi.');
      return;
    }
    if (!lokasiHajatan.trim()) {
      setLoginError('Lokasi / Alamat Hajatan wajib diisi.');
      return;
    }

    setIsLoggingIn(true);
    setTimeout(() => {
      const newSession: HajatanSession = {
        isLoggedIn: true,
        picName: selectedPic,
        namaHajatan: namaHajatan.trim(),
        lokasiHajatan: lokasiHajatan.trim(),
        loginTime: new Date().toISOString(),
      };
      localStorage.setItem('hajatan_pic_logged_in', 'true');
      localStorage.setItem('hajatan_pic_name', selectedPic);
      localStorage.setItem('hajatan_nama_acara', namaHajatan.trim());
      localStorage.setItem('hajatan_lokasi_acara', lokasiHajatan.trim());
      setSession(newSession);
      onShowToast(
        `Login Hajatan berhasil! Selamat bertugas, ${selectedPic}`,
        'success'
      );
      setIsLoggingIn(false);
    }, 300);
  };

  const handleLogout = () => {
    localStorage.removeItem('hajatan_pic_logged_in');
    localStorage.removeItem('hajatan_pic_name');
    localStorage.removeItem('hajatan_nama_acara');
    localStorage.removeItem('hajatan_lokasi_acara');
    setSession({
      isLoggedIn: false,
      picName: '',
      namaHajatan: '',
      lokasiHajatan: '',
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
              `Lokasi GPS & Kecamatan ${loc.kecamatan} (${loc.ouCode}) berhasil dideteksi!`,
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
      onShowToast('Sesi Hajatan tidak aktif. Silakan login terlebih dahulu.', 'error');
      return;
    }

    if (!latitude || !longitude) {
      onShowToast('Koordinat GPS wajib diaktifkan sebelum menyimpan survey.', 'error');
      document.getElementById('hajatan-gps-section')?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    if (!rokokPrimary) {
      onShowToast('Silakan pilih Rokok Utama Konsumen.', 'error');
      return;
    }

    setIsSubmitting(true);
    const today = getTodayDateString();

    const record: Omit<HajatanRecord, 'id'> = {
      nama_pic: session.picName,
      nama_hajatan: session.namaHajatan,
      lokasi_hajatan: session.lokasiHajatan,
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
      const res = await saveHajatanRecord(record);
      const fullRecord = { ...record, id: res.id } as HajatanRecord;

      // Asynchronous instant sync to Google Sheet via Webhook (no Google login required)
      appendRecordToGoogleSheet('hajatan', fullRecord).catch(
        (err) => console.warn('Google Sheet auto-sync notice:', err)
      );

      const hasWebhook = Boolean(getAppsScriptWebhookUrl());
      if (hasWebhook) {
        onShowToast('Survey Hajatan tersimpan & langsung masuk ke Google Sheet!', 'success');
      } else {
        onShowToast('Survey Hajatan berhasil tersimpan!', 'success');
      }
      resetForm();
      if (showHasilModal) {
        loadHasilData(hasilDate, hasilAllDates);
      }
    } catch {
      onShowToast('Gagal menyimpan survey Hajatan.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadReport = async (dateFilter: string, allDates: boolean) => {
    setReportLoading(true);
    try {
      const all = await getHajatanRecords();
      const filtered = all.filter((r) => {
        const pic = (r.nama_pic || (r as any).NAMA_PIC || '').toUpperCase();
        const curPic = session.picName.toUpperCase();
        if (pic !== curPic && !pic.includes(curPic) && !curPic.includes(pic)) {
          return false;
        }
        if (allDates) return true;
        const recDate = r.tanggal || r.date || '';
        return recDate.startsWith(dateFilter);
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
  };

  // Load Hasil Input spesifik untuk PIC yang login
  const loadHasilData = async (dateFilter: string, allDates: boolean) => {
    setHasilLoading(true);
    try {
      const all = await getHajatanRecords();
      const currentPic = session.picName.trim();
      const userFiltered = all.filter((rec) => {
        const pic = (
          rec.nama_pic ||
          (rec as any).NAMA_PIC ||
          (rec as any).pic ||
          (rec as any).PIC ||
          (rec as any).picName ||
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

  const filteredHasilList = hasilRecords.filter((r) => {
    if (!hasilSearch.trim()) return true;
    const q = hasilSearch.toLowerCase();
    const k = (r.nama_konsumen || '').toLowerCase();
    const p = (r.rokok_primary || '').toLowerCase();
    const s = (r.product_sold_brand || '').toLowerCase();
    return k.includes(q) || p.includes(q) || s.includes(q);
  });

  const hasilTotalSurvey = filteredHasilList.length;
  // Penjualan (Pack): kuantiti pack yang terjual
  const hasilTotalPack = filteredHasilList.reduce((acc, cur) => {
    const q = parseInt(
      cur.quantity_pack || (cur as any).quantity_pack_sold || cur.qty_pack || '0',
      10
    );
    return acc + (isNaN(q) ? 0 : q);
  }, 0);
  // Trial Person: jumlah orang yang melakukan pembelian
  const hasilTotalSold = filteredHasilList.filter((r) => {
    const q = parseInt(
      r.quantity_pack || (r as any).quantity_pack_sold || r.qty_pack || '0',
      10
    );
    return !isNaN(q) && q > 0;
  }).length;

  const reportTotalSurvey = reportRecords.length;
  // Trial Person: jumlah orang yang melakukan pembelian
  const reportTotalTrial = reportRecords.filter((r) => {
    const q = parseInt(
      r.quantity_pack || (r as any).quantity_pack_sold || r.qty_pack || '0',
      10
    );
    return !isNaN(q) && q > 0;
  }).length;
  // Penjualan (Pack): kuantiti pack yang terjual
  const reportTotalPack = reportRecords.reduce((acc, cur) => {
    const q = parseInt(
      cur.quantity_pack || (cur as any).quantity_pack_sold || cur.qty_pack || '0',
      10
    );
    return acc + (isNaN(q) ? 0 : q);
  }, 0);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#D4D4D4] py-8 px-4 md:px-8">
      <div className="max-w-4xl mx-auto bg-neutral-900/80 rounded-3xl shadow-2xl overflow-hidden border border-white/10">
        {/* Card Header */}
        <div className="bg-neutral-950 text-white p-6 md:p-8 border-b border-white/10">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6">
            <div>
              <span className="inline-block px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-purple-500/20 text-purple-400 border border-purple-500/30 mb-2">
                Hajatan Platform
              </span>
              <h1 className="text-2xl md:text-3xl font-serif font-bold uppercase tracking-tight text-white">
                HAJATAN SURVEY
              </h1>
              <p className="text-white/60 text-xs md:text-sm mt-1">
                Kuesioner Distribusi & Survey Rokok Acara Hajatan Warga Masyarakat
              </p>
            </div>

            {session.isLoggedIn && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openHasilModal}
                  className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                  title="Lihat histori data yang sudah di-input oleh PIC yang sedang login"
                >
                  <ClipboardList className="w-4 h-4" />
                  <span>Lihat Hasil Input</span>
                </button>

                <button
                  type="button"
                  onClick={openReportModal}
                  className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 text-xs font-bold rounded-xl transition-all flex items-center gap-2 cursor-pointer shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>Report Harian</span>
                </button>
              </div>
            )}
          </div>

          {/* Session Header Bar */}
          {session.isLoggedIn ? (
            <div className="pt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 font-bold font-serif text-lg">
                  {session.picName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-white font-extrabold text-sm md:text-base">
                      {session.picName}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/40">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                      Aktif
                    </span>
                  </div>
                  <p className="text-[11px] text-white/50">
                    Acara: {session.namaHajatan} • Lokasi: {session.lokasiHajatan}
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
                    <label className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                      <PartyPopper className="w-4 h-4" />
                      Pilih PIC & Info Acara *
                    </label>
                    <span className="text-[10px] text-white/40">Wajib login</span>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                      Nama PIC *
                    </label>
                    <select
                      value={selectedPic}
                      onChange={(e) => {
                        setSelectedPic(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-purple-500"
                    >
                      <option value="">-- Pilih Nama PIC --</option>
                      {LIST_PIC_HAJATAN.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                      Nama / Tuan Rumah Hajatan *
                    </label>
                    <input
                      type="text"
                      value={namaHajatan}
                      onChange={(e) => {
                        setNamaHajatan(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      placeholder="Contoh: Pernikahan Bpk. Ahmad"
                      className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-purple-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-gray-300 uppercase mb-1">
                      Lokasi / Alamat Hajatan *
                    </label>
                    <input
                      type="text"
                      value={lokasiHajatan}
                      onChange={(e) => {
                        setLokasiHajatan(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      placeholder="Contoh: Kp. Sukamaju RT 02/05"
                      className="w-full px-3.5 py-2.5 bg-neutral-900 border border-white/15 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-purple-500"
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
                    className="w-full py-3 bg-purple-500 hover:bg-purple-400 text-white font-extrabold text-xs uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memulai Sesi Hajatan...</span>
                      </>
                    ) : (
                      <span>Mulai Sesi Hajatan</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Survey Form */}
        {session.isLoggedIn && (
          <form onSubmit={handleSubmitSurvey} className="p-6 md:p-8 bg-white text-gray-800 space-y-8">
            {/* PART 1: IDENTITAS HAJATAN & PIC */}
            <div className="space-y-4">
              <h3 className="text-xs font-extrabold text-purple-700 uppercase tracking-wider border-b-2 border-purple-200 pb-1 flex items-center gap-1.5">
                <PartyPopper className="w-4 h-4" /> PART 1: IDENTITAS HAJATAN & PIC
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
                    className="w-full px-3.5 py-2.5 border border-purple-300 rounded-xl text-sm font-bold bg-purple-50/80 text-purple-900 cursor-default"
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Tuan Rumah / Acara *
                  </label>
                  <input
                    type="text"
                    value={session.namaHajatan}
                    readOnly
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-bold bg-gray-50 text-gray-800 cursor-default"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-gray-700 uppercase mb-1">
                    Lokasi / Alamat *
                  </label>
                  <input
                    type="text"
                    value={session.lokasiHajatan}
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
              <h3 className="text-xs font-extrabold text-purple-700 uppercase tracking-wider border-b-2 border-purple-200 pb-1">
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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium focus:ring-2 focus:ring-purple-500"
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
                        name="hajatan_gender"
                        value="LAKI-LAKI"
                        checked={jenisKelamin === 'LAKI-LAKI'}
                        onChange={() => setJenisKelamin('LAKI-LAKI')}
                        className="w-4 h-4 text-purple-600 focus:ring-purple-500"
                      />
                      <span>Laki-laki</span>
                    </label>

                    <label className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="hajatan_gender"
                        value="PEREMPUAN"
                        checked={jenisKelamin === 'PEREMPUAN'}
                        onChange={() => setJenisKelamin('PEREMPUAN')}
                        className="w-4 h-4 text-purple-600 focus:ring-purple-500"
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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-purple-500"
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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-purple-500"
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
              <h3 className="text-xs font-extrabold text-purple-700 uppercase tracking-wider border-b-2 border-purple-200 pb-1">
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
                    className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-purple-500"
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
            <div className="space-y-4 p-5 bg-purple-50/70 border border-purple-200 rounded-2xl">
              <h3 className="text-xs font-extrabold text-purple-900 uppercase tracking-wider border-b border-purple-300 pb-1">
                PART 4: PRODUCT SOLD & BUNDLING
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-purple-950 uppercase mb-1">
                    Product Sold Brand *
                  </label>
                  <SearchSelect
                    options={ALL_CIGARETTE_BRANDS}
                    value={productSold}
                    onChange={setProductSold}
                    placeholder="-- Pilih Produk yang Terjual --"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-purple-950 uppercase mb-1">
                    Quantity Pack Sold *
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={quantityPack}
                    onChange={(e) => setQuantityPack(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 border border-purple-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-extrabold text-purple-950 uppercase mb-1">
                    Bundling VAO *
                  </label>
                  <select
                    value={bundlingVao}
                    onChange={(e) => setBundlingVao(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-purple-300 rounded-xl text-sm font-bold bg-white focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="TIDAK">TIDAK</option>
                    <option value="YA">YA</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-extrabold text-purple-950 uppercase mb-1">
                    Selling Point / Lokasi *
                  </label>
                  <input
                    type="text"
                    value={sellingPoint}
                    onChange={(e) => setSellingPoint(e.target.value)}
                    placeholder="Contoh: Meja Prasmanan / Pintu Masuk"
                    required
                    className="w-full px-3.5 py-2.5 border border-purple-300 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-purple-500"
                  />
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

            {/* PART 6: KOORDINAT LOKASI */}
            <div
              id="hajatan-gps-section"
              className="space-y-4 p-5 bg-blue-50/80 border border-blue-200 rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-blue-300 pb-1">
                <h3 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="w-4 h-4 text-blue-600" /> PART 6: KOORDINAT
                  LOKASI HAJATAN
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
                    <span>Mendeteksi koordinat GPS hajatan...</span>
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
                className="w-full sm:flex-1 py-4 px-6 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-sm uppercase tracking-wider rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.98]"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Menyimpan Survey Hajatan...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Simpan Survey Hajatan</span>
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

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-gradient-to-r from-purple-600 to-purple-800 text-white flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-base">📊 Report Harian Hajatan</h3>
                <p className="text-xs text-purple-200">
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

            <div className="p-4 bg-purple-50 border-b border-purple-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-purple-900">Tanggal:</span>
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => {
                    setReportDate(e.target.value);
                    setReportAllDates(false);
                    loadReport(e.target.value, false);
                  }}
                  className="px-3 py-1.5 border border-purple-300 rounded-xl text-xs font-bold bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
                <button
                  type="button"
                  onClick={() => {
                    const today = getTodayDateString();
                    setReportDate(today);
                    setReportAllDates(false);
                    loadReport(today, false);
                  }}
                  className="px-2.5 py-1.5 rounded-xl bg-purple-200 hover:bg-purple-300 text-purple-900 text-xs font-bold transition-colors cursor-pointer"
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
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-100 hover:bg-purple-200 text-purple-900'
                  }`}
                >
                  {reportAllDates ? '✓ Semua Tanggal' : 'Semua Tanggal'}
                </button>
                <button
                  type="button"
                  onClick={() => loadReport(reportDate, reportAllDates)}
                  disabled={reportLoading}
                  className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center gap-1 shadow transition-colors cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${reportLoading ? 'animate-spin' : ''}`}
                  />
                  <span>Refresh</span>
                </button>
              </div>

              <span className="text-xs font-bold text-purple-900 bg-purple-100/80 px-2.5 py-1 rounded-lg border border-purple-300">
                Total: {reportRecords.length} Record
              </span>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-emerald-700">
                    {reportTotalSurvey}
                  </div>
                  <div className="text-[10px] font-extrabold text-emerald-900 uppercase mt-0.5">
                    Consumer Contact
                  </div>
                </div>

                <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-blue-700">
                    {reportTotalTrial}
                  </div>
                  <div className="text-[10px] font-extrabold text-blue-900 uppercase mt-0.5">
                    Trial Person
                  </div>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                  <div className="text-2xl font-black text-amber-700">
                    {reportTotalPack}
                  </div>
                  <div className="text-[10px] font-extrabold text-amber-900 uppercase mt-0.5">
                    Penjualan (Pack)
                  </div>
                </div>
              </div>

              {reportLoading ? (
                <div className="py-8 flex items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                  <span>Memuat report Hajatan...</span>
                </div>
              ) : reportRecords.length === 0 ? (
                <div className="py-8 text-center text-gray-400 text-sm">
                  Belum ada data survey Hajatan untuk filter ini.
                </div>
              ) : (
                <div className="overflow-x-auto border rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-gray-50 font-bold text-gray-700 uppercase border-b">
                      <tr>
                        <th className="p-2.5">No</th>
                        <th className="p-2.5">Konsumen</th>
                        <th className="p-2.5">Rokok Primary</th>
                        <th className="p-2.5">Product Sold</th>
                        <th className="p-2.5 text-center">Qty</th>
                        <th className="p-2.5 text-center">VAO</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y text-gray-800">
                      {reportRecords.map((rec, idx) => (
                        <tr key={rec.id || idx} className="hover:bg-gray-50">
                          <td className="p-2.5 font-bold text-gray-500">{idx + 1}</td>
                          <td className="p-2.5 font-semibold">{rec.nama_konsumen}</td>
                          <td className="p-2.5">{rec.rokok_primary}</td>
                          <td className="p-2.5 font-bold text-purple-700">
                            {rec.product_sold_brand}
                          </td>
                          <td className="p-2.5 text-center font-black">
                            {rec.quantity_pack || '0'}
                          </td>
                          <td className="p-2.5 text-center font-bold text-amber-700">
                            {rec.bundling_vao}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => exportHajatanExcel(reportRecords)}
                disabled={reportRecords.length === 0}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Hasil Ini (.xlsx)</span>
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

      {/* Modal Histori Hasil Input Hajatan */}
      {showHasilModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-4xl bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-emerald-700 to-teal-800 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-emerald-200" />
                  <h3 className="font-extrabold text-base md:text-lg">
                    📋 Histori Hasil Input Survey Hajatan
                  </h3>
                </div>
                <p className="text-xs text-emerald-100 mt-0.5">
                  Petugas PIC: <span className="font-bold underline">{session.picName}</span> • Acara: {session.namaHajatan} ({session.lokasiHajatan})
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
                    placeholder="Cari konsumen / rokok..."
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
              {/* Summary Badges */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-emerald-800">
                    {hasilTotalSurvey}
                  </div>
                  <div className="text-[10px] font-extrabold text-emerald-900 uppercase">
                    Total Survey
                  </div>
                </div>

                <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-blue-800">
                    {hasilTotalSold}
                  </div>
                  <div className="text-[10px] font-extrabold text-blue-900 uppercase">
                    Konsumen Beli
                  </div>
                </div>

                <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl text-center">
                  <div className="text-xl font-black text-purple-800">
                    {hasilTotalPack} pack
                  </div>
                  <div className="text-[10px] font-extrabold text-purple-900 uppercase">
                    Total Terjual
                  </div>
                </div>
              </div>

              {/* Data Table / Empty State */}
              {hasilLoading ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-sm text-gray-500">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-600" />
                  <span>Memuat histori data input Hajatan PIC {session.picName}...</span>
                </div>
              ) : filteredHasilList.length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-sm flex flex-col items-center gap-3">
                  <span className="text-3xl">📭</span>
                  <p className="font-semibold text-gray-700">
                    Belum ada data input untuk PIC <span className="font-bold text-emerald-700">{session.picName}</span> pada{' '}
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
                        <th className="p-3">Konsumen</th>
                        <th className="p-3">Rokok Primary</th>
                        <th className="p-3">Produk Terjual</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-center">VAO</th>
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
                        const isSold =
                          parseInt(rec.quantity_pack || '0', 10) > 0 ||
                          (rec.product_sold_brand &&
                            rec.product_sold_brand !== 'TIDAK ADA' &&
                            rec.product_sold_brand !== '-');

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
                                {rec.nama_konsumen || '-'}
                              </div>
                              <div className="text-[10px] text-gray-500">
                                {rec.jenis_kelamin || '-'} • {rec.kelompok_usia || '-'}
                              </div>
                            </td>
                            <td className="p-3 font-medium text-gray-900">
                              {rec.rokok_primary || '-'}
                            </td>
                            <td className="p-3">
                              {isSold ? (
                                <span className="font-bold text-emerald-700">
                                  {rec.product_sold_brand}
                                </span>
                              ) : (
                                <span className="text-gray-400 italic">
                                  Tidak Beli
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-center font-black">
                              {rec.quantity_pack || '0'}
                            </td>
                            <td className="p-3 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 rounded-full font-bold text-[10px] ${
                                  rec.bundling_vao === 'YA'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-gray-100 text-gray-500'
                                }`}
                              >
                                {rec.bundling_vao || 'TIDAK'}
                              </span>
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
            <div className="p-4 border-t bg-gray-50 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => exportHajatanExcel(filteredHasilList)}
                disabled={filteredHasilList.length === 0}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Data Hajatan ({filteredHasilList.length}) ke Excel</span>
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

      {/* Modal Detail Survey Hajatan */}
      {selectedDetailRecord && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white text-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 bg-gray-900 text-white flex items-center justify-between">
              <div>
                <h4 className="font-extrabold text-sm">
                  Detail Survey: {selectedDetailRecord.nama_konsumen}
                </h4>
                <p className="text-[11px] text-gray-400">
                  PIC: {selectedDetailRecord.nama_pic} • Acara: {selectedDetailRecord.nama_hajatan}
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
                    {selectedDetailRecord.jenis_kelamin} • {selectedDetailRecord.kelompok_usia}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Pekerjaan</span>
                  <p className="font-medium text-gray-800">{selectedDetailRecord.pekerjaan || '-'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-gray-500 uppercase">Lama Konsumsi</span>
                  <p className="font-medium text-gray-800">{selectedDetailRecord.lama_konsumsi || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 p-3 bg-purple-50/60 rounded-xl border border-purple-200">
                <div>
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Rokok Primary</span>
                  <p className="font-bold text-purple-950">{selectedDetailRecord.rokok_primary}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Produk Terjual</span>
                  <p className="font-bold text-purple-950">
                    {selectedDetailRecord.product_sold_brand} ({selectedDetailRecord.quantity_pack || 0} pack)
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Bundling VAO</span>
                  <p className="font-bold text-purple-950">{selectedDetailRecord.bundling_vao || 'TIDAK'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-purple-700 uppercase">Selling Point</span>
                  <p className="font-medium text-purple-950">{selectedDetailRecord.selling_point || '-'}</p>
                </div>
              </div>

              {selectedDetailRecord.gg_selingan === 'YA' && (
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <span className="text-[10px] font-bold text-amber-800 uppercase block">Rokok GG Selingan</span>
                  <p className="text-gray-800 text-xs mt-1">
                    Brand: <span className="font-bold">{selectedDetailRecord.gg_brand_apa || '-'}</span> <br />
                    Moment GG: <span className="font-medium">{selectedDetailRecord.moment_gg || '-'}</span>
                  </p>
                </div>
              )}

              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Lokasi GPS & Acara</span>
                <p className="text-gray-800 font-mono text-[11px]">
                  {selectedDetailRecord.latitude}, {selectedDetailRecord.longitude} (Kec. {selectedDetailRecord.kecamatan || '-'} • OU: {selectedDetailRecord.ou || selectedDetailRecord.ou_code || '-'})
                </p>
                <p className="text-gray-600 text-[11px] mt-1">
                  Acara: {selectedDetailRecord.nama_hajatan} • Lokasi: {selectedDetailRecord.lokasi_hajatan}
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
