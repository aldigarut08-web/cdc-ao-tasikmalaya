import {
  AllSummaryStats,
  EventRecord,
  HajatanRecord,
  SpbRecord,
} from '../types';
import { safeGetItem, safeSetItem, safeRemoveItem } from '../utils/polyfills';

const SPB_CACHE_KEY = 'spb_records_cache';
const SPB_ALT_KEYS = ['spb_records', 'spb_survey_cache'];

const EVENT_CACHE_KEY = 'event_records_cache';
const EVENT_ALT_KEYS = ['event_records', 'event_survey_cache'];

const HAJATAN_CACHE_KEY = 'hajatan_records_cache';
const HAJATAN_ALT_KEYS = ['hajatan_records', 'hajatan_survey_cache'];

// In-memory cache for ultra-fast, zero-overhead access within current session
let memorySpbCache: SpbRecord[] | null = null;
let memoryEventCache: EventRecord[] | null = null;
let memoryHajatanCache: HajatanRecord[] | null = null;

// Lightweight IndexedDB helper for large offline storage (>50MB support)
const IDB_NAME = 'ao_tasik_store_v1';
const IDB_STORE = 'collections';

function getIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const request = window.indexedDB.open(IDB_NAME, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getIndexedDB();
    if (!db) return null;
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await getIndexedDB();
    if (!db) return;
    new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB errors
  }
}

function getFromStorage<T>(mainKey: string, altKeys: string[] = []): T[] {
  const keys = [mainKey, ...altKeys];
  const items: any[] = [];
  keys.forEach((key) => {
    try {
      const raw = safeGetItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.data)) {
          items.push(...parsed.data);
        } else if (Array.isArray(parsed)) {
          items.push(...parsed);
        }
      }
    } catch {
      // Ignore parse error
    }
  });
  return deduplicateRecords(items);
}

function saveToStorage<T>(mainKey: string, altKeys: string[] = [], data: T[]): void {
  try {
    const wrapped = JSON.stringify({ timestamp: Date.now(), data });
    safeSetItem(mainKey, wrapped);
    // Remove redundant copies from altKeys to prevent exceeding the browser's 5MB localStorage limit
    altKeys.forEach((k) => safeRemoveItem(k));
  } catch {
    // Handled by safeSetItem fallback
  }
  // Also asynchronously persist to IndexedDB for persistent offline storage
  idbSet(mainKey, data);
}

export function deduplicateRecords<T extends Record<string, any>>(records: T[]): T[] {
  const map = new Map<string, T>();
  records.forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const explicitId = (item.id || item['ID Dokumen'] || '').toString().trim();
    const ts = (
      item.Timestamp ||
      item.timestamp ||
      item.tanggal ||
      item.date ||
      item.created_at ||
      ''
    )
      .toString()
      .trim();
    const pic = (
      item.nama_spb ||
      item.NAMA_SPB ||
      item.nama_pic ||
      item.NAMA_PIC ||
      item.pic ||
      ''
    )
      .toString()
      .trim();
    const ident = (
      item.nama_responden ||
      item.nama_konsumen ||
      item.kode_toko ||
      item.nama_toko ||
      item.no_hp ||
      item.id_event ||
      item.nama_hajatan ||
      ''
    )
      .toString()
      .trim();

    // Prefer business composite key (timestamp + pic + identifier) so local and spreadsheet rows merge cleanly
    const compositeKey = ts && pic && ident ? `${ts.slice(0, 16)}_${pic}_${ident}`.toLowerCase() : '';
    const key =
      compositeKey ||
      (explicitId && !explicitId.startsWith('spb_sheet_') && !explicitId.startsWith('evt_sheet_') && !explicitId.startsWith('hjt_sheet_')
        ? explicitId.toLowerCase()
        : ts || pic || ident
        ? `${ts}_${pic}_${ident}`.toLowerCase()
        : explicitId || `rec_${Math.random()}_${Date.now()}`);

    // If existing has fewer fields, overwrite with the more complete one
    if (!map.has(key)) {
      map.set(key, item);
    } else {
      const existing = map.get(key)!;
      map.set(key, { ...existing, ...item });
    }
  });
  return Array.from(map.values());
}

// SPB Storage Functions
export async function getSpbRecords(): Promise<SpbRecord[]> {
  if (memorySpbCache && memorySpbCache.length > 0) {
    return memorySpbCache;
  }
  const fromStorage = getFromStorage<SpbRecord>(SPB_CACHE_KEY, SPB_ALT_KEYS);
  if (fromStorage.length > 0) {
    memorySpbCache = fromStorage;
    return fromStorage;
  }
  const fromIdb = await idbGet<SpbRecord[]>(SPB_CACHE_KEY);
  if (Array.isArray(fromIdb) && fromIdb.length > 0) {
    memorySpbCache = fromIdb;
    return fromIdb;
  }
  return [];
}

export async function saveSpbRecord(
  record: Omit<SpbRecord, 'id'> & { id?: string }
): Promise<{ success: boolean; id: string }> {
  const now = new Date().toISOString();
  const id = record.id || `spb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fullRecord: SpbRecord = {
    ...record,
    id,
    created_at: record.created_at || record.timestamp || now,
    timestamp: record.timestamp || now,
    Timestamp: record.Timestamp || now,
  } as SpbRecord;

  const current = memorySpbCache && memorySpbCache.length > 0
    ? memorySpbCache
    : getFromStorage<SpbRecord>(SPB_CACHE_KEY, SPB_ALT_KEYS);
  const updated = [fullRecord, ...current.filter((r) => r.id !== id)];
  memorySpbCache = updated;
  saveToStorage(SPB_CACHE_KEY, SPB_ALT_KEYS, updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('spb_records_updated', { detail: updated })
    );
  }

  return { success: true, id };
}

// Event Storage Functions
export async function getEventRecords(): Promise<EventRecord[]> {
  if (memoryEventCache && memoryEventCache.length > 0) {
    return memoryEventCache;
  }
  const fromStorage = getFromStorage<EventRecord>(EVENT_CACHE_KEY, EVENT_ALT_KEYS);
  if (fromStorage.length > 0) {
    memoryEventCache = fromStorage;
    return fromStorage;
  }
  const fromIdb = await idbGet<EventRecord[]>(EVENT_CACHE_KEY);
  if (Array.isArray(fromIdb) && fromIdb.length > 0) {
    memoryEventCache = fromIdb;
    return fromIdb;
  }
  return [];
}

export async function saveEventRecord(
  record: Omit<EventRecord, 'id'> & { id?: string }
): Promise<{ success: boolean; id: string }> {
  const now = new Date().toISOString();
  const id = record.id || `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fullRecord: EventRecord = {
    ...record,
    id,
    created_at: record.created_at || record.timestamp || now,
    timestamp: record.timestamp || now,
    Timestamp: record.Timestamp || now,
  } as EventRecord;

  const current = memoryEventCache && memoryEventCache.length > 0
    ? memoryEventCache
    : getFromStorage<EventRecord>(EVENT_CACHE_KEY, EVENT_ALT_KEYS);
  const updated = [fullRecord, ...current.filter((r) => r.id !== id)];
  memoryEventCache = updated;
  saveToStorage(EVENT_CACHE_KEY, EVENT_ALT_KEYS, updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('event_records_updated', { detail: updated })
    );
  }

  return { success: true, id };
}

// Hajatan Storage Functions
export async function getHajatanRecords(): Promise<HajatanRecord[]> {
  if (memoryHajatanCache && memoryHajatanCache.length > 0) {
    return memoryHajatanCache;
  }
  const fromStorage = getFromStorage<HajatanRecord>(HAJATAN_CACHE_KEY, HAJATAN_ALT_KEYS);
  if (fromStorage.length > 0) {
    memoryHajatanCache = fromStorage;
    return fromStorage;
  }
  const fromIdb = await idbGet<HajatanRecord[]>(HAJATAN_CACHE_KEY);
  if (Array.isArray(fromIdb) && fromIdb.length > 0) {
    memoryHajatanCache = fromIdb;
    return fromIdb;
  }
  return [];
}

export async function saveHajatanRecord(
  record: Omit<HajatanRecord, 'id'> & { id?: string }
): Promise<{ success: boolean; id: string }> {
  const now = new Date().toISOString();
  const id = record.id || `hjt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const fullRecord: HajatanRecord = {
    ...record,
    id,
    created_at: record.created_at || record.timestamp || now,
    timestamp: record.timestamp || now,
    Timestamp: record.Timestamp || now,
  } as HajatanRecord;

  const current = memoryHajatanCache && memoryHajatanCache.length > 0
    ? memoryHajatanCache
    : getFromStorage<HajatanRecord>(HAJATAN_CACHE_KEY, HAJATAN_ALT_KEYS);
  const updated = [fullRecord, ...current.filter((r) => r.id !== id)];
  memoryHajatanCache = updated;
  saveToStorage(HAJATAN_CACHE_KEY, HAJATAN_ALT_KEYS, updated);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hajatan_records_updated', { detail: updated })
    );
  }

  return { success: true, id };
}

// Bulk upsert functions for syncing records from Google Sheets
export function bulkUpsertSpbRecords(newRecords: SpbRecord[]): SpbRecord[] {
  if (!Array.isArray(newRecords) || newRecords.length === 0) {
    return memorySpbCache || getFromStorage<SpbRecord>(SPB_CACHE_KEY, SPB_ALT_KEYS);
  }
  const current = memorySpbCache && memorySpbCache.length > 0
    ? memorySpbCache
    : getFromStorage<SpbRecord>(SPB_CACHE_KEY, SPB_ALT_KEYS);
  const combined = deduplicateRecords([...newRecords, ...current]);
  memorySpbCache = combined;
  saveToStorage(SPB_CACHE_KEY, SPB_ALT_KEYS, combined);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('spb_records_updated', { detail: combined })
    );
  }
  return combined;
}

export function bulkUpsertEventRecords(newRecords: EventRecord[]): EventRecord[] {
  if (!Array.isArray(newRecords) || newRecords.length === 0) {
    return memoryEventCache || getFromStorage<EventRecord>(EVENT_CACHE_KEY, EVENT_ALT_KEYS);
  }
  const current = memoryEventCache && memoryEventCache.length > 0
    ? memoryEventCache
    : getFromStorage<EventRecord>(EVENT_CACHE_KEY, EVENT_ALT_KEYS);
  const combined = deduplicateRecords([...newRecords, ...current]);
  memoryEventCache = combined;
  saveToStorage(EVENT_CACHE_KEY, EVENT_ALT_KEYS, combined);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('event_records_updated', { detail: combined })
    );
  }
  return combined;
}

export function bulkUpsertHajatanRecords(newRecords: HajatanRecord[]): HajatanRecord[] {
  if (!Array.isArray(newRecords) || newRecords.length === 0) {
    return memoryHajatanCache || getFromStorage<HajatanRecord>(HAJATAN_CACHE_KEY, HAJATAN_ALT_KEYS);
  }
  const current = memoryHajatanCache && memoryHajatanCache.length > 0
    ? memoryHajatanCache
    : getFromStorage<HajatanRecord>(HAJATAN_CACHE_KEY, HAJATAN_ALT_KEYS);
  const combined = deduplicateRecords([...newRecords, ...current]);
  memoryHajatanCache = combined;
  saveToStorage(HAJATAN_CACHE_KEY, HAJATAN_ALT_KEYS, combined);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('hajatan_records_updated', { detail: combined })
    );
  }
  return combined;
}

// Helper for date matching across all survey records
export function isDateMatch(
  record: any,
  targetDate?: string,
  isAllDates: boolean = false
): boolean {
  if (isAllDates || !targetDate) return true;
  if (!record || typeof record !== 'object') return false;

  let normalizedTarget = targetDate.trim();
  // Normalize DD/MM/YYYY or DD-MM-YYYY to YYYY-MM-DD
  const dmMatch = normalizedTarget.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmMatch) {
    const [, d, mo, y] = dmMatch;
    normalizedTarget = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const ym = normalizedTarget.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const altDmy = ym ? `${ym[3]}/${ym[2]}/${ym[1]}` : '';
  const altDmyDash = ym ? `${ym[3]}-${ym[2]}-${ym[1]}` : '';
  const altYmdSlash = ym ? `${ym[1]}/${ym[2]}/${ym[3]}` : '';

  const candidates = [
    record.tanggal,
    record.Tanggal,
    record.date,
    record.Date,
    record.timestamp,
    record.Timestamp,
    record.created_at,
    record['Created At'],
  ];

  for (const raw of candidates) {
    if (!raw) continue;
    const s = String(raw).trim();
    if (!s) continue;

    // Direct match or contains
    if (s.includes(normalizedTarget)) return true;
    if (altDmy && s.includes(altDmy)) return true;
    if (altDmyDash && s.includes(altDmyDash)) return true;
    if (altYmdSlash && s.includes(altYmdSlash)) return true;

    // Date prefix before T or space
    const datePrefix = s.split('T')[0].split(' ')[0].trim();
    if (datePrefix === normalizedTarget) return true;

    // Asia/Jakarta timezone check for UTC ISO strings
    try {
      const d = new Date(s);
      if (!isNaN(d.getTime())) {
        const wibDate = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Jakarta',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(d);
        if (wibDate === normalizedTarget) return true;
      }
    } catch {}
  }

  return false;
}

// Calculate summary stats with optional date filter
export async function calculateAllSummary(
  targetDate?: string,
  isAllDates: boolean = false
): Promise<AllSummaryStats> {
  const [allSpb, allEvent, allHajatan] = await Promise.all([
    getSpbRecords(),
    getEventRecords(),
    getHajatanRecords(),
  ]);

  const spbList = isAllDates || !targetDate ? allSpb : allSpb.filter((r) => isDateMatch(r, targetDate, isAllDates));
  const eventList = isAllDates || !targetDate ? allEvent : allEvent.filter((r) => isDateMatch(r, targetDate, isAllDates));
  const hajatanList = isAllDates || !targetDate ? allHajatan : allHajatan.filter((r) => isDateMatch(r, targetDate, isAllDates));

  // SPB Stats
  const spbContact = spbList.length;
  // Trial person: jumlah orang yang melakukan pembelian
  const spbTrial = spbList.filter((d) => {
    const isBeli = (d.beli_gg || (d as any).BELI_GG || '').toString().trim().toUpperCase() === 'YA';
    const qty = parseInt(
      d.qty_gg ||
        (d as any).QTY_GG ||
        d.qty_pack ||
        d.quantity_pack_sold ||
        d.bungkus_gg ||
        '0',
      10
    );
    return isBeli || (!isNaN(qty) && qty > 0);
  }).length;

  // Penjualan (Pack): kuantiti pack yang terjual
  const spbSelling = spbList.reduce((acc, cur) => {
    const qty = parseInt(
      cur.qty_gg ||
        cur.QTY_GG ||
        cur.qty_pack ||
        cur.quantity_pack_sold ||
        cur.bungkus_gg ||
        '0',
      10
    );
    return acc + (isNaN(qty) ? 0 : qty);
  }, 0);

  const activeSpbNames = Array.from(
    new Set(
      spbList
        .map((s) => (s.nama_spb || s.NAMA_SPB || '').trim())
        .filter(Boolean)
    )
  );
  const activeSpbOutlets = Array.from(
    new Set(
      spbList
        .map((s) => (s.nama_toko || s.kode_toko || '').trim())
        .filter(Boolean)
    )
  );

  // Event Stats
  const eventContact = eventList.length;
  // Trial person: jumlah orang yang melakukan pembelian
  const eventTrial = eventList.filter((d) => {
    const qty = parseInt(
      (
        d.quantity_pack_sold ||
        (d as any).QUANTITY_PACK_SOLD ||
        d.quantity_pack ||
        d.qty_pack ||
        (d as any).QTY_PACK ||
        '0'
      ).toString(),
      10
    );
    return !isNaN(qty) && qty > 0;
  }).length;

  // Penjualan (Pack): kuantiti pack yang terjual
  const eventSelling = eventList.reduce((acc, cur) => {
    const qty = parseInt(
      cur.quantity_pack_sold ||
        cur.QUANTITY_PACK_SOLD ||
        cur.quantity_pack ||
        cur.qty_pack ||
        (cur as any).QTY_PACK ||
        '0',
      10
    );
    return acc + (isNaN(qty) ? 0 : qty);
  }, 0);

  const activeEventNames = Array.from(
    new Set(
      eventList
        .map((e) => (e.brand_event || e.id_event || e.tipe_event || '').trim())
        .filter(Boolean)
    )
  );
  const activeEventPics = Array.from(
    new Set(
      eventList
        .map((e) => (e.nama_pic || e.NAMA_PIC || '').trim())
        .filter(Boolean)
    )
  );

  // Hajatan Stats
  const hajatanContact = hajatanList.length;
  // Trial person: jumlah orang yang melakukan pembelian
  const hajatanTrial = hajatanList.filter((d) => {
    const qty = parseInt(
      (
        d.quantity_pack ||
        (d as any).QUANTITY_PACK_SOLD ||
        d.quantity_pack_sold ||
        d.qty_pack ||
        '0'
      ).toString(),
      10
    );
    return !isNaN(qty) && qty > 0;
  }).length;

  // Penjualan (Pack): kuantiti pack yang terjual
  const hajatanSelling = hajatanList.reduce((acc, cur) => {
    const qty = parseInt(
      cur.quantity_pack ||
        cur.QUANTITY_PACK_SOLD ||
        cur.quantity_pack_sold ||
        cur.qty_pack ||
        '0',
      10
    );
    return acc + (isNaN(qty) ? 0 : qty);
  }, 0);

  const activeHajatanNames = Array.from(
    new Set(
      hajatanList
        .map((h) => (h.nama_hajatan || h.lokasi_hajatan || '').trim())
        .filter(Boolean)
    )
  );
  const activeHajatanPics = Array.from(
    new Set(
      hajatanList
        .map((h) => (h.nama_pic || h.NAMA_PIC || '').trim())
        .filter(Boolean)
    )
  );

  return {
    spb: {
      consumerContact: spbContact,
      trialPerson: spbTrial,
      totalSelling: spbSelling,
    },
    event: {
      consumerContact: eventContact,
      trialPerson: eventTrial,
      totalSelling: eventSelling,
    },
    hajatan: {
      consumerContact: hajatanContact,
      trialPerson: hajatanTrial,
      totalSelling: hajatanSelling,
    },
    isLoading: false,
    filterDate: targetDate,
    isAllDates,
    runningDetail: {
      spb: {
        isRunning: spbContact > 0,
        contactCount: spbContact,
        trialCount: spbTrial,
        sellingCount: spbSelling,
        activePersonnel: activeSpbNames,
        activeLocations: activeSpbOutlets,
      },
      event: {
        isRunning: eventContact > 0,
        contactCount: eventContact,
        trialCount: eventTrial,
        sellingCount: eventSelling,
        activeEvents: activeEventNames,
        activePersonnel: activeEventPics,
      },
      hajatan: {
        isRunning: hajatanContact > 0,
        contactCount: hajatanContact,
        trialCount: hajatanTrial,
        sellingCount: hajatanSelling,
        activeHajatan: activeHajatanNames,
        activePersonnel: activeHajatanPics,
      },
    },
  };
}

/**
 * Injects realistic sample SPB survey records for immediate demonstration and verification
 */
export function seedSampleSpbRecords(targetDate?: string): SpbRecord[] {
  const today = targetDate || new Date().toISOString().split('T')[0];
  const sampleList: SpbRecord[] = [
    {
      id: `sample-spb-1-${Date.now()}`,
      nama_spb: 'ANGGUN',
      ou: 'GRT',
      ou_code: 'GRT',
      ro: 'RO GARUT',
      ao: 'AO GARUT',
      regency: 'Garut',
      kecamatan: 'TAROGONG KIDUL',
      nama_toko: 'Toko Berkah Barokah',
      kode_toko: 'GRT-TK-001',
      nama_responden: 'Asep Saepuloh',
      no_hp_responden: '081234567801',
      no_hp: '081234567801',
      berkenan_hp: 'YA',
      umur: '26 - 35 Tahun',
      pengeluaran_rata: 'Rp 20.000 - Rp 30.000',
      pengeluaran_maks: 'Rp 20.000 - Rp 30.000',
      pengeluaran_rokok: 'Rp 20.000 - Rp 30.000',
      brand_utama: 'Gudang Garam International',
      brand_sebelumnya: 'Djarum Super',
      brand_rutin_lain: 'Gudang Garam Merah',
      brand_selingan: 'Sampoerna Mild',
      pernah_beli_ggi: 'YA',
      kerapihan_batang: 4,
      tembakau_mulut: 3,
      tembakau_di_mulut: 'TIDAK',
      konsistensi_tarikan: 4,
      minat_16rb: 'YA',
      frekuensi_beli: 'Setiap Hari',
      beli_gg: 'YA',
      qty_gg: '2',
      bundling_garpit: 'YA',
      bundling_lighter: 'YA',
      mantan_perokok_gg: 'TIDAK',
      brand_gg_dulu: '-',
      alasan_pindah: '-',
      latitude: '-7.2278',
      longitude: '107.9087',
      tanggal: today,
      date: today,
      timestamp: `${today} 09:30:00`,
    },
    {
      id: `sample-spb-2-${Date.now()}`,
      nama_spb: 'ANGGUN',
      ou: 'GRT',
      ou_code: 'GRT',
      ro: 'RO GARUT',
      ao: 'AO GARUT',
      regency: 'Garut',
      kecamatan: 'TAROGONG KIDUL',
      nama_toko: 'Toko Berkah Barokah',
      kode_toko: 'GRT-TK-001',
      nama_responden: 'Dedi Kurniawan',
      no_hp_responden: '081234567802',
      no_hp: '081234567802',
      berkenan_hp: 'YA',
      umur: '18 - 25 Tahun',
      pengeluaran_rata: 'Rp 15.000 - Rp 20.000',
      pengeluaran_maks: 'Rp 15.000 - Rp 20.000',
      pengeluaran_rokok: 'Rp 15.000 - Rp 20.000',
      brand_utama: 'Sampoerna Mild',
      brand_sebelumnya: 'GG Surya 16',
      brand_rutin_lain: '-',
      brand_selingan: '-',
      pernah_beli_ggi: 'YA',
      kerapihan_batang: 5,
      tembakau_mulut: 3,
      tembakau_di_mulut: 'TIDAK',
      konsistensi_tarikan: 4,
      minat_16rb: 'YA',
      frekuensi_beli: '2-3 Hari Sekali',
      beli_gg: 'YA',
      qty_gg: '1',
      bundling_garpit: 'TIDAK',
      bundling_lighter: 'TIDAK',
      mantan_perokok_gg: 'YA',
      brand_gg_dulu: 'GG Surya 16',
      alasan_pindah: 'Ingin rasa lebih ringan',
      latitude: '-7.2280',
      longitude: '107.9090',
      tanggal: today,
      date: today,
      timestamp: `${today} 10:15:00`,
    },
    {
      id: `sample-spb-3-${Date.now()}`,
      nama_spb: 'RINA',
      ou: 'TSA',
      ou_code: 'TSA',
      ro: 'RO TASIKMALAYA',
      ao: 'AO TASIKMALAYA',
      regency: 'Kota Tasikmalaya',
      kecamatan: 'CIHIDEUNG',
      nama_toko: 'Toko Sinar Jaya',
      kode_toko: 'TSA-TK-005',
      nama_responden: 'Bambang Irawan',
      no_hp_responden: '081234567803',
      no_hp: '081234567803',
      berkenan_hp: 'YA',
      umur: '36 - 45 Tahun',
      pengeluaran_rata: 'Rp > 30.000',
      pengeluaran_maks: 'Rp > 30.000',
      pengeluaran_rokok: 'Rp > 30.000',
      brand_utama: 'Djarum Super',
      brand_sebelumnya: 'Gudang Garam International',
      brand_rutin_lain: '-',
      brand_selingan: '-',
      pernah_beli_ggi: 'YA',
      kerapihan_batang: 4,
      tembakau_mulut: 3,
      tembakau_di_mulut: 'TIDAK',
      konsistensi_tarikan: 4,
      minat_16rb: 'YA',
      frekuensi_beli: 'Setiap Hari',
      beli_gg: 'YA',
      qty_gg: '3',
      bundling_garpit: 'YA',
      bundling_lighter: 'YA',
      mantan_perokok_gg: 'TIDAK',
      brand_gg_dulu: '-',
      alasan_pindah: '-',
      latitude: '-7.3274',
      longitude: '108.2207',
      tanggal: today,
      date: today,
      timestamp: `${today} 11:00:00`,
    },
    {
      id: `sample-spb-4-${Date.now()}`,
      nama_spb: 'RINA',
      ou: 'TSA',
      ou_code: 'TSA',
      ro: 'RO TASIKMALAYA',
      ao: 'AO TASIKMALAYA',
      regency: 'Kota Tasikmalaya',
      kecamatan: 'CIHIDEUNG',
      nama_toko: 'Toko Sinar Jaya',
      kode_toko: 'TSA-TK-005',
      nama_responden: 'Hendra Gunawan',
      no_hp_responden: '081234567804',
      no_hp: '081234567804',
      berkenan_hp: 'YA',
      umur: '26 - 35 Tahun',
      pengeluaran_rata: 'Rp 20.000 - Rp 30.000',
      pengeluaran_maks: 'Rp 20.000 - Rp 30.000',
      pengeluaran_rokok: 'Rp 20.000 - Rp 30.000',
      brand_utama: 'Gudang Garam Merah',
      brand_sebelumnya: '-',
      brand_rutin_lain: '-',
      brand_selingan: '-',
      pernah_beli_ggi: 'YA',
      kerapihan_batang: 4,
      tembakau_mulut: 3,
      tembakau_di_mulut: 'TIDAK',
      konsistensi_tarikan: 4,
      minat_16rb: 'YA',
      frekuensi_beli: 'Setiap Hari',
      beli_gg: 'YA',
      qty_gg: '1',
      bundling_garpit: 'YA',
      bundling_lighter: 'TIDAK',
      mantan_perokok_gg: 'TIDAK',
      brand_gg_dulu: '-',
      alasan_pindah: '-',
      latitude: '-7.3276',
      longitude: '108.2209',
      tanggal: today,
      date: today,
      timestamp: `${today} 11:45:00`,
    },
    {
      id: `sample-spb-5-${Date.now()}`,
      nama_spb: 'DEWI LESTARI',
      ou: 'GRT',
      ou_code: 'GRT',
      ro: 'RO GARUT',
      ao: 'AO GARUT',
      regency: 'Garut',
      kecamatan: 'GARUT KOTA',
      nama_toko: 'Warung Madura 88',
      kode_toko: 'GRT-MD-012',
      nama_responden: 'Iman Suherman',
      no_hp_responden: '081234567805',
      no_hp: '081234567805',
      berkenan_hp: 'YA',
      umur: '46 - 55 Tahun',
      pengeluaran_rata: 'Rp 20.000 - Rp 30.000',
      pengeluaran_maks: 'Rp 20.000 - Rp 30.000',
      pengeluaran_rokok: 'Rp 20.000 - Rp 30.000',
      brand_utama: 'Gudang Garam International',
      brand_sebelumnya: '-',
      brand_rutin_lain: '-',
      brand_selingan: '-',
      pernah_beli_ggi: 'YA',
      kerapihan_batang: 5,
      tembakau_mulut: 3,
      tembakau_di_mulut: 'TIDAK',
      konsistensi_tarikan: 4,
      minat_16rb: 'YA',
      frekuensi_beli: 'Setiap Hari',
      beli_gg: 'YA',
      qty_gg: '2',
      bundling_garpit: 'YA',
      bundling_lighter: 'YA',
      mantan_perokok_gg: 'TIDAK',
      brand_gg_dulu: '-',
      alasan_pindah: '-',
      latitude: '-7.2150',
      longitude: '107.9020',
      tanggal: today,
      date: today,
      timestamp: `${today} 13:20:00`,
    },
    {
      id: `sample-spb-6-${Date.now()}`,
      nama_spb: 'SITI MARYAM',
      ou: 'TSA',
      ou_code: 'TSA',
      ro: 'RO TASIKMALAYA',
      ao: 'AO TASIKMALAYA',
      regency: 'Kab. Tasikmalaya',
      kecamatan: 'SINGAPARNA',
      nama_toko: 'Toko Sumber Rezeki',
      kode_toko: 'TSA-TK-022',
      nama_responden: 'Rahmat Hidayat',
      no_hp_responden: '081234567806',
      no_hp: '081234567806',
      berkenan_hp: 'YA',
      umur: '26 - 35 Tahun',
      pengeluaran_rata: 'Rp 20.000 - Rp 30.000',
      pengeluaran_maks: 'Rp 20.000 - Rp 30.000',
      pengeluaran_rokok: 'Rp 20.000 - Rp 30.000',
      brand_utama: 'Djarum Coklat',
      brand_sebelumnya: '-',
      brand_rutin_lain: '-',
      brand_selingan: '-',
      pernah_beli_ggi: 'YA',
      kerapihan_batang: 4,
      tembakau_mulut: 3,
      tembakau_di_mulut: 'TIDAK',
      konsistensi_tarikan: 4,
      minat_16rb: 'YA',
      frekuensi_beli: 'Setiap Hari',
      beli_gg: 'YA',
      qty_gg: '2',
      bundling_garpit: 'YA',
      bundling_lighter: 'TIDAK',
      mantan_perokok_gg: 'TIDAK',
      brand_gg_dulu: '-',
      alasan_pindah: '-',
      latitude: '-7.3520',
      longitude: '108.1150',
      tanggal: today,
      date: today,
      timestamp: `${today} 14:10:00`,
    },
  ];

  return bulkUpsertSpbRecords(sampleList);
}

