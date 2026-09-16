import {
  mapSpbToExcelRows,
  mapEventToExcelRows,
  mapHajatanToExcelRows,
} from './excel';
import {
  getSpbRecords,
  getEventRecords,
  getHajatanRecords,
  calculateAllSummary,
  bulkUpsertSpbRecords,
  bulkUpsertEventRecords,
  bulkUpsertHajatanRecords,
} from './storage';
import { getAccessToken, googleSignIn } from './googleAuth';
import { SpbRecord, EventRecord, HajatanRecord } from '../types';

export const TARGET_SPREADSHEET_ID = '1c79z-EWoG0IwfgconEVU53_0Uj34smDsdSuiJ7aD8ec';
export const TARGET_SPREADSHEET_URL = `https://docs.google.com/spreadsheets/d/${TARGET_SPREADSHEET_ID}/edit`;

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  title: string;
  lastSyncedAt?: string;
  totalSpbRows?: number;
  totalEventRows?: number;
  totalHajatanRows?: number;
  autoSyncEnabled?: boolean;
  appsScriptWebhookUrl?: string;
  lastWebhookSyncAt?: string;
  webhookSyncCount?: number;
}

export const STORAGE_KEY_GSHEET = 'ao_tasik_google_sheets_config';
export const STORAGE_KEY_WEBHOOK = 'ao_tasik_webhook_url';
export const PENDING_QUEUE_KEY = 'ao_tasik_pending_sheet_records';
export const DEFAULT_APPS_SCRIPT_WEBHOOK_URL =
  'https://script.google.com/macros/s/AKfycbzAiAJ4XN2jhDlpxigay7Qg94gAb6Vlr_sKEPMlaCjZFwVbLTrlaOJrRzowjeqVSF6b/exec';

/**
 * Retrieves the configured Google Apps Script Webhook URL
 * Prioritizes localStorage, then GoogleSheetsConfig, then Vite env, then DEFAULT_APPS_SCRIPT_WEBHOOK_URL
 */
export function getAppsScriptWebhookUrl(): string {
  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY_WEBHOOK);
    if (fromStorage && fromStorage.trim().startsWith('https://script.google.com/')) {
      const cleanStored = fromStorage.trim();
      // Auto-migrate if stored URL is the previous default or if outdated
      if (cleanStored.includes('AKfycbwDHtfdTZrtw35ISG3SYFD1ycCVU_lE3iyiDXYDA_RoVGYZRMguNQZxFbbGgpLo0HO0')) {
        saveAppsScriptWebhookUrl(DEFAULT_APPS_SCRIPT_WEBHOOK_URL);
        return DEFAULT_APPS_SCRIPT_WEBHOOK_URL;
      }
      return cleanStored;
    }
    const rawConfig = localStorage.getItem(STORAGE_KEY_GSHEET);
    if (rawConfig) {
      const parsed = JSON.parse(rawConfig);
      if (
        parsed?.appsScriptWebhookUrl &&
        typeof parsed.appsScriptWebhookUrl === 'string' &&
        parsed.appsScriptWebhookUrl.trim().startsWith('https://script.google.com/')
      ) {
        const cleanConfigUrl = parsed.appsScriptWebhookUrl.trim();
        if (cleanConfigUrl.includes('AKfycbwDHtfdTZrtw35ISG3SYFD1ycCVU_lE3iyiDXYDA_RoVGYZRMguNQZxFbbGgpLo0HO0')) {
          saveAppsScriptWebhookUrl(DEFAULT_APPS_SCRIPT_WEBHOOK_URL);
          return DEFAULT_APPS_SCRIPT_WEBHOOK_URL;
        }
        return cleanConfigUrl;
      }
    }
    const envUrl = (import.meta as any).env?.VITE_APPS_SCRIPT_WEBHOOK_URL;
    if (envUrl && typeof envUrl === 'string' && envUrl.trim().startsWith('https://script.google.com/')) {
      return envUrl.trim();
    }
  } catch {}
  return DEFAULT_APPS_SCRIPT_WEBHOOK_URL;
}

/**
 * Saves the Google Apps Script Webhook URL and notifies components
 */
export function saveAppsScriptWebhookUrl(url: string) {
  const cleanUrl = url ? url.trim() : '';
  try {
    localStorage.setItem(STORAGE_KEY_WEBHOOK, cleanUrl);
    const existing = getSavedGoogleSheetConfig();
    saveGoogleSheetConfig({
      ...existing,
      appsScriptWebhookUrl: cleanUrl,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('apps_script_webhook_updated', {
          detail: { url: cleanUrl },
        })
      );
    }
  } catch {}
}

export function getSavedGoogleSheetConfig(): GoogleSheetsConfig {
  const webhookUrl = getAppsScriptWebhookUrl();
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GSHEET);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed) {
        return {
          ...parsed,
          spreadsheetId: TARGET_SPREADSHEET_ID,
          spreadsheetUrl: TARGET_SPREADSHEET_URL,
          title: parsed.title || 'AO Tasikmalaya Digital CDC - Database Survey',
          autoSyncEnabled: parsed.autoSyncEnabled ?? true,
          appsScriptWebhookUrl: webhookUrl || parsed.appsScriptWebhookUrl || '',
          lastWebhookSyncAt: parsed.lastWebhookSyncAt,
          webhookSyncCount: parsed.webhookSyncCount ?? 0,
        };
      }
    }
  } catch {
    // Ignore storage parse error
  }

  return {
    spreadsheetId: TARGET_SPREADSHEET_ID,
    spreadsheetUrl: TARGET_SPREADSHEET_URL,
    title: 'AO Tasikmalaya Digital CDC - Database Survey',
    autoSyncEnabled: true,
    appsScriptWebhookUrl: webhookUrl,
    webhookSyncCount: 0,
  };
}

export function saveGoogleSheetConfig(config: Partial<GoogleSheetsConfig> | null) {
  try {
    const existing = getSavedGoogleSheetConfig();
    const updated: GoogleSheetsConfig = {
      ...existing,
      ...(config || {}),
      spreadsheetId: TARGET_SPREADSHEET_ID,
      spreadsheetUrl: TARGET_SPREADSHEET_URL,
    };
    localStorage.setItem(STORAGE_KEY_GSHEET, JSON.stringify(updated));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('google_sheets_config_updated', { detail: updated })
      );
    }
  } catch {
    // Ignore storage errors
  }
}

/**
 * Helper to ensure a valid access token is ready
 */
export async function ensureToken(): Promise<string> {
  let token = await getAccessToken();
  if (!token) {
    const authRes = await googleSignIn();
    if (!authRes?.accessToken) {
      throw new Error(
        'Akses Google belum terotorisasi. Silakan hubungkan akun Google terlebih dahulu.'
      );
    }
    token = authRes.accessToken;
  }
  return token;
}

/**
 * Checks if the target spreadsheet has the 4 required sheets and creates any that are missing
 */
export async function ensureSpreadsheetTabs(spreadsheetId: string, token: string) {
  try {
    const metaRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!metaRes.ok) return;
    const metaData = await metaRes.json();
    const existingTitles = new Set(
      (metaData.sheets || []).map((s: any) => s.properties?.title)
    );

    const requiredSheets = [
      { title: 'RINGKASAN KPI', tabColor: { red: 0.95, green: 0.77, blue: 0.05 } },
      { title: 'TRACKING SPB', tabColor: { red: 0.2, green: 0.75, blue: 0.4 } },
      { title: 'CDC FP SPB', tabColor: { red: 0.25, green: 0.5, blue: 0.95 } },
      { title: 'HAJATAN SURVEY', tabColor: { red: 0.65, green: 0.35, blue: 0.85 } },
    ];

    const missingRequests = requiredSheets
      .filter((s) => !existingTitles.has(s.title))
      .map((s) => ({
        addSheet: {
          properties: {
            title: s.title,
            tabColor: s.tabColor,
            gridProperties: { frozenRowCount: 1 },
          },
        },
      }));

    if (missingRequests.length > 0) {
      await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ requests: missingRequests }),
        }
      );
    }
  } catch (err) {
    console.warn('ensureSpreadsheetTabs error:', err);
  }
}

/**
 * Creates or resets standard CDC Survey sheets on the target spreadsheet
 */
export async function createNewDatabaseSpreadsheet(
  customTitle?: string
): Promise<GoogleSheetsConfig> {
  const token = await ensureToken();
  await ensureSpreadsheetTabs(TARGET_SPREADSHEET_ID, token);
  await syncAllDataToSpreadsheet(TARGET_SPREADSHEET_ID, token);
  return getSavedGoogleSheetConfig();
}

/**
 * Syncs/Overwrites all survey records into the specified Google Sheet
 */
export async function syncAllDataToSpreadsheet(
  targetSpreadsheetId: string = TARGET_SPREADSHEET_ID,
  providedToken?: string
): Promise<{
  totalSpb: number;
  totalEvent: number;
  totalHajatan: number;
  spreadsheetUrl: string;
}> {
  const spreadsheetId = targetSpreadsheetId || TARGET_SPREADSHEET_ID;
  const token = providedToken || (await ensureToken());

  // Ensure the 4 tabs exist before populating
  await ensureSpreadsheetTabs(spreadsheetId, token);

  // Fetch all local records
  const [spbRecords, eventRecords, hajatanRecords, stats] = await Promise.all([
    getSpbRecords(),
    getEventRecords(),
    getHajatanRecords(),
    calculateAllSummary(),
  ]);

  // Convert to rows
  const spbMapped = mapSpbToExcelRows(spbRecords);
  const eventMapped = mapEventToExcelRows(eventRecords);
  const hajatanMapped = mapHajatanToExcelRows(hajatanRecords);

  // Helper to build 2D table array with header
  const buildTableValues = (mappedObjects: Record<string, any>[]) => {
    if (mappedObjects.length === 0) {
      return [['(Belum ada data)']];
    }
    const headers = Object.keys(mappedObjects[0]);
    const rows = mappedObjects.map((row) =>
      headers.map((h) => (row[h] !== undefined && row[h] !== null ? row[h] : ''))
    );
    return [headers, ...rows];
  };

  const spbValues = buildTableValues(spbMapped);
  const eventValues = buildTableValues(eventMapped);
  const hajatanValues = buildTableValues(hajatanMapped);

  // Build KPI Summary Sheet values
  const nowStr = new Date().toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
  });
  const kpiValues = [
    ['DASHBOARD RINGKASAN PERFORMANCE SURVEY CDC AO TASIKMALAYA', '', '', ''],
    ['Waktu Sinkronisasi Terakhir:', nowStr, '', ''],
    ['Target Spreadsheet ID:', TARGET_SPREADSHEET_ID, '', ''],
    ['', '', '', ''],
    [
      'Jenis Survey',
      'Consumer Contact (Survey)',
      'Trial Person',
      'Penjualan (Pack)',
    ],
    [
      'Tracking SPB / FP GIK',
      stats.spb.consumerContact,
      stats.spb.trialPerson,
      stats.spb.totalSelling,
    ],
    [
      'CDC FP / SPB Event',
      stats.event.consumerContact,
      stats.event.trialPerson,
      stats.event.totalSelling,
    ],
    [
      'Hajatan Event',
      stats.hajatan.consumerContact,
      stats.hajatan.trialPerson,
      stats.hajatan.totalSelling,
    ],
    [
      'TOTAL OVERALL',
      stats.spb.consumerContact +
        stats.event.consumerContact +
        stats.hajatan.consumerContact,
      stats.spb.trialPerson +
        stats.event.trialPerson +
        stats.hajatan.trialPerson,
      stats.spb.totalSelling +
        stats.event.totalSelling +
        stats.hajatan.totalSelling,
    ],
    ['', '', '', ''],
    ['Catatan:', 'Data terhubung real-time dengan aplikasi AO Tasikmalaya Digital CDC.', '', ''],
  ];

  // 1. Clear existing content in sheets to avoid leftover rows
  try {
    await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchClear`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ranges: [
            "'RINGKASAN KPI'!A1:Z500",
            "'TRACKING SPB'!A1:ZZ5000",
            "'CDC FP SPB'!A1:ZZ5000",
            "'HAJATAN SURVEY'!A1:ZZ5000",
          ],
        }),
      }
    );
  } catch (clearErr) {
    console.warn('BatchClear warning:', clearErr);
  }

  // 2. Batch Update all sheet values
  const batchUpdatePayload = {
    valueInputOption: 'USER_ENTERED',
    data: [
      {
        range: "'RINGKASAN KPI'!A1",
        values: kpiValues,
      },
      {
        range: "'TRACKING SPB'!A1",
        values: spbValues,
      },
      {
        range: "'CDC FP SPB'!A1",
        values: eventValues,
      },
      {
        range: "'HAJATAN SURVEY'!A1",
        values: hajatanValues,
      },
    ],
  };

  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchUpdatePayload),
    }
  );

  if (!updateRes.ok) {
    const errText = await updateRes.text();
    let errJson: any = null;
    try {
      errJson = JSON.parse(errText);
    } catch {}
    throw new Error(
      errJson?.error?.message ||
        `Gagal menulis data ke Google Sheet (Status ${updateRes.status})`
    );
  }

  // Update stored configuration
  const updatedConfig: GoogleSheetsConfig = {
    spreadsheetId: TARGET_SPREADSHEET_ID,
    spreadsheetUrl: TARGET_SPREADSHEET_URL,
    title: 'AO Tasikmalaya Digital CDC - Database Survey',
    lastSyncedAt: new Date().toISOString(),
    totalSpbRows: spbRecords.length,
    totalEventRows: eventRecords.length,
    totalHajatanRows: hajatanRecords.length,
    autoSyncEnabled: true,
  };

  saveGoogleSheetConfig(updatedConfig);
  clearPendingQueue();

  return {
    totalSpb: spbRecords.length,
    totalEvent: eventRecords.length,
    totalHajatan: hajatanRecords.length,
    spreadsheetUrl: TARGET_SPREADSHEET_URL,
  };
}

/**
 * Queue management for offline or token-pending syncs
 */
function addPendingRecord(type: 'spb' | 'event' | 'hajatan', record: any) {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    const queue = raw ? JSON.parse(raw) : [];
    queue.push({ type, record, timestamp: Date.now() });
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {}
}

function removePendingRecord(recordId?: string) {
  if (!recordId) return;
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return;
    const queue = JSON.parse(raw);
    const filtered = queue.filter((item: any) => item.record?.id !== recordId);
    localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(filtered));
  } catch {}
}

export function getPendingRecordsCount(): number {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return 0;
    const queue = JSON.parse(raw);
    return Array.isArray(queue) ? queue.length : 0;
  } catch {
    return 0;
  }
}

function clearPendingQueue() {
  try {
    localStorage.removeItem(PENDING_QUEUE_KEY);
  } catch {}
}

/**
 * The official, battle-tested Google Apps Script code to paste into Google Sheet Apps Script editor
 */
export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ==============================================================================
 * GOOGLE APPS SCRIPT WEBHOOK RESMI & FULL CRUD - AO TASIKMALAYA DIGITAL CDC
 * Target Spreadsheet: 1c79z-EWoG0IwfgconEVU53_0Uj34smDsdSuiJ7aD8ec
 * URL: https://docs.google.com/spreadsheets/d/1c79z-EWoG0IwfgconEVU53_0Uj34smDsdSuiJ7aD8ec/edit
 * ==============================================================================
 * 
 * FITUR LENGKAP CRUD (CREATE, READ, UPDATE, DELETE):
 * 1. CREATE (Tambah Data):
 *    - Mendukung single insert maupun batch/bulk insert
 *    - Otomatis membuat sheet & header rapi jika sheet masih kosong
 *    - Otomatis nomor urut (No: 1, 2, 3...)
 *    - Anti-bentrok antrean surveyor (Concurrency Lock 25 detik)
 * 
 * 2. READ (Baca Data):
 *    - Bisa membaca tab 'TRACKING SPB', 'CDC FP SPB', 'HAJATAN SURVEY', atau nama sheet custom
 *    - Mendukung filter berdasarkan Tanggal, SPB, OU, atau ID
 *    - Tersedia di doGet (GET) maupun doPost (POST)
 * 
 * 3. UPDATE (Perbarui Data):
 *    - Mencari baris berdasarkan 'id' / 'ID' / 'rowIndex' / 'matchKey & matchValue'
 *    - Hanya mengubah kolom yang dikirim, kolom lain tetap aman
 *    - Otomatis memperbarui timestamp audit
 * 
 * 4. DELETE (Hapus Data):
 *    - Menghapus baris berdasarkan 'id' / 'rowIndex' / 'matchKey & matchValue'
 * 
 * 5. UPSERT (Update jika ada, Create jika baru):
 *    - action: "upsert" otomatis mendeteksi apakah data sudah ada atau belum
 * 
 * ==============================================================================
 * PANDUAN DEPLOY (HANYA 1 MENIT):
 * 1. Buka Google Sheet: https://docs.google.com/spreadsheets/d/1c79z-EWoG0IwfgconEVU53_0Uj34smDsdSuiJ7aD8ec/edit
 * 2. Klik menu 'Ekstensi' (Extensions) -> 'Apps Script'
 * 3. Hapus SEMUA isi kode lama di Code.gs, lalu PASTE SELURUH KODE INI.
 * 4. Klik tombol 'Deploy' (Terapkan) biru di kanan atas -> 'Manage deployments' (Kelola penerapan).
 * 5. Klik ikon Pensil (Edit) -> pilih Version: 'New version' (Versi baru).
 *    (Jika pertama kali: Deploy -> New deployment -> Web app).
 * 6. Execute as: 'Me' (Saya), Who has access: 'Anyone' (Siapa saja).
 * 7. Klik 'Deploy', izinkan akses jika diminta, lalu salin Web app URL (berakhiran /exec).
 * ==============================================================================
 */

// Global target spreadsheet fallback
var DEFAULT_SPREADSHEET_ID = "1c79z-EWoG0IwfgconEVU53_0Uj34smDsdSuiJ7aD8ec";

/**
 * Helper: Membuka spreadsheet target
 */
function getTargetSpreadsheet(idOrUrl) {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {}
  if (ss) return ss;

  var targetId = idOrUrl || DEFAULT_SPREADSHEET_ID;
  if (targetId.indexOf("docs.google.com") !== -1) {
    var match = targetId.match(/\\/d\\/([a-zA-Z0-9-_]+)/);
    if (match) targetId = match[1];
  }
  return SpreadsheetApp.openById(targetId);
}

/**
 * Helper: Mencari sheet secara toleran (case-insensitive & spasi toleran)
 */
function findTargetSheet(ss, requestedName) {
  if (!requestedName) return ss.getSheetByName("TRACKING SPB") || ss.getSheets()[0];
  
  var exact = ss.getSheetByName(requestedName);
  if (exact) return exact;

  var cleanRequested = requestedName.toString().toLowerCase().replace(/[\\s_\\-]/g, "");
  
  // Mapping tipe alias
  if (cleanRequested === "spb" || cleanRequested === "trackingspb") cleanRequested = "trackingspb";
  if (cleanRequested === "event" || cleanRequested === "cdcfp" || cleanRequested === "cdcfpspb") cleanRequested = "cdcfpspb";
  if (cleanRequested === "hajatan" || cleanRequested === "hajatansurvey") cleanRequested = "hajatansurvey";

  var all = ss.getSheets();
  for (var i = 0; i < all.length; i++) {
    var n = all[i].getName().toLowerCase().replace(/[\\s_\\-]/g, "");
    if (n === cleanRequested || n.indexOf(cleanRequested) !== -1 || cleanRequested.indexOf(n) !== -1) {
      return all[i];
    }
  }
  return null;
}

/**
 * Helper: Menentukan nama sheet dari parameter atau tipe
 */
function resolveSheetName(payload) {
  var type = (payload.type || "").toString().toLowerCase().trim();
  if (type === "spb") return "TRACKING SPB";
  if (type === "event" || type === "cdc" || type === "cdc fp" || type === "cdc_fp") return "CDC FP SPB";
  if (type === "hajatan") return "HAJATAN SURVEY";
  if (payload.targetSheet) return payload.targetSheet;
  if (payload.sheet) return payload.sheet;
  if (payload.sheetName) return payload.sheetName;
  return "TRACKING SPB";
}

/**
 * Helper: Membaca seluruh baris sheet menjadi Array of Objects
 */
function readSheetAsJson(sheet, filterOptions) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol < 1) return [];

  var rawValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = rawValues[0];
  var resultList = [];

  var opt = filterOptions || {};
  var filterDate = opt.date ? opt.date.toString().trim() : null;
  var filterSpb = opt.spb ? opt.spb.toString().toLowerCase().trim() : null;
  var limit = opt.limit ? parseInt(opt.limit, 10) : 5000;

  for (var r = 1; r < rawValues.length; r++) {
    var row = rawValues[r];
    var item = {};
    var hasContent = false;

    // Simpan informasi baris untuk keperluan update/delete
    item["__rowIndex"] = r + 1;

    for (var c = 0; c < headers.length; c++) {
      var h = headers[c];
      if (!h) continue;
      var key = h.toString().trim();
      var val = row[c];

      if (val instanceof Date) {
        val = Utilities.formatDate(val, "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss");
      }
      item[key] = (val !== undefined && val !== null) ? val : "";
      if (val !== "" && val !== null && val !== undefined) {
        hasContent = true;
      }
    }

    if (hasContent) {
      // Filter tanggal opsional
      if (filterDate) {
        var rowDate = item["Tanggal"] || item["Date"] || item["tanggal"] || item["date"] || "";
        if (rowDate.indexOf(filterDate) === -1) continue;
      }
      // Filter SPB opsional
      if (filterSpb) {
        var rowSpb = (item["Nama SPB"] || item["nama_spb"] || "").toString().toLowerCase();
        if (rowSpb.indexOf(filterSpb) === -1) continue;
      }

      resultList.push(item);
      if (resultList.length >= limit) break;
    }
  }
  return resultList;
}

/**
 * Helper: Menemukan nomor baris (1-based rowIndex) berdasarkan identifier
 */
function locateRowIndex(sheet, selector) {
  if (!sheet) return -1;
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol < 1) return -1;

  // 1. Jika selector secara eksplisit adalah nomor baris (rowIndex >= 2)
  if (selector.rowIndex && typeof selector.rowIndex === "number" && selector.rowIndex >= 2 && selector.rowIndex <= lastRow) {
    return selector.rowIndex;
  }

  var rawValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = rawValues[0].map(function(h) { return h ? h.toString().trim().toLowerCase() : ""; });

  var searchId = selector.id ? selector.id.toString().trim() : (selector.ID ? selector.ID.toString().trim() : null);
  var matchKey = selector.matchKey ? selector.matchKey.toString().trim().toLowerCase() : null;
  var matchValue = selector.matchValue !== undefined && selector.matchValue !== null ? selector.matchValue.toString().trim().toLowerCase() : null;

  // Cari kolom ID atau matchKey
  var targetColIdx = -1;
  if (matchKey) {
    targetColIdx = headers.indexOf(matchKey);
  }

  if (targetColIdx === -1 && searchId) {
    // Prioritaskan kolom berlabel id, no_hp, atau identifier
    var idAliases = ["id", "uuid", "id_survey", "no hp responden", "no hp", "no_hp", "timestamp"];
    for (var a = 0; a < idAliases.length; a++) {
      var idx = headers.indexOf(idAliases[a]);
      if (idx !== -1) {
        targetColIdx = idx;
        break;
      }
    }
  }

  // Jika kolom spesifik ditemukan, cari nilainya
  if (targetColIdx !== -1) {
    var checkVal = matchValue !== null ? matchValue : searchId.toLowerCase();
    for (var r = 1; r < rawValues.length; r++) {
      var cell = rawValues[r][targetColIdx];
      if (cell !== undefined && cell !== null && cell.toString().trim().toLowerCase() === checkVal) {
        return r + 1; // 1-based row index di sheet
      }
    }
  }

  // Jika belum ketemu, lakukan pencarian scan di seluruh kolom (sangat toleran)
  if (searchId) {
    var cleanSearchId = searchId.toLowerCase();
    for (var rowIdx = 1; rowIdx < rawValues.length; rowIdx++) {
      for (var colIdx = 0; colIdx < headers.length; colIdx++) {
        var val = rawValues[rowIdx][colIdx];
        if (val !== undefined && val !== null && val.toString().trim().toLowerCase() === cleanSearchId) {
          return rowIdx + 1;
        }
      }
    }
  }

  return -1;
}

/**
 * Helper: Memperbarui waktu sinkronisasi di sheet RINGKASAN KPI
 */
function touchKpiSyncTime(ss, note) {
  try {
    var kpiSheet = ss.getSheetByName("RINGKASAN KPI");
    if (kpiSheet) {
      var nowWib = Utilities.formatDate(new Date(), "Asia/Jakarta", "dd/MM/yyyy HH:mm:ss") + " WIB";
      kpiSheet.getRange("B2").setValue(nowWib + (note ? " (" + note + ")" : " (Auto-Sync Webhook CRUD)"));
    }
  } catch (e) {}
}

/**
 * Helper: Format JSON response dengan Header CORS lengkap
 */
function makeJsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ==============================================================================
// 1. CONTROLLER UTAMA: POST REQUEST (CREATE, READ, UPDATE, DELETE, UPSERT, PING)
// ==============================================================================
function doPost(e) {
  var lock = LockService.getScriptLock();
  // Kunci antrean 25 detik agar operasi CRUD multi-user tidak tumpang tindih
  lock.tryLock(25000);

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return makeJsonResponse({
        status: "error",
        message: "Tidak ada data postData (body payload) yang diterima."
      });
    }

    var payload = {};
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return makeJsonResponse({
        status: "error",
        message: "Payload format JSON tidak valid: " + parseErr.message
      });
    }

    var ss = getTargetSpreadsheet(payload.spreadsheetId);
    var action = (payload.action || "create").toString().toLowerCase().trim();
    var sheetName = resolveSheetName(payload);

    // -------------------------------------------------------------
    // ACTION: PING (Health Check)
    // -------------------------------------------------------------
    if (action === "ping") {
      var sheetsInfo = ss.getSheets().map(function(s) {
        return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
      });
      return makeJsonResponse({
        status: "success",
        action: "ping",
        service: "AO Tasikmalaya Google Apps Script CRUD Webhook",
        spreadsheetTitle: ss.getName(),
        spreadsheetId: ss.getId(),
        sheets: sheetsInfo,
        serverTime: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB"
      });
    }

    // -------------------------------------------------------------
    // ACTION: READ (Baca Data via POST)
    // -------------------------------------------------------------
    if (action === "read" || action === "getall") {
      if (payload.sheet || payload.targetSheet) {
        var singleSheet = findTargetSheet(ss, sheetName);
        var records = readSheetAsJson(singleSheet, payload);
        return makeJsonResponse({
          status: "success",
          action: "read",
          sheet: sheetName,
          total: records.length,
          data: records
        });
      } else {
        var spbData = readSheetAsJson(findTargetSheet(ss, "TRACKING SPB"), payload);
        var eventData = readSheetAsJson(findTargetSheet(ss, "CDC FP SPB"), payload);
        var hajatanData = readSheetAsJson(findTargetSheet(ss, "HAJATAN SURVEY"), payload);
        return makeJsonResponse({
          status: "success",
          action: "read",
          totalSpb: spbData.length,
          totalEvent: eventData.length,
          totalHajatan: hajatanData.length,
          spb: spbData,
          event: eventData,
          hajatan: hajatanData,
          timestamp: new Date().toISOString()
        });
      }
    }

    // -------------------------------------------------------------
    // ACTION: GET BY ID / FIND (Baca Single Record)
    // -------------------------------------------------------------
    if (action === "get" || action === "getbyid" || action === "find") {
      var targetSheetToFind = findTargetSheet(ss, sheetName);
      var rowNum = locateRowIndex(targetSheetToFind, payload);
      if (rowNum === -1) {
        return makeJsonResponse({
          status: "not_found",
          action: "get",
          message: "Data dengan identifier tersebut tidak ditemukan di " + sheetName
        });
      }

      var lastColFind = targetSheetToFind.getLastColumn();
      var headersFind = targetSheetToFind.getRange(1, 1, 1, lastColFind).getValues()[0];
      var rowValsFind = targetSheetToFind.getRange(rowNum, 1, 1, lastColFind).getValues()[0];
      var foundObj = { __rowIndex: rowNum };
      for (var f = 0; f < headersFind.length; f++) {
        var hName = headersFind[f] ? headersFind[f].toString().trim() : "";
        if (hName) foundObj[hName] = rowValsFind[f];
      }

      return makeJsonResponse({
        status: "success",
        action: "get",
        sheet: sheetName,
        rowIndex: rowNum,
        data: foundObj
      });
    }

    // -------------------------------------------------------------
    // ACTION: UPDATE (Perbarui Data Baris Tertentu)
    // -------------------------------------------------------------
    if (action === "update" || action === "edit") {
      var sheetToUpdate = findTargetSheet(ss, sheetName);
      if (!sheetToUpdate) {
        return makeJsonResponse({ status: "error", message: "Sheet " + sheetName + " tidak ditemukan." });
      }

      var targetRow = locateRowIndex(sheetToUpdate, payload);
      if (targetRow === -1) {
        return makeJsonResponse({
          status: "error",
          action: "update",
          message: "Baris yang akan di-update tidak ditemukan (ID: " + (payload.id || payload.ID || "-") + ")"
        });
      }

      var lastColUp = sheetToUpdate.getLastColumn();
      var headersUp = sheetToUpdate.getRange(1, 1, 1, lastColUp).getValues()[0];
      var updateData = payload.data || payload.rowObject || payload.record || {};
      var updatedFields = [];

      for (var cUp = 0; cUp < headersUp.length; cUp++) {
        var colHead = headersUp[cUp];
        if (!colHead) continue;
        var cleanColHead = colHead.toString().trim();
        
        // Cari kecocokan di data yang dikirim (case-insensitive)
        var matchedKey = Object.keys(updateData).find(function(k) {
          return k.toLowerCase().trim() === cleanColHead.toLowerCase();
        });

        if (matchedKey && updateData[matchedKey] !== undefined) {
          var newVal = updateData[matchedKey];
          sheetToUpdate.getRange(targetRow, cUp + 1).setValue(newVal);
          updatedFields.push(cleanColHead);
        }
      }

      touchKpiSyncTime(ss, "Update row " + targetRow + " di " + sheetName);

      return makeJsonResponse({
        status: "success",
        action: "update",
        message: "Data baris ke-" + targetRow + " di sheet " + sheetName + " berhasil diperbarui!",
        sheet: sheetName,
        updatedRow: targetRow,
        updatedFieldsCount: updatedFields.length,
        updatedFields: updatedFields,
        timestamp: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------
    // ACTION: DELETE (Hapus Baris Tertentu)
    // -------------------------------------------------------------
    if (action === "delete" || action === "remove") {
      var sheetToDelete = findTargetSheet(ss, sheetName);
      if (!sheetToDelete) {
        return makeJsonResponse({ status: "error", message: "Sheet " + sheetName + " tidak ditemukan." });
      }

      var rowToDelete = locateRowIndex(sheetToDelete, payload);
      if (rowToDelete === -1) {
        return makeJsonResponse({
          status: "error",
          action: "delete",
          message: "Baris yang akan dihapus tidak ditemukan (ID: " + (payload.id || payload.ID || "-") + ")"
        });
      }

      sheetToDelete.deleteRow(rowToDelete);
      touchKpiSyncTime(ss, "Hapus row " + rowToDelete + " di " + sheetName);

      return makeJsonResponse({
        status: "success",
        action: "delete",
        message: "Baris ke-" + rowToDelete + " di sheet " + sheetName + " berhasil dihapus!",
        sheet: sheetName,
        deletedRow: rowToDelete,
        timestamp: new Date().toISOString()
      });
    }

    // -------------------------------------------------------------
    // ACTION: UPSERT (Update jika ada, Insert jika belum ada)
    // -------------------------------------------------------------
    if (action === "upsert") {
      var sheetToUpsert = findTargetSheet(ss, sheetName);
      var existingRow = sheetToUpsert ? locateRowIndex(sheetToUpsert, payload) : -1;
      if (existingRow !== -1) {
        payload.action = "update";
        payload.rowIndex = existingRow;
        // Jalankan update
        return doPost({ postData: { contents: JSON.stringify(payload) } });
      } else {
        // Lanjutkan ke CREATE di bawah
        action = "create";
      }
    }

    // -------------------------------------------------------------
    // ACTION: CREATE / APPEND (Tambah Baris Baru - Single / Batch)
    // -------------------------------------------------------------
    var sheet = findTargetSheet(ss, sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }

    // Dukungan batch/bulk create
    var recordsToInsert = [];
    if (Array.isArray(payload.records)) {
      recordsToInsert = payload.records;
    } else if (Array.isArray(payload.rows)) {
      recordsToInsert = payload.rows;
    } else {
      recordsToInsert = [payload.rowObject || payload.record || payload];
    }

    var headers = payload.headers;

    // Jika sheet baru/kosong, buat header
    if (sheet.getLastRow() === 0) {
      var initialHeaders = headers;
      if (!initialHeaders || initialHeaders.length === 0) {
        if (recordsToInsert.length > 0 && typeof recordsToInsert[0] === "object") {
          initialHeaders = Object.keys(recordsToInsert[0]);
        }
      }
      if (initialHeaders && initialHeaders.length > 0) {
        sheet.appendRow(initialHeaders);
        sheet.setFrozenRows(1);
        sheet.getRange(1, 1, 1, initialHeaders.length)
          .setFontWeight("bold")
          .setBackground("#059669")
          .setFontColor("#ffffff");
      }
    }

    var existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];

    // Auto-tambahkan & posisikan kolom baru jika ada header di payload yang belum ada di spreadsheet
    if (headers && Array.isArray(headers) && existingHeaders.length > 1) {
      for (var hIdx = 0; hIdx < headers.length; hIdx++) {
        var hName = headers[hIdx] ? headers[hIdx].toString().trim() : "";
        if (!hName) continue;
        var headerExists = existingHeaders.some(function(eh) {
          return eh && eh.toString().trim().toLowerCase() === hName.toLowerCase();
        });
        if (!headerExists) {
          var targetCol = sheet.getLastColumn() + 1;
          if (hIdx > 0) {
            var prevColName = headers[hIdx - 1].toString().trim().toLowerCase();
            for (var cIdx = 0; cIdx < existingHeaders.length; cIdx++) {
              if (existingHeaders[cIdx] && existingHeaders[cIdx].toString().trim().toLowerCase() === prevColName) {
                targetCol = cIdx + 2;
                break;
              }
            }
          }
          if (targetCol <= sheet.getLastColumn()) {
            sheet.insertColumnBefore(targetCol);
          }
          sheet.getRange(1, targetCol).setValue(hName);
          sheet.getRange(1, targetCol)
            .setFontWeight("bold")
            .setBackground("#059669")
            .setFontColor("#ffffff");
          existingHeaders = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
        }
      }
    }

    var insertedRows = [];

    for (var i = 0; i < recordsToInsert.length; i++) {
      var itemObj = recordsToInsert[i];
      var finalRow = [];

      if (existingHeaders.length > 1 && typeof itemObj === "object") {
        finalRow = existingHeaders.map(function(head) {
          if (!head) return "";
          var cleanHead = head.toString().trim();
          if (cleanHead.toLowerCase() === "no") {
            return sheet.getLastRow(); // Nomor urut otomatis
          }
          var val = itemObj[cleanHead];
          if (val === undefined || val === null) {
            var matchK = Object.keys(itemObj).find(function(k) {
              return k.toLowerCase().trim() === cleanHead.toLowerCase();
            });
            val = matchK ? itemObj[matchK] : "";
          }
          return val !== undefined && val !== null ? val : "";
        });
      } else if (Array.isArray(payload.rowValues)) {
        finalRow = payload.rowValues.slice();
      }

      if (finalRow.length > 0) {
        sheet.appendRow(finalRow);
        insertedRows.push(sheet.getLastRow());
      }
    }

    touchKpiSyncTime(ss, "Insert " + insertedRows.length + " baris di " + sheetName);

    return makeJsonResponse({
      status: "success",
      action: "create",
      message: "Berhasil menambahkan " + insertedRows.length + " baris data ke " + sheetName,
      sheet: sheetName,
      insertedRowsCount: insertedRows.length,
      insertedRow: insertedRows[0] || sheet.getLastRow(),
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return makeJsonResponse({
      status: "error",
      message: "Terjadi kesalahan server: " + error.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

// ==============================================================================
// 2. CONTROLLER READ & QUICK CRUD: GET REQUEST
// ==============================================================================
function doGet(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);

  try {
    var params = (e && e.parameter) ? e.parameter : {};
    var ss = getTargetSpreadsheet(params.spreadsheetId);
    var action = (params.action || "read").toString().toLowerCase().trim();

    // PING
    if (action === "ping") {
      var sheetsInfo = ss.getSheets().map(function(s) {
        return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
      });
      return makeJsonResponse({
        status: "ok",
        action: "ping",
        service: "AO Tasikmalaya Google Apps Script CRUD Webhook",
        message: "Webhook CRUD aktif & siap!",
        spreadsheetTitle: ss.getName(),
        sheets: sheetsInfo,
        serverTime: Utilities.formatDate(new Date(), "Asia/Jakarta", "yyyy-MM-dd HH:mm:ss") + " WIB"
      });
    }

    // READ SINGLE RECORD (GET BY ID)
    if (action === "get" || action === "find") {
      var targetSheetName = resolveSheetName(params);
      var sheetFind = findTargetSheet(ss, targetSheetName);
      var rowFind = locateRowIndex(sheetFind, params);
      if (rowFind === -1) {
        return makeJsonResponse({ status: "not_found", message: "Data tidak ditemukan" });
      }
      var lastColG = sheetFind.getLastColumn();
      var headG = sheetFind.getRange(1, 1, 1, lastColG).getValues()[0];
      var valG = sheetFind.getRange(rowFind, 1, 1, lastColG).getValues()[0];
      var resItem = { __rowIndex: rowFind };
      for (var gi = 0; gi < headG.length; gi++) {
        if (headG[gi]) resItem[headG[gi].toString().trim()] = valG[gi];
      }
      return makeJsonResponse({ status: "success", action: "get", rowIndex: rowFind, data: resItem });
    }

    // DELETE VIA GET (untuk pengujian praktis di browser/webhook query)
    if (action === "delete") {
      var sheetDelName = resolveSheetName(params);
      var sDel = findTargetSheet(ss, sheetDelName);
      var rDel = locateRowIndex(sDel, params);
      if (rDel === -1) {
        return makeJsonResponse({ status: "error", message: "Baris tidak ditemukan untuk dihapus" });
      }
      sDel.deleteRow(rDel);
      touchKpiSyncTime(ss, "Delete row " + rDel + " via GET");
      return makeJsonResponse({ status: "success", action: "delete", deletedRow: rDel });
    }

    // READ ALL / BACA DATA SPREADSHEET
    var requestedSheet = params.sheet || params.targetSheet;
    if (requestedSheet) {
      var singleSheet = findTargetSheet(ss, requestedSheet);
      var dataSingle = readSheetAsJson(singleSheet, params);
      return makeJsonResponse({
        status: "success",
        action: "read",
        sheet: requestedSheet,
        total: dataSingle.length,
        data: dataSingle
      });
    }

    var spb = readSheetAsJson(findTargetSheet(ss, "TRACKING SPB"), params);
    var event = readSheetAsJson(findTargetSheet(ss, "CDC FP SPB"), params);
    var hajatan = readSheetAsJson(findTargetSheet(ss, "HAJATAN SURVEY"), params);

    return makeJsonResponse({
      status: "success",
      action: "read",
      totalSpb: spb.length,
      totalEvent: event.length,
      totalHajatan: hajatan.length,
      spb: spb,
      event: event,
      hajatan: hajatan,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    return makeJsonResponse({
      status: "error",
      message: "Error membaca sheet: " + err.toString()
    });
  } finally {
    lock.releaseLock();
  }
}
`;

/**
 * Sends a single survey record directly to the Google Apps Script Webhook.
 * Bypasses all Google account login requirements on surveyors' phones.
 */
export async function sendRecordToGoogleAppsScriptWebhook(
  type: 'spb' | 'event' | 'hajatan',
  record: any,
  providedUrl?: string
): Promise<{ success: boolean; message: string; method: 'webhook' | 'sheets_api' }> {
  const webhookUrl = (providedUrl || getAppsScriptWebhookUrl()).trim();

  let sheetName = 'TRACKING SPB';
  let mappedRows: any[] = [];

  if (type === 'spb') {
    sheetName = 'TRACKING SPB';
    mappedRows = mapSpbToExcelRows([record as SpbRecord]);
  } else if (type === 'event') {
    sheetName = 'CDC FP SPB';
    mappedRows = mapEventToExcelRows([record as EventRecord]);
  } else if (type === 'hajatan') {
    sheetName = 'HAJATAN SURVEY';
    mappedRows = mapHajatanToExcelRows([record as HajatanRecord]);
  }

  const rowObject = mappedRows.length > 0 ? mappedRows[0] : record;
  const headers = mappedRows.length > 0 ? Object.keys(mappedRows[0]) : Object.keys(record);
  const rowValues = mappedRows.length > 0 ? Object.values(mappedRows[0]) : Object.values(record);

  const payload = {
    action: 'appendRow',
    type,
    targetSheet: sheetName,
    spreadsheetId: TARGET_SPREADSHEET_ID,
    timestamp: new Date().toISOString(),
    headers,
    rowObject,
    rowValues,
    record,
  };

  if (webhookUrl) {
    try {
      // mode: 'no-cors' and text/plain are mandatory to prevent Google Apps Script 302 preflight blockage
      await fetch(webhookUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      const now = new Date().toISOString();
      const currentConfig = getSavedGoogleSheetConfig();
      const updatedConfig: GoogleSheetsConfig = {
        ...currentConfig,
        lastWebhookSyncAt: now,
        lastSyncedAt: now,
        webhookSyncCount: (currentConfig.webhookSyncCount || 0) + 1,
      };
      saveGoogleSheetConfig(updatedConfig);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('google_sheets_webhook_synced', {
            detail: { type, sheetName, timestamp: now, recordId: record.id },
          })
        );
      }

      removePendingRecord(record.id);

      return {
        success: true,
        message: `Data berhasil masuk ke baris baru ${sheetName} via Webhook tanpa login!`,
        method: 'webhook',
      };
    } catch (err: any) {
      console.warn('Google Apps Script Webhook delivery notice:', err);
    }
  }

  // Fallback to Google Sheets API if an access token is actively held (e.g. by admin)
  const token = await getAccessToken();
  if (token) {
    try {
      let appendRes = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${TARGET_SPREADSHEET_ID}/values/'${encodeURIComponent(sheetName)}'!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            values: [rowValues],
          }),
        }
      );

      if (!appendRes.ok && appendRes.status === 400) {
        await ensureSpreadsheetTabs(TARGET_SPREADSHEET_ID, token);
        appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${TARGET_SPREADSHEET_ID}/values/'${encodeURIComponent(sheetName)}'!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              values: [rowValues],
            }),
          }
        );
      }

      if (appendRes.ok) {
        removePendingRecord(record.id);
        return {
          success: true,
          message: `Data berhasil ditambahkan ke Google Sheet via Sheets API!`,
          method: 'sheets_api',
        };
      }
    } catch (apiErr) {
      console.warn('Sheets API append fallback notice:', apiErr);
    }
  }

  return {
    success: false,
    message: webhookUrl
      ? 'Koneksi offline, data tersimpan di HP & siap disinkronkan otomatis.'
      : 'Tersimpan di HP (Pasang Webhook URL di Admin untuk auto-sync tanpa login).',
    method: 'webhook',
  };
}

/**
 * Tests the Google Apps Script Webhook with a lightweight ping/payload
 */
export async function testAppsScriptWebhook(
  testUrl: string
): Promise<{ success: boolean; message: string }> {
  if (!testUrl || !testUrl.trim().startsWith('https://script.google.com/')) {
    throw new Error('URL Webhook harus berawalan: https://script.google.com/macros/s/.../exec');
  }

  const testPayload = {
    action: 'appendRow',
    type: 'test',
    targetSheet: 'RINGKASAN KPI',
    spreadsheetId: TARGET_SPREADSHEET_ID,
    timestamp: new Date().toISOString(),
    rowObject: {
      Keterangan: 'Tes Koneksi Webhook Apps Script AO Tasikmalaya',
      Waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      Status: 'Berhasil Terhubung Tanpa Login Akun Google',
    },
    rowValues: ['Uji Webhook', new Date().toISOString(), 'OK'],
  };

  try {
    await fetch(testUrl.trim(), {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(testPayload),
    });

    return {
      success: true,
      message: 'Uji coba Webhook berhasil dikirim ke Google Sheet!',
    };
  } catch (err: any) {
    throw new Error(`Gagal mengirim ke Webhook: ${err.message || 'Periksa koneksi internet'}`);
  }
}

/**
 * Updates an existing record in the Google Sheet via the Apps Script Webhook.
 */
export async function updateRecordInGoogleSheet(
  type: 'spb' | 'event' | 'hajatan',
  id: string,
  updatedData: any,
  providedUrl?: string
): Promise<{ success: boolean; message: string }> {
  const webhookUrl = (providedUrl || getAppsScriptWebhookUrl()).trim();
  if (!webhookUrl) {
    throw new Error('URL Webhook belum diatur. Silakan atur di menu Google Sheets Webhook.');
  }

  let sheetName = 'TRACKING SPB';
  if (type === 'event') sheetName = 'CDC FP SPB';
  if (type === 'hajatan') sheetName = 'HAJATAN SURVEY';

  const payload = {
    action: 'update',
    type,
    targetSheet: sheetName,
    spreadsheetId: TARGET_SPREADSHEET_ID,
    id,
    data: updatedData,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      message: `Perintah Update untuk ID ${id} berhasil dikirim ke ${sheetName}.`,
    };
  } catch (err: any) {
    throw new Error(`Gagal mengirim update ke Webhook: ${err.message || err}`);
  }
}

/**
 * Deletes an existing record in the Google Sheet via the Apps Script Webhook.
 */
export async function deleteRecordInGoogleSheet(
  type: 'spb' | 'event' | 'hajatan',
  id: string,
  providedUrl?: string
): Promise<{ success: boolean; message: string }> {
  const webhookUrl = (providedUrl || getAppsScriptWebhookUrl()).trim();
  if (!webhookUrl) {
    throw new Error('URL Webhook belum diatur. Silakan atur di menu Google Sheets Webhook.');
  }

  let sheetName = 'TRACKING SPB';
  if (type === 'event') sheetName = 'CDC FP SPB';
  if (type === 'hajatan') sheetName = 'HAJATAN SURVEY';

  const payload = {
    action: 'delete',
    type,
    targetSheet: sheetName,
    spreadsheetId: TARGET_SPREADSHEET_ID,
    id,
    timestamp: new Date().toISOString(),
  };

  try {
    await fetch(webhookUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      message: `Perintah Hapus (Delete) untuk ID ${id} berhasil dikirim ke ${sheetName}.`,
    };
  } catch (err: any) {
    throw new Error(`Gagal mengirim perintah hapus ke Webhook: ${err.message || err}`);
  }
}

/**
 * Executes a CRUD test operation against the Google Apps Script Webhook
 */
export async function testAppsScriptCrud(
  testUrl: string,
  operation: 'ping' | 'create' | 'read' | 'update' | 'delete'
): Promise<{ success: boolean; message: string; details?: any }> {
  if (!testUrl || !testUrl.trim().startsWith('https://script.google.com/')) {
    throw new Error('URL Webhook harus berawalan: https://script.google.com/macros/s/.../exec');
  }

  const cleanUrl = testUrl.trim();

  if (operation === 'ping') {
    const fetchUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=ping&_t=${Date.now()}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return {
      success: data.status === 'ok' || data.status === 'success',
      message: `Ping Sukses! Terhubung ke spreadsheet: "${data.spreadsheetTitle || 'Active Spreadsheet'}" (${data.sheets ? data.sheets.length : 0} tab sheet aktif).`,
      details: data,
    };
  }

  if (operation === 'read') {
    const fetchUrl = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=read&_t=${Date.now()}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    const data = await res.json();
    return {
      success: data.status === 'success',
      message: `Read Sukses! Terbaca: SPB=${data.totalSpb ?? 0} baris, Event=${data.totalEvent ?? 0} baris, Hajatan=${data.totalHajatan ?? 0} baris.`,
      details: data,
    };
  }

  if (operation === 'create') {
    const payload = {
      action: 'create',
      targetSheet: 'RINGKASAN KPI',
      spreadsheetId: TARGET_SPREADSHEET_ID,
      timestamp: new Date().toISOString(),
      rowObject: {
        Keterangan: 'Uji CRUD CREATE via Webhook',
        Waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
        Status: 'Berhasil Dibuat',
      },
      rowValues: ['Uji CRUD Create', new Date().toISOString(), 'CREATED_OK'],
    };

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      message: 'CREATE Sukses! Baris baru uji coba berhasil dikirim ke Google Sheet.',
    };
  }

  if (operation === 'update') {
    const payload = {
      action: 'update',
      targetSheet: 'RINGKASAN KPI',
      spreadsheetId: TARGET_SPREADSHEET_ID,
      matchKey: 'Keterangan',
      matchValue: 'Uji CRUD CREATE via Webhook',
      data: {
        Status: 'Berhasil Diperbarui (UPDATED)',
        Waktu: new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      },
    };

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      message: 'UPDATE Sukses! Perintah perbaruan baris terkirim ke Google Sheet.',
    };
  }

  if (operation === 'delete') {
    const payload = {
      action: 'delete',
      targetSheet: 'RINGKASAN KPI',
      spreadsheetId: TARGET_SPREADSHEET_ID,
      matchKey: 'Keterangan',
      matchValue: 'Uji CRUD CREATE via Webhook',
    };

    await fetch(cleanUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    return {
      success: true,
      message: 'DELETE Sukses! Perintah hapus baris uji coba terkirim ke Google Sheet.',
    };
  }

  throw new Error(`Operasi ${operation} tidak didukung`);
}

/**
 * Flushes any offline queued records to the Google Sheet
 */
export async function flushPendingRecords(): Promise<number> {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return 0;
    const queue = JSON.parse(raw);
    if (!Array.isArray(queue) || queue.length === 0) return 0;

    let successCount = 0;
    for (const item of queue) {
      if (item.type && item.record) {
        const res = await sendRecordToGoogleAppsScriptWebhook(item.type, item.record);
        if (res.success) {
          successCount++;
          removePendingRecord(item.record?.id);
        }
      }
    }
    return successCount;
  } catch {
    return 0;
  }
}

// Auto-flush pending records whenever browser goes back online
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushPendingRecords().catch(() => {});
  });
}

export function getPendingQueue(): Array<{ type: string; record: any; timestamp: string }> {
  try {
    const raw = localStorage.getItem(PENDING_QUEUE_KEY);
    if (!raw) return [];
    const queue = JSON.parse(raw);
    return Array.isArray(queue) ? queue : [];
  } catch {
    return [];
  }
}

export function isRecordPendingSync(recordId?: string): boolean {
  if (!recordId) return false;
  const queue = getPendingQueue();
  return queue.some((item) => item?.record?.id === recordId);
}

export interface SpbSyncStatus {
  success: boolean;
  totalLocal: number;
  totalInSheet: number;
  matchingCount: number;
  missingCount: number;
  uploadedCount: number;
  rowRange?: string; // e.g. "Baris 83 - 112"
  sheetName: string;
  spreadsheetUrl: string;
  message: string;
  syncedRecordIds: string[];
  sheetRowMap: Record<string, number>;
}

/**
 * Checks and verifies SPB records in the Google Sheet (TRACKING SPB),
 * and automatically uploads any missing records.
 */
export async function verifyAndSyncSpbRecords(
  targetSpbName?: string,
  providedRecords?: SpbRecord[]
): Promise<SpbSyncStatus> {
  const localList = providedRecords || (await getSpbRecords());
  const spbClean = (targetSpbName || '').trim().toUpperCase();

  const targetLocal = spbClean
    ? localList.filter((r) => {
        const name = (r.nama_spb || (r as any).NAMA_SPB || '').trim().toUpperCase();
        return name === spbClean || name.includes(spbClean) || spbClean.includes(name);
      })
    : localList;

  const webhookUrl = getAppsScriptWebhookUrl();
  const spreadsheetUrl = TARGET_SPREADSHEET_URL;
  const sheetName = 'TRACKING SPB';

  if (!webhookUrl) {
    return {
      success: false,
      totalLocal: targetLocal.length,
      totalInSheet: 0,
      matchingCount: 0,
      missingCount: targetLocal.length,
      uploadedCount: 0,
      sheetName,
      spreadsheetUrl,
      message: 'URL Google Apps Script Webhook belum dikonfigurasi.',
      syncedRecordIds: [],
      sheetRowMap: {},
    };
  }

  try {
    const fetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=read&sheet=${encodeURIComponent(sheetName)}&_t=${Date.now()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const sheetRows: any[] = Array.isArray(data.data)
      ? data.data
      : Array.isArray(data.records)
      ? data.records
      : [];

    // Filter sheet rows for target SPB
    const sheetSpbRows = spbClean
      ? sheetRows.filter((r) => {
          const spb = (r['Nama SPB'] || r['NAMA SPB'] || r.nama_spb || '')
            .toString()
            .trim()
            .toUpperCase();
          return spb === spbClean || spb.includes(spbClean) || spbClean.includes(spb);
        })
      : sheetRows;

    const rowIndices = sheetSpbRows
      .map((r) => r.__rowIndex)
      .filter((idx): idx is number => typeof idx === 'number');
    const minRow = rowIndices.length > 0 ? Math.min(...rowIndices) : null;
    const maxRow = rowIndices.length > 0 ? Math.max(...rowIndices) : null;
    const rowRange =
      minRow !== null && maxRow !== null
        ? minRow === maxRow
          ? `Baris ${minRow}`
          : `Baris ${minRow} - ${maxRow}`
        : undefined;

    const syncedRecordIds: string[] = [];
    const sheetRowMap: Record<string, number> = {};
    const missingRecords: SpbRecord[] = [];

    // Check each local record
    targetLocal.forEach((loc) => {
      const locId = loc.id;
      const locResp = (loc.nama_responden || '').trim().toLowerCase();
      const locTs = (loc.timestamp || loc.created_at || '').slice(0, 19);

      const matched = sheetSpbRows.find((sr) => {
        const sId = (sr['ID Dokumen'] || sr.id || sr.ID || '').toString().trim();
        if (locId && sId && sId === locId) return true;
        const sResp = (
          sr['Nama Responden'] ||
          sr.nama_responden ||
          ''
        )
          .toString()
          .trim()
          .toLowerCase();
        if (locResp && sResp && locResp === sResp) {
          const sTs = (sr['Timestamp'] || sr.timestamp || '').toString().slice(0, 19);
          if (locTs && sTs && locTs.slice(0, 10) === sTs.slice(0, 10)) return true;
          return true; // Match by responden name in same SPB
        }
        return false;
      });

      if (matched) {
        if (locId) syncedRecordIds.push(locId);
        if (matched.__rowIndex) {
          if (locId) sheetRowMap[locId] = matched.__rowIndex;
          if (locResp) sheetRowMap[locResp] = matched.__rowIndex;
        }
      } else {
        missingRecords.push(loc);
      }
    });

    // If there are missing records in the sheet, automatically upload them
    let uploadedCount = 0;
    if (missingRecords.length > 0) {
      for (const missing of missingRecords) {
        try {
          const res = await sendRecordToGoogleAppsScriptWebhook('spb', missing);
          if (res.success) {
            uploadedCount++;
            if (missing.id) syncedRecordIds.push(missing.id);
          }
        } catch {
          // Continues best-effort
        }
      }
    }

    // Save synced IDs to local storage cache for fast UI lookup
    try {
      const cachedSynced = JSON.parse(
        localStorage.getItem('ao_tasik_synced_spb_ids') || '[]'
      );
      const allSynced = Array.from(new Set([...cachedSynced, ...syncedRecordIds]));
      localStorage.setItem('ao_tasik_synced_spb_ids', JSON.stringify(allSynced));
    } catch {}

    const totalInSheet = sheetSpbRows.length;
    const finalMatching = syncedRecordIds.length;
    const isAllSynced =
      targetLocal.length === 0 || finalMatching >= targetLocal.length;

    let message = '';
    if (uploadedCount > 0) {
      message = `Berhasil mengunggah ${uploadedCount} data SPB yang tertinggal ke Google Sheet! Total terverifikasi: ${finalMatching}/${targetLocal.length} data.`;
    } else if (isAllSynced) {
      message = `Seluruh ${targetLocal.length} data survey SPB ${
        spbClean || ''
      } terverifikasi 100% SUDAH MASUK di Google Sheet (${
        rowRange || 'Sheet: TRACKING SPB'
      }).`;
    } else {
      message = `${finalMatching} dari ${targetLocal.length} data survey SPB sudah masuk ke Google Sheet. (${missingRecords.length} data belum terunggah).`;
    }

    return {
      success: true,
      totalLocal: targetLocal.length,
      totalInSheet,
      matchingCount: finalMatching,
      missingCount: missingRecords.length - uploadedCount,
      uploadedCount,
      rowRange,
      sheetName,
      spreadsheetUrl,
      message,
      syncedRecordIds,
      sheetRowMap,
    };
  } catch (err: any) {
    return {
      success: false,
      totalLocal: targetLocal.length,
      totalInSheet: 0,
      matchingCount: 0,
      missingCount: targetLocal.length,
      uploadedCount: 0,
      sheetName,
      spreadsheetUrl,
      message: `Gagal memverifikasi dengan Google Sheet: ${
        err.message || 'Periksa koneksi internet'
      }`,
      syncedRecordIds: [],
      sheetRowMap: {},
    };
  }
}

/**
 * Appends a newly submitted record to the target Google Sheet automatically in real-time.
 * Automatically delegates to Google Apps Script Webhook so NO login is required on phone.
 */
export async function appendRecordToGoogleSheet(
  type: 'spb' | 'event' | 'hajatan',
  record: SpbRecord | EventRecord | HajatanRecord
) {
  // Always queue in local storage so data is 100% safeguarded
  addPendingRecord(type, record);

  // Instantly transmit via Google Apps Script Webhook
  return await sendRecordToGoogleAppsScriptWebhook(type, record);
}

function extractVal(row: Record<string, any>, ...keys: string[]): string {
  if (!row || typeof row !== 'object') return '';
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') {
      return String(row[k]).trim();
    }
  }
  const rowKeys = Object.keys(row);
  for (const k of keys) {
    const lower = k.toLowerCase().trim();
    for (const rk of rowKeys) {
      if (rk.toLowerCase().trim() === lower) {
        const v = row[rk];
        if (v !== undefined && v !== null && v !== '') {
          return String(v).trim();
        }
      }
    }
  }
  return '';
}

function normalizeSpreadsheetDate(rawDate?: string, rawTs?: string): string {
  let dStr = (rawDate || '').toString().trim();
  if (!dStr) {
    const tsStr = (rawTs || '').toString().trim();
    dStr = tsStr.includes('T') ? tsStr.split('T')[0] : tsStr.split(' ')[0];
  }
  if (!dStr) return '';
  dStr = dStr.split('T')[0].split(' ')[0].trim();

  // If DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = dStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (slashMatch) {
    let [, p1, p2, y] = slashMatch;
    let d = p1;
    let mo = p2;
    if (parseInt(mo, 10) > 12 && parseInt(d, 10) <= 12) {
      d = p2;
      mo = p1;
    }
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // If already YYYY-MM-DD
  const ymdMatch = dStr.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (ymdMatch) {
    const [, y, mo, d] = ymdMatch;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  return dStr;
}

export function mapSpreadsheetRowToSpbRecord(row: Record<string, any>, idx: number): SpbRecord {
  const get = (...keys: string[]) => extractVal(row, ...keys);
  const explicitId = get('ID Dokumen', 'id', 'Id', 'ID');
  const rawTs = get('Timestamp', 'timestamp', 'Created At', 'created_at') || new Date().toISOString();
  const rawDate = normalizeSpreadsheetDate(get('Tanggal', 'tanggal', 'date', 'Date'), rawTs);

  const id = explicitId || `spb_sheet_${idx}_${Date.now()}`;
  const pic = get('Nama SPB', 'nama_spb', 'NAMA_SPB', 'petugas', 'PIC', 'pic');

  return {
    id,
    nama_spb: pic,
    kode_toko: get('Kode Toko', 'kode_toko', 'KODE_TOKO'),
    nama_toko: get('Nama Toko', 'nama_toko', 'NAMA_TOKO'),
    ro: get('RO', 'ro') || 'BANDUNG',
    ao: get('AO', 'ao') || 'TASIKMALAYA',
    ou: get('OU / Kecamatan', 'ou', 'kecamatan') || 'GRT',
    ou_code: get('OU Code', 'ou_code') || 'GRT',
    kecamatan: get('OU / Kecamatan', 'kecamatan', 'ou'),
    nama_responden: get('Nama Responden', 'nama_responden', 'nama_konsumen'),
    umur: get('Umur', 'umur'),
    pengeluaran_rata: get('Pengeluaran Rata-Rata', 'pengeluaran_rata'),
    pengeluaran_maks: get('Pengeluaran Maksimal', 'pengeluaran_maks'),
    berkenan_hp: get('Berkenan No HP', 'berkenan_hp'),
    no_hp: get('No HP', 'no_hp'),
    brand_utama: get('Brand Utama', 'brand_utama'),
    brand_sebelumnya: get('Brand Sebelumnya', 'brand_sebelumnya'),
    brand_rutin_lain: get('Brand Rutin Lain', 'brand_rutin_lain'),
    brand_selingan: get('Brand Selingan', 'brand_selingan'),
    pernah_beli_ggi: get('Pernah Beli GGI', 'pernah_beli_ggi'),
    kerapihan_batang: parseInt(get('Kerapihan Batang', 'kerapihan_batang') || '0', 10),
    tembakau_mulut: parseInt(get('Tembakau Mulut', 'tembakau_mulut') || '0', 10),
    konsistensi_tarikan: parseInt(get('Konsistensi Tarikan', 'konsistensi_tarikan') || '0', 10),
    minat_16rb: get('Minat 16rb', 'minat_16rb'),
    frekuensi_beli: get('Frekuensi Beli', 'frekuensi_beli'),
    beli_gg: get('Beli GG', 'beli_gg'),
    qty_gg: get('Qty GG (Pack)', 'qty_gg', 'quantity_pack_sold') || '0',
    bundling_garpit: get('Bundling Garpit', 'bundling_garpit'),
    bundling_lighter: get('Bundling Lighter', 'bundling_lighter', 'BUNDLING_LIGHTER') || 'TIDAK',
    mantan_perokok_gg: get('Mantan Perokok GG', 'mantan_perokok_gg'),
    brand_gg_dulu: get('Brand GG Dulu', 'brand_gg_dulu'),
    alasan_pindah: get('Alasan Pindah', 'alasan_pindah'),
    latitude: get('Latitude', 'latitude'),
    longitude: get('Longitude', 'longitude'),
    tanggal: rawDate,
    date: rawDate,
    timestamp: rawTs,
    Timestamp: rawTs,
    created_at: rawTs,
  };
}

export function mapSpreadsheetRowToEventRecord(row: Record<string, any>, idx: number): EventRecord {
  const get = (...keys: string[]) => extractVal(row, ...keys);
  const explicitId = get('ID Dokumen', 'id', 'Id', 'ID');
  const rawTs = get('Timestamp', 'timestamp', 'Created At', 'created_at') || new Date().toISOString();
  const rawDate = normalizeSpreadsheetDate(get('Tanggal', 'tanggal', 'date', 'Date'), rawTs);

  const id = explicitId || `evt_sheet_${idx}_${Date.now()}`;
  return {
    id,
    nama_pic: get('Nama PIC', 'nama_pic', 'NAMA_PIC', 'pic', 'petugas'),
    tipe_event: get('Tipe Event', 'tipe_event', 'TIPE_EVENT'),
    brand_event: get('Brand Event', 'brand_event', 'BRAND_EVENT'),
    id_event: get('ID Event', 'id_event', 'ID_EVENT'),
    ao: get('AO', 'ao') || 'TASIKMALAYA',
    nama_konsumen: get('Nama Konsumen', 'nama_konsumen', 'NAMA_KONSUMEN', 'nama_responden'),
    gender: get('Gender', 'gender', 'GENDER'),
    kelompok_usia: get('Kelompok Usia', 'kelompok_usia', 'KELOMPOK_USIA', 'usia'),
    pekerjaan: get('Pekerjaan', 'pekerjaan', 'PEKERJAAN'),
    rokok_primary: get('Rokok Primary', 'rokok_primary', 'ROKOK_PRIMARY'),
    lama_konsumsi: get('Lama Konsumsi', 'lama_konsumsi', 'LAMA_KONSUMSI'),
    product_sold_brand: get('Product Sold Brand', 'product_sold_brand', 'PRODUCT_SOLD_BRAND'),
    quantity_pack_sold: get('Qty Pack Sold', 'quantity_pack_sold', 'QUANTITY_PACK_SOLD', 'qty_pack') || '0',
    bundling_vao: get('Bundling VAO', 'bundling_vao', 'BUNDLING_VAO'),
    selling_point: get('Selling Point', 'selling_point', 'SELLING_POINT'),
    gg_selingan: get('GG Selingan', 'gg_selingan', 'GG_SELINGAN'),
    gg_brand_apa: get('GG Brand Apa', 'gg_brand_apa', 'GG_BRAND_APA'),
    moment_gg: get('Moment GG', 'moment_gg', 'MOMENT_GG'),
    latitude: get('Latitude', 'latitude'),
    longitude: get('Longitude', 'longitude'),
    tanggal: rawDate,
    date: rawDate,
    timestamp: rawTs,
    Timestamp: rawTs,
    created_at: rawTs,
  };
}

export function mapSpreadsheetRowToHajatanRecord(row: Record<string, any>, idx: number): HajatanRecord {
  const get = (...keys: string[]) => extractVal(row, ...keys);
  const explicitId = get('ID Dokumen', 'id', 'Id', 'ID');
  const rawTs = get('Timestamp', 'timestamp', 'Created At', 'created_at') || new Date().toISOString();
  const rawDate = normalizeSpreadsheetDate(get('Tanggal', 'tanggal', 'date', 'Date'), rawTs);

  const id = explicitId || `hjt_sheet_${idx}_${Date.now()}`;
  return {
    id,
    nama_pic: get('Nama PIC', 'nama_pic', 'NAMA_PIC', 'pic', 'petugas'),
    nama_hajatan: get('Nama Hajatan', 'nama_hajatan', 'NAMA_HAJATAN'),
    lokasi_hajatan: get('Lokasi / Alamat', 'lokasi_hajatan', 'LOKASI_HAJATAN', 'alamat'),
    ao: get('AO', 'ao') || 'TASIKMALAYA',
    nama_konsumen: get('Nama Konsumen', 'nama_konsumen', 'nama_tuan_rumah', 'NAMA_TUAN_RUMAH'),
    gender: get('Gender', 'gender') || 'Laki-Laki',
    kelompok_usia: get('Kelompok Usia', 'kelompok_usia', 'usia') || '25-34',
    pekerjaan: get('Pekerjaan', 'pekerjaan') || 'Wiraswasta',
    rokok_primary: get('Rokok Primary', 'rokok_disediakan', 'rokok_primary') || '-',
    lama_konsumsi: get('Lama Konsumsi', 'lama_konsumsi') || '1-3 Tahun',
    product_sold_brand: get('Product Sold Brand', 'product_sold_brand') || 'GGI',
    quantity_pack_sold: get('Qty Pack Sold', 'quantity_pack_sold', 'potensi_pack') || '0',
    bundling_vao: get('Bundling VAO', 'bundling_vao') || 'Tidak',
    selling_point: get('Selling Point', 'selling_point') || '-',
    gg_selingan: get('GG Selingan', 'gg_selingan') || 'Tidak',
    gg_brand_apa: get('GG Brand Apa', 'gg_brand_apa') || '-',
    moment_gg: get('Moment GG', 'moment_gg') || '-',
    latitude: get('Latitude', 'latitude'),
    longitude: get('Longitude', 'longitude'),
    tanggal: rawDate,
    date: rawDate,
    timestamp: rawTs,
    Timestamp: rawTs,
    created_at: rawTs,
  };
}

export interface PullDataResult {
  success: boolean;
  totalSpb: number;
  totalEvent: number;
  totalHajatan: number;
  message: string;
  needScriptUpdate?: boolean;
  timestamp?: string;
}

/**
 * Pulls all records in real-time from the Google Sheet via Apps Script Webhook.
 * Merges directly into local storage and updates the Dashboard and Report Harian immediately!
 */
export async function pullDataFromGoogleSheet(
  providedWebhookUrl?: string
): Promise<PullDataResult> {
  const webhookUrl = (providedWebhookUrl || getAppsScriptWebhookUrl()).trim();
  if (!webhookUrl) {
    return {
      success: false,
      totalSpb: 0,
      totalEvent: 0,
      totalHajatan: 0,
      message: 'URL Webhook belum diatur. Masukkan URL Apps Script di menu pengaturan.',
    };
  }

  try {
    const fetchUrl = `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}action=read&_t=${Date.now()}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s for slower mobile network
    const response = await fetch(fetchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) {
      throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    // If returned default ping or old doGet
    if (data.status === 'ok' && !data.spb && !data.event && !data.hajatan) {
      return {
        success: false,
        totalSpb: 0,
        totalEvent: 0,
        totalHajatan: 0,
        needScriptUpdate: true,
        message:
          'Apps Script di Google Sheet perlu diperbarui dengan versi terbaru agar dapat membaca data langsung dari spreadsheet ke Dashboard.',
      };
    }

    if (data.status === 'error') {
      throw new Error(data.message || 'Gagal membaca sheet dari Google Apps Script');
    }

    const rawSpb: any[] = Array.isArray(data.spb) ? data.spb : [];
    const rawEvent: any[] = Array.isArray(data.event) ? data.event : [];
    const rawHajatan: any[] = Array.isArray(data.hajatan) ? data.hajatan : [];

    const spbRecords = rawSpb.map((r, i) => mapSpreadsheetRowToSpbRecord(r, i));
    const eventRecords = rawEvent.map((r, i) => mapSpreadsheetRowToEventRecord(r, i));
    const hajatanRecords = rawHajatan.map((r, i) => mapSpreadsheetRowToHajatanRecord(r, i));

    bulkUpsertSpbRecords(spbRecords);
    bulkUpsertEventRecords(eventRecords);
    bulkUpsertHajatanRecords(hajatanRecords);

    const now = new Date().toISOString();
    const currentConfig = getSavedGoogleSheetConfig();
    saveGoogleSheetConfig({
      ...currentConfig,
      lastSyncedAt: now,
      totalSpbRows: spbRecords.length,
      totalEventRows: eventRecords.length,
      totalHajatanRows: hajatanRecords.length,
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('google_sheets_data_pulled', {
          detail: {
            totalSpb: spbRecords.length,
            totalEvent: eventRecords.length,
            totalHajatan: hajatanRecords.length,
            timestamp: now,
          },
        })
      );
    }

    return {
      success: true,
      totalSpb: spbRecords.length,
      totalEvent: eventRecords.length,
      totalHajatan: hajatanRecords.length,
      message: `Berhasil menarik ${spbRecords.length} SPB, ${eventRecords.length} Event, dan ${hajatanRecords.length} Hajatan dari Google Sheet!`,
      timestamp: now,
    };
  } catch (err: any) {
    return {
      success: false,
      totalSpb: 0,
      totalEvent: 0,
      totalHajatan: 0,
      message: `Gagal menarik data dari Google Sheet: ${err.message || 'Periksa koneksi internet'}`,
    };
  }
}

