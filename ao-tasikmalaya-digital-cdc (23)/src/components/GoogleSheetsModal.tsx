import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  X,
  ExternalLink,
  RefreshCw,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Sparkles,
  Link2,
  Zap,
  Copy,
  Check,
  Code2,
  Send,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  GoogleSheetsConfig,
  getSavedGoogleSheetConfig,
  createNewDatabaseSpreadsheet,
  syncAllDataToSpreadsheet,
  saveGoogleSheetConfig,
  getAppsScriptWebhookUrl,
  saveAppsScriptWebhookUrl,
  testAppsScriptWebhook,
  testAppsScriptCrud,
  GOOGLE_APPS_SCRIPT_CODE,
  TARGET_SPREADSHEET_ID,
  TARGET_SPREADSHEET_URL,
} from '../services/googleSheets';
import {
  googleSignIn,
  logoutGoogle,
  getCurrentUser,
  initAuth,
} from '../services/googleAuth';
import { User } from 'firebase/auth';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'webhook' | 'oauth'>('webhook');
  const [currentUser, setCurrentUser] = useState<User | null>(() => getCurrentUser());
  const [config, setConfig] = useState<GoogleSheetsConfig | null>(() =>
    getSavedGoogleSheetConfig()
  );
  const [webhookUrlInput, setWebhookUrlInput] = useState<string>(() =>
    getAppsScriptWebhookUrl()
  );
  const [isCopiedCode, setIsCopiedCode] = useState(false);
  const [showCodePreview, setShowCodePreview] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [testingCrudOp, setTestingCrudOp] = useState<string | null>(null);
  const [crudTestResult, setCrudTestResult] = useState<{
    op: string;
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [showCrudDoc, setShowCrudDoc] = useState(false);

  const [customTitle, setCustomTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string | null>(null);
  const [showCreateNewInput, setShowCreateNewInput] = useState(false);

  useEffect(() => {
    // Listen to Firebase Auth state
    const unsubscribe = initAuth(
      (user) => {
        setCurrentUser(user);
      },
      () => {
        setCurrentUser(getCurrentUser());
      }
    );

    // Listen to config updates
    const handleConfigUpdate = (e: any) => {
      setConfig(e.detail);
      if (e.detail?.appsScriptWebhookUrl) {
        setWebhookUrlInput(e.detail.appsScriptWebhookUrl);
      }
    };

    const handleWebhookUpdated = (e: any) => {
      if (e.detail?.url !== undefined) {
        setWebhookUrlInput(e.detail.url);
      }
    };

    window.addEventListener('google_sheets_config_updated', handleConfigUpdate);
    window.addEventListener('apps_script_webhook_updated', handleWebhookUpdated);

    return () => {
      if (unsubscribe) unsubscribe();
      window.removeEventListener('google_sheets_config_updated', handleConfigUpdate);
      window.removeEventListener('apps_script_webhook_updated', handleWebhookUpdated);
    };
  }, []);

  if (!isOpen) return null;

  const currentWebhookUrl = getAppsScriptWebhookUrl();

  const handleSaveWebhookUrl = () => {
    const clean = webhookUrlInput.trim();
    if (clean && !clean.startsWith('https://script.google.com/')) {
      onShowToast(
        'URL Webhook harus berawalan: https://script.google.com/macros/s/.../exec',
        'error'
      );
      return;
    }

    saveAppsScriptWebhookUrl(clean);
    setConfig(getSavedGoogleSheetConfig());
    if (clean) {
      onShowToast(
        'URL Google Apps Script Webhook berhasil disimpan! Surveyor kini bisa submit tanpa login.',
        'success'
      );
    } else {
      onShowToast('URL Webhook telah dikosongkan.', 'info');
    }
  };

  const handleTestWebhook = async () => {
    const urlToTest = webhookUrlInput.trim() || currentWebhookUrl;
    if (!urlToTest) {
      onShowToast('Masukkan URL Webhook Google Apps Script terlebih dahulu.', 'error');
      return;
    }

    setIsTestingWebhook(true);
    try {
      const res = await testAppsScriptWebhook(urlToTest);
      // Auto-save if test succeeds and not yet saved
      saveAppsScriptWebhookUrl(urlToTest);
      setConfig(getSavedGoogleSheetConfig());
      onShowToast(res.message, 'success');
    } catch (err: any) {
      onShowToast(err.message || 'Uji coba Webhook gagal.', 'error');
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const handleRunCrudTest = async (op: 'ping' | 'create' | 'read' | 'update' | 'delete') => {
    const urlToTest = webhookUrlInput.trim() || currentWebhookUrl;
    if (!urlToTest) {
      onShowToast('Masukkan URL Webhook Google Apps Script terlebih dahulu.', 'error');
      return;
    }

    setTestingCrudOp(op);
    setCrudTestResult(null);
    try {
      const res = await testAppsScriptCrud(urlToTest, op);
      setCrudTestResult({
        op,
        success: res.success,
        message: res.message,
        details: res.details,
      });
      onShowToast(res.message, res.success ? 'success' : 'error');
    } catch (err: any) {
      const errMsg = err.message || `Gagal menjalankan operasi ${op.toUpperCase()}`;
      setCrudTestResult({
        op,
        success: false,
        message: errMsg,
      });
      onShowToast(errMsg, 'error');
    } finally {
      setTestingCrudOp(null);
    }
  };

  const handleCopyScriptCode = () => {
    navigator.clipboard
      .writeText(GOOGLE_APPS_SCRIPT_CODE)
      .then(() => {
        setIsCopiedCode(true);
        onShowToast('Kode Google Apps Script berhasil disalin ke clipboard!', 'success');
        setTimeout(() => setIsCopiedCode(false), 3500);
      })
      .catch(() => {
        onShowToast('Gagal menyalin kode. Silakan salin manual dari kotak pratinjau.', 'error');
      });
  };

  const handleClearWebhook = () => {
    if (
      window.confirm(
        'Apakah Anda yakin ingin menghapus konfigurasi Google Apps Script Webhook?'
      )
    ) {
      saveAppsScriptWebhookUrl('');
      setWebhookUrlInput('');
      setConfig(getSavedGoogleSheetConfig());
      onShowToast('Webhook dinonaktifkan.', 'info');
    }
  };

  const handleSignIn = async () => {
    setIsProcessing(true);
    setProcessStatus('Menghubungkan akun Google...');
    try {
      const res = await googleSignIn();
      if (res?.user) {
        setCurrentUser(res.user);
        onShowToast(
          `Berhasil terhubung dengan Google: ${res.user.displayName || res.user.email}`,
          'success'
        );
      }
    } catch (err: any) {
      console.error(err);
      onShowToast(
        err.message || 'Gagal login Google. Silakan coba kembali.',
        'error'
      );
    } finally {
      setIsProcessing(false);
      setProcessStatus(null);
    }
  };

  const handleSignOut = async () => {
    await logoutGoogle();
    setCurrentUser(null);
    onShowToast('Akun Google berhasil dikeluarkan.', 'info');
  };

  const handleCreateNewSheet = async () => {
    setIsProcessing(true);
    setProcessStatus('Sedang membuat Google Sheet baru & menginisiasi 4 sheet survey...');
    try {
      const newConfig = await createNewDatabaseSpreadsheet(
        customTitle.trim() || undefined
      );
      setConfig(newConfig);
      setShowCreateNewInput(false);
      setCustomTitle('');
      onShowToast(
        `Berhasil membuat Google Sheet baru & menyinkronkan database!`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      onShowToast(
        `Gagal membuat Google Sheet: ${err.message || 'Coba lagi'}`,
        'error'
      );
    } finally {
      setIsProcessing(false);
      setProcessStatus(null);
    }
  };

  const handleSyncNow = async () => {
    if (!config?.spreadsheetId) return;
    setIsProcessing(true);
    setProcessStatus('Menyinkronkan seluruh database ke Google Sheet...');
    try {
      const result = await syncAllDataToSpreadsheet(config.spreadsheetId);
      setConfig(getSavedGoogleSheetConfig());
      onShowToast(
        `Database berhasil disinkronkan ke Google Sheet (${result.totalSpb} SPB, ${result.totalEvent} Event, ${result.totalHajatan} Hajatan)!`,
        'success'
      );
    } catch (err: any) {
      console.error(err);
      onShowToast(
        `Gagal sinkronisasi: ${err.message || 'Silakan hubungkan akun kembali'}`,
        'error'
      );
    } finally {
      setIsProcessing(false);
      setProcessStatus(null);
    }
  };

  const handleToggleAutoSync = () => {
    if (!config) return;
    const updated = {
      ...config,
      autoSyncEnabled: !config.autoSyncEnabled,
    };
    saveGoogleSheetConfig(updated);
    setConfig(updated);
    onShowToast(
      `Auto-sync ke Google Sheet ${updated.autoSyncEnabled ? 'Diaktifkan' : 'Dinonaktifkan'}.`,
      'info'
    );
  };

  const formatLastSync = (iso?: string) => {
    if (!iso) return 'Belum pernah';
    try {
      const d = new Date(iso);
      return d.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-[#121212] border border-white/10 text-[#E5E5E5] rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-5 md:p-6 bg-gradient-to-r from-emerald-950/90 via-neutral-900 to-neutral-900 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shadow-inner">
              <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-bold text-lg md:text-xl text-white">
                  Koneksi Database Google Sheets
                </h3>
                <span className="text-[10px] font-sans font-extrabold uppercase px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <Zap className="w-3 h-3 text-emerald-400 fill-emerald-400" />
                  Real-time
                </span>
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                Target Spreadsheet:{' '}
                <code className="text-emerald-300 font-mono font-bold select-all">
                  {TARGET_SPREADSHEET_ID}
                </code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-white/10 text-white/60 hover:text-white rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/10 bg-neutral-950/60 px-5 pt-3 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('webhook')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'webhook'
                ? 'bg-neutral-900 text-emerald-400 border-white/10 border-b-transparent shadow'
                : 'text-white/50 hover:text-white border-transparent hover:bg-white/5'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>⚡ Webhook Apps Script (Rekomendasi - Tanpa Login)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('oauth')}
            className={`px-4 py-2.5 text-xs font-bold rounded-t-xl transition-all cursor-pointer flex items-center gap-2 border-t border-x ${
              activeTab === 'oauth'
                ? 'bg-neutral-900 text-emerald-400 border-white/10 border-b-transparent shadow'
                : 'text-white/50 hover:text-white border-transparent hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>🔐 Google OAuth Direct API (Perlu Login)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 md:p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* TAB 1: WEBHOOK APPS SCRIPT (TANPA LOGIN) */}
          {activeTab === 'webhook' && (
            <div className="space-y-6">
              {/* Primary Banner */}
              <div className="p-4 md:p-5 rounded-2xl bg-gradient-to-r from-emerald-950/50 via-neutral-900/90 to-neutral-900/90 border border-emerald-500/40 space-y-2.5 shadow-lg">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <Zap className="w-3.5 h-3.5 fill-emerald-400" />
                    Auto-Sync Detik Itu Juga Tanpa Login
                  </span>

                  {currentWebhookUrl ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/50">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                      Webhook Aktif
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Belum Terhubung
                    </span>
                  )}
                </div>

                <h4 className="font-serif font-bold text-base md:text-lg text-white">
                  Koneksi Otomatis Google Apps Script Webhook
                </h4>
                <p className="text-xs text-white/70 leading-relaxed">
                  Setiap surveyor menekan tombol <strong className="text-emerald-300 font-semibold">"Simpan Survey"</strong> di HP mereka, datanya <strong className="text-white">langsung detik itu juga masuk ke baris baru Google Sheet</strong> tanpa perlu login akun Google sama sekali.
                </p>

                {currentWebhookUrl && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-2 text-xs border-t border-white/10">
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-white/40 block text-[10px] uppercase font-semibold">
                        Total Baris Terkirim Webhook:
                      </span>
                      <span className="text-emerald-400 font-bold text-sm">
                        {config?.webhookSyncCount || 0} Survey
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5">
                      <span className="text-white/40 block text-[10px] uppercase font-semibold">
                        Sinkronisasi Terakhir:
                      </span>
                      <span className="text-white font-mono text-xs">
                        {formatLastSync(config?.lastWebhookSyncAt)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 col-span-2 sm:col-span-1 flex items-center justify-center">
                      <a
                        href={TARGET_SPREADSHEET_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors"
                      >
                        <span>Buka Spreadsheet</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Webhook URL Input & Actions */}
              <div className="p-4 md:p-5 rounded-2xl bg-neutral-900/90 border border-white/10 space-y-3.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Link2 className="w-4 h-4 text-emerald-400" />
                    <span>URL Web App Webhook Google Apps Script</span>
                  </label>
                  {currentWebhookUrl && (
                    <button
                      type="button"
                      onClick={handleClearWebhook}
                      className="text-[11px] text-red-400/80 hover:text-red-400 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Hapus konfigurasi Webhook"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Hapus URL</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="url"
                    value={webhookUrlInput}
                    onChange={(e) => setWebhookUrlInput(e.target.value)}
                    placeholder="https://script.google.com/macros/s/AKfycbx.../exec"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-neutral-950 border border-white/15 text-xs text-emerald-300 placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono select-all"
                  />
                  <button
                    type="button"
                    onClick={handleSaveWebhookUrl}
                    className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow cursor-pointer whitespace-nowrap"
                  >
                    Simpan URL
                  </button>
                  <button
                    type="button"
                    onClick={handleTestWebhook}
                    disabled={isTestingWebhook}
                    className="px-4 py-2.5 bg-white/10 hover:bg-white/20 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 whitespace-nowrap border border-white/10"
                  >
                    {isTestingWebhook ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    ) : (
                      <Send className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>Uji Coba</span>
                  </button>
                </div>
                <p className="text-[11px] text-white/50">
                  Pastikan URL berakhiran <code className="text-emerald-400">/exec</code> dari hasil penerapan Web App di Google Sheets.
                </p>
              </div>

              {/* CRUD Capability & Interactive Testing Console */}
              <div className="p-5 rounded-2xl bg-neutral-900/60 border border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                    <h5 className="font-bold text-white text-sm">
                      Konsol Uji Interaktif CRUD (Create, Read, Update, Delete)
                    </h5>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      C: Create
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 text-cyan-300 text-[10px] font-bold">
                      R: Read
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                      U: Update
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-red-500/20 text-red-300 text-[10px] font-bold">
                      D: Delete
                    </span>
                  </div>
                </div>

                <p className="text-xs text-white/70 leading-relaxed">
                  Skrip <strong className="text-white">Code.gs</strong> terbaru mendukung operasi database penuh (CRUD). Uji setiap operasi langsung ke Google Sheet Anda di bawah ini:
                </p>

                {/* Quick CRUD Action Buttons */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRunCrudTest('ping')}
                    disabled={!!testingCrudOp}
                    className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-white font-medium flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {testingCrudOp === 'ping' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : (
                      <Zap className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="font-bold">1. Ping / Cek</span>
                    <span className="text-[10px] text-white/50">Cek Koneksi</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunCrudTest('create')}
                    disabled={!!testingCrudOp}
                    className="p-2.5 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/50 border border-emerald-500/30 text-xs text-emerald-200 font-medium flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {testingCrudOp === 'create' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    ) : (
                      <PlusCircle className="w-4 h-4 text-emerald-400" />
                    )}
                    <span className="font-bold">2. Create</span>
                    <span className="text-[10px] text-emerald-400/70">Tambah Baris</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunCrudTest('read')}
                    disabled={!!testingCrudOp}
                    className="p-2.5 rounded-xl bg-cyan-950/40 hover:bg-cyan-900/50 border border-cyan-500/30 text-xs text-cyan-200 font-medium flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {testingCrudOp === 'read' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-cyan-400" />
                    ) : (
                      <FileSpreadsheet className="w-4 h-4 text-cyan-400" />
                    )}
                    <span className="font-bold">3. Read</span>
                    <span className="text-[10px] text-cyan-400/70">Tarik Data</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunCrudTest('update')}
                    disabled={!!testingCrudOp}
                    className="p-2.5 rounded-xl bg-amber-950/40 hover:bg-amber-900/50 border border-amber-500/30 text-xs text-amber-200 font-medium flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {testingCrudOp === 'update' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                    ) : (
                      <RefreshCw className="w-4 h-4 text-amber-400" />
                    )}
                    <span className="font-bold">4. Update</span>
                    <span className="text-[10px] text-amber-400/70">Edit Baris</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleRunCrudTest('delete')}
                    disabled={!!testingCrudOp}
                    className="p-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-xs text-red-200 font-medium flex flex-col items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {testingCrudOp === 'delete' ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-red-400" />
                    ) : (
                      <Trash2 className="w-4 h-4 text-red-400" />
                    )}
                    <span className="font-bold">5. Delete</span>
                    <span className="text-[10px] text-red-400/70">Hapus Baris</span>
                  </button>
                </div>

                {/* Test Result Display */}
                {crudTestResult && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs ${
                      crudTestResult.success
                        ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                        : 'bg-red-950/30 border-red-500/40 text-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5 font-bold">
                      {crudTestResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      )}
                      <span>
                        Hasil Pengujian Operasi {crudTestResult.op.toUpperCase()}:
                      </span>
                    </div>
                    <p className="leading-relaxed pl-6">{crudTestResult.message}</p>
                    {crudTestResult.details && (
                      <pre className="mt-2 ml-6 p-2 rounded-lg bg-black/60 text-[10px] font-mono overflow-x-auto text-white/70">
                        {JSON.stringify(crudTestResult.details, null, 2)}
                      </pre>
                    )}
                  </div>
                )}

                {/* Toggle Documentation */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowCrudDoc(!showCrudDoc)}
                    className="text-xs text-white/50 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Code2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>
                      {showCrudDoc
                        ? 'Sembunyikan Dokumentasi Parameter CRUD'
                        : 'Pelajari Format Request JSON untuk CRUD'}
                    </span>
                    {showCrudDoc ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showCrudDoc && (
                    <div className="mt-3 p-4 rounded-xl bg-black/80 border border-white/10 text-xs text-white/80 space-y-3 font-mono">
                      <div>
                        <div className="text-emerald-400 font-bold mb-1">
                          1. CREATE (POST JSON)
                        </div>
                        <div className="bg-neutral-900 p-2.5 rounded text-[11px] text-white/70 overflow-x-auto">
                          {`{
  "action": "create",
  "targetSheet": "TRACKING SPB",
  "rowObject": { "Nama SPB": "SITI", "Kecamatan": "CIPATUJAH", "Total Pack": 15 },
  // atau "items": [{ ... }, { ... }] untuk bulk insert
}`}
                        </div>
                      </div>

                      <div>
                        <div className="text-cyan-400 font-bold mb-1">
                          2. READ (GET atau POST JSON)
                        </div>
                        <div className="bg-neutral-900 p-2.5 rounded text-[11px] text-white/70 overflow-x-auto">
                          {`// Via URL GET:
https://script.google.com/.../exec?action=read&targetSheet=TRACKING SPB&limit=50

// Atau Via POST JSON:
{ "action": "read", "targetSheet": "TRACKING SPB", "limit": 100 }`}
                        </div>
                      </div>

                      <div>
                        <div className="text-amber-400 font-bold mb-1">
                          3. UPDATE (POST JSON)
                        </div>
                        <div className="bg-neutral-900 p-2.5 rounded text-[11px] text-white/70 overflow-x-auto">
                          {`{
  "action": "update",
  "targetSheet": "TRACKING SPB",
  "id": "SPB-12345678", // cari via kolom ID
  // atau "matchKey": "Nama SPB", "matchValue": "SITI",
  "data": { "Total Pack": 20, "Status": "Verified" }
}`}
                        </div>
                      </div>

                      <div>
                        <div className="text-red-400 font-bold mb-1">
                          4. DELETE (POST JSON)
                        </div>
                        <div className="bg-neutral-900 p-2.5 rounded text-[11px] text-white/70 overflow-x-auto">
                          {`{
  "action": "delete",
  "targetSheet": "TRACKING SPB",
  "id": "SPB-12345678" // atau "rowIndex": 5
}`}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Step-by-Step Practical Guide */}
              <div className="p-5 rounded-2xl bg-neutral-900/60 border border-white/10 space-y-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div className="flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-emerald-400" />
                    <h5 className="font-bold text-white text-sm">
                      Petunjuk Pemasangan 1 Menit (Google Apps Script)
                    </h5>
                  </div>
                  <button
                    type="button"
                    onClick={handleCopyScriptCode}
                    className="px-3.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {isCopiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Kode Tersalin!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Salin Kode Apps Script</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">
                        1
                      </span>
                      <span>Buka Google Sheet Target</span>
                    </div>
                    <p className="text-white/60 leading-relaxed">
                      Buka spreadsheet target ID{' '}
                      <a
                        href={TARGET_SPREADSHEET_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-300 underline font-mono"
                      >
                        Buka Spreadsheet ↗
                      </a>
                      .
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">
                        2
                      </span>
                      <span>Buka Menu Apps Script</span>
                    </div>
                    <p className="text-white/60 leading-relaxed">
                      Di menu atas Google Sheets, klik menu{' '}
                      <strong className="text-white">Ekstensi</strong> (Extensions) ➔{' '}
                      <strong className="text-white">Apps Script</strong>.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">
                        3
                      </span>
                      <span>Paste Seluruh Kode Script</span>
                    </div>
                    <p className="text-white/60 leading-relaxed">
                      Hapus teks bawaan, lalu <strong className="text-white">Paste</strong> kode yang telah disalin dengan menekan tombol hijau di atas.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                    <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px]">
                        4
                      </span>
                      <span>Deploy sebagai Web App</span>
                    </div>
                    <p className="text-white/60 leading-relaxed">
                      Klik <strong className="text-white">Deploy</strong> (kanan atas) ➔{' '}
                      <strong className="text-white">New deployment</strong> ➔ Jenis:{' '}
                      <strong className="text-white">Web app</strong> ➔ Who has access:{' '}
                      <strong className="text-emerald-300 font-bold">Anyone (Siapa saja)</strong> ➔ Klik Deploy & salin URL ke kotak di atas!
                    </p>
                  </div>
                </div>

                {/* Collapsible Script Preview */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCodePreview(!showCodePreview)}
                    className="text-xs text-white/50 hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{showCodePreview ? 'Sembunyikan Pratinjau Kode' : 'Lihat Kode Script Lengkap'}</span>
                    {showCodePreview ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {showCodePreview && (
                    <div className="mt-2.5 p-3 rounded-xl bg-black/80 border border-white/10 text-emerald-300 font-mono text-[11px] max-h-60 overflow-y-auto select-all leading-relaxed">
                      <pre>{GOOGLE_APPS_SCRIPT_CODE}</pre>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GOOGLE OAUTH DIRECT API (LOGIN POPUP) */}
          {activeTab === 'oauth' && (
            <div className="space-y-6">
              {/* Status Akun Google */}
              <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {currentUser?.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.displayName || 'Google User'}
                      className="w-10 h-10 rounded-full border border-emerald-400/40"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 border border-white/20 flex items-center justify-center font-bold text-white">
                      {currentUser?.displayName ? currentUser.displayName[0] : 'G'}
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-white/50 uppercase font-semibold">
                      Akun Google Terotorisasi
                    </div>
                    <div className="font-bold text-white text-sm">
                      {currentUser?.displayName || currentUser?.email || 'Belum Terhubung'}
                    </div>
                    {currentUser?.email && currentUser.displayName && (
                      <div className="text-xs text-white/60">{currentUser.email}</div>
                    )}
                  </div>
                </div>

                <div>
                  {currentUser ? (
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="px-3.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Ganti Akun</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSignIn}
                      disabled={isProcessing}
                      className="px-4 py-2 bg-white hover:bg-gray-100 text-black font-bold text-xs rounded-xl shadow transition-all flex items-center gap-2 cursor-pointer"
                    >
                      {/* Google SVG Icon */}
                      <svg className="w-4 h-4" viewBox="0 0 48 48">
                        <path
                          fill="#EA4335"
                          d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                        />
                        <path
                          fill="#4285F4"
                          d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                        />
                        <path
                          fill="#34A853"
                          d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                        />
                      </svg>
                      <span>Masuk dengan Google</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Connected Google Sheet Details */}
              <div className="space-y-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-neutral-900 border border-emerald-500/30 space-y-4 shadow-xl">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#34d399]" />
                      <span className="font-bold text-white text-base">
                        {config?.title || 'AO Tasikmalaya Digital CDC - Database Survey'}
                      </span>
                    </div>
                    <a
                      href={TARGET_SPREADSHEET_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm w-fit"
                    >
                      <span>Buka Google Sheet</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="text-white/50 text-[10px] font-semibold uppercase">
                        Sheet KPI
                      </div>
                      <div className="text-amber-400 font-bold mt-0.5">Summary KPI</div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="text-white/50 text-[10px] font-semibold uppercase">
                        Sheet SPB
                      </div>
                      <div className="text-emerald-400 font-bold mt-0.5">
                        {config?.totalSpbRows ?? 0} Record
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="text-white/50 text-[10px] font-semibold uppercase">
                        Sheet Event
                      </div>
                      <div className="text-blue-400 font-bold mt-0.5">
                        {config?.totalEventRows ?? 0} Record
                      </div>
                    </div>
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/5">
                      <div className="text-white/50 text-[10px] font-semibold uppercase">
                        Sheet Hajatan
                      </div>
                      <div className="text-purple-400 font-bold mt-0.5">
                        {config?.totalHajatanRows ?? 0} Record
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-white/60 pt-1 gap-2">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>
                        Terakhir Disinkronkan:{' '}
                        <strong className="text-white font-mono">
                          {formatLastSync(config?.lastSyncedAt)}
                        </strong>
                      </span>
                    </div>

                    <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={config?.autoSyncEnabled ?? true}
                        onChange={handleToggleAutoSync}
                        className="rounded bg-neutral-800 border-neutral-600 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-semibold text-white/80">
                        Auto-sync saat input kuesioner baru
                      </span>
                    </label>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-white/10">
                    <button
                      type="button"
                      onClick={handleSyncNow}
                      disabled={isProcessing}
                      className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 disabled:opacity-50 text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-2 shadow transition-all cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin' : ''}`}
                      />
                      <span>Sinkronkan Semua Sekarang</span>
                    </button>

                    <a
                      href={TARGET_SPREADSHEET_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Buka Dokumen</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Form Buat Sheet Baru bila dibutuhkan */}
              {showCreateNewInput && (
                <div className="p-4 rounded-2xl bg-neutral-900 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                      <PlusCircle className="w-4 h-4 text-emerald-400" />
                      Buat File Google Sheet Baru
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowCreateNewInput(false)}
                      className="text-white/40 hover:text-white text-xs cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Judul spreadsheet baru (opsional)"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-neutral-800 border border-white/10 text-xs text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={handleCreateNewSheet}
                    disabled={isProcessing}
                    className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
                  >
                    {isProcessing ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <PlusCircle className="w-3.5 h-3.5" />
                    )}
                    <span>Buat Spreadsheet Baru & Hubungkan</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Status Message */}
          {processStatus && (
            <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 animate-pulse">
              <RefreshCw className="w-4 h-4 animate-spin text-emerald-400 shrink-0" />
              <span>{processStatus}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-neutral-900 border-t border-white/10 flex items-center justify-between text-xs">
          <div className="text-white/40 text-[11px] flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Target: {TARGET_SPREADSHEET_ID}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
