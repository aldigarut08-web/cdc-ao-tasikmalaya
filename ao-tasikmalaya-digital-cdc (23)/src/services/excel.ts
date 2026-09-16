import * as XLSX from 'xlsx';
import { EventRecord, HajatanRecord, SpbRecord } from '../types';
import { getEventRecords, getHajatanRecords, getSpbRecords } from './storage';

export function mapSpbToExcelRows(records: SpbRecord[]) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((e) => e && typeof e === 'object')
    .map((e, t) => ({
      No: t + 1,
      'ID Dokumen': e.id || '',
      Timestamp: e.Timestamp || e.timestamp || e.created_at || '',
      Tanggal:
        e.tanggal ||
        e.date ||
        (e.timestamp ? String(e.timestamp).split('T')[0] : ''),
      'Nama SPB': e.nama_spb || e.NAMA_SPB || e.nama_pic || e.NAMA_PIC || '',
      'Kode Toko': e.kode_toko || e.KODE_TOKO || '',
      'Nama Toko': e.nama_toko || e.NAMA_TOKO || '',
      RO: e.ro || e.RO || 'BANDUNG',
      AO: e.ao || e.AO || 'TASIKMALAYA',
      'OU Code': e.ou_code || e.OU_CODE || (e.ou === 'GRT' ? 'GRT' : 'TSA'),
      'OU / Kecamatan': e.ou || e.OU || e.kecamatan || '',
      'Nama Responden':
        e.nama_responden || e.NAMA_RESPONDEN || e.nama_konsumen || '',
      Umur: e.umur || e.UMUR || '',
      'Pengeluaran Rata-Rata': e.pengeluaran_rata || e.PENGELUARAN_RATA || '',
      'Pengeluaran Maksimal': e.pengeluaran_maks || e.PENGELUARAN_MAKS || '',
      'Berkenan No HP': e.berkenan_hp || e.BERKENAN_HP || '',
      'No HP': e.no_hp || e.NO_HP || '',
      'Brand Utama': e.brand_utama || e.BRAND_UTAMA || '',
      'Brand Sebelumnya': e.brand_sebelumnya || e.BRAND_SEBELUMNYA || '',
      'Brand Rutin Lain': Array.isArray(e.brand_rutin_lain)
        ? e.brand_rutin_lain.join(', ')
        : e.brand_rutin_lain || '',
      'Brand Selingan': Array.isArray(e.brand_selingan)
        ? e.brand_selingan.join(', ')
        : e.brand_selingan || '',
      'Pernah Beli GGI': e.pernah_beli_ggi || e.PERNAH_BELI_GGI || '',
      'Kerapihan Batang': e.kerapihan_batang ?? '',
      'Tembakau Mulut': e.tembakau_mulut ?? '',
      'Konsistensi Tarikan': e.konsistensi_tarikan ?? '',
      'Minat 16rb': e.minat_16rb || e.MINAT_16RB || '',
      'Frekuensi Beli': e.frekuensi_beli || e.FREKUENSI_BELI || '',
      'Beli GG': e.beli_gg || e.BELI_GG || '',
      'Qty GG (Pack)':
        e.qty_gg || e.QTY_GG || e.bungkus_gg || e.quantity_pack_sold || '0',
      'Bundling Garpit': e.bundling_garpit || e.BUNDLING_GARPIT || '',
      'Bundling Lighter':
        e.bundling_lighter ||
        (e as any)['Bundling Lighter'] ||
        (e as any).BUNDLING_LIGHTER ||
        '',
      'Mantan Perokok GG': e.mantan_perokok_gg || e.MANTAN_PEROKOK_GG || '',
      'Brand GG Dulu': e.brand_gg_dulu || e.BRAND_GG_DULU || '',
      'Alasan Pindah': e.alasan_pindah || e.ALASAN_PINDAH || '',
      Latitude: e.latitude || e.LATITUDE || '',
      Longitude: e.longitude || e.LONGITUDE || '',
      'Created At': e.created_at || e.timestamp || '',
    }));
}

export function mapEventToExcelRows(records: EventRecord[]) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((e) => e && typeof e === 'object')
    .map((e, t) => ({
      No: t + 1,
      'ID Dokumen': e.id || '',
      Timestamp: e.timestamp || e.Timestamp || e.created_at || '',
      Tanggal:
        e.date ||
        e.Date ||
        (e.timestamp ? String(e.timestamp).split('T')[0] : ''),
      'Nama PIC': e.nama_pic || e.NAMA_PIC || e.pic || e.PIC || '',
      'Tipe Event': e.tipe_event || e.TIPE_EVENT || '',
      'Brand Event': e.brand_event || e.BRAND_EVENT || '',
      'ID Event': e.id_event || e.ID_EVENT || '',
      AO: e.ao || e.AO || 'TASIKMALAYA',
      'Nama Konsumen':
        e.nama_konsumen || e.NAMA_KONSUMEN || e.nama_responden || '',
      Gender: e.gender || e.GENDER || '',
      'Kelompok Usia':
        e.kelompok_usia || e.KELOMPOK_USIA || e.usia || e.USIA || '',
      Pekerjaan: e.pekerjaan || e.PEKERJAAN || '',
      'Rokok Primary': e.rokok_primary || e.ROKOK_PRIMARY || '',
      'Lama Konsumsi': e.lama_konsumsi || e.LAMA_KONSUMSI || '',
      'Product Sold Brand': e.product_sold_brand || e.PRODUCT_SOLD_BRAND || '',
      'Qty Pack Sold':
        e.quantity_pack_sold ||
        e.QUANTITY_PACK_SOLD ||
        e.qty_pack ||
        e.QTY_PACK ||
        '0',
      'Bundling VAO': e.bundling_vao || e.BUNDLING_VAO || '',
      'Selling Point': e.selling_point || e.SELLING_POINT || '',
      'GG Selingan': e.gg_selingan || e.GG_SELINGAN || '',
      'GG Brand Apa': e.gg_brand_apa || e.GG_BRAND_APA || '',
      'Moment GG': e.moment_gg || e.MOMENT_GG || '',
      Latitude: e.latitude || e.LATITUDE || '',
      Longitude: e.longitude || e.LONGITUDE || '',
      'Created At': e.created_at || e.timestamp || '',
    }));
}

export function mapHajatanToExcelRows(records: HajatanRecord[]) {
  if (!Array.isArray(records)) return [];
  return records
    .filter((e) => e && typeof e === 'object')
    .map((e, t) => ({
      No: t + 1,
      'ID Dokumen': e.id || '',
      Timestamp: e.timestamp || e.Timestamp || e.created_at || '',
      Tanggal:
        e.date ||
        e.Date ||
        (e.timestamp ? String(e.timestamp).split('T')[0] : ''),
      'Nama PIC': e.nama_pic || e.NAMA_PIC || '',
      'Nama Hajatan': e.nama_hajatan || e.NAMA_HAJATAN || '',
      'Lokasi Hajatan': e.lokasi_hajatan || e.LOKASI_HAJATAN || '',
      AO: e.ao || e.AO || 'TASIKMALAYA',
      'Nama Konsumen': e.nama_konsumen || e.NAMA_KONSUMEN || '',
      Gender: e.gender || e.GENDER || '',
      Usia: e.usia || e.USIA || '',
      Pekerjaan: e.pekerjaan || e.PEKERJAAN || '',
      'Rokok Primary': e.rokok_primary || e.ROKOK_PRIMARY || '',
      'Lama Konsumsi': e.lama_konsumsi || e.LAMA_KONSUMSI || '',
      'Product Sold Brand': e.product_sold_brand || e.PRODUCT_SOLD_BRAND || '',
      'Qty Pack Sold':
        e.quantity_pack_sold || e.QUANTITY_PACK_SOLD || e.qty_pack || '0',
      'Bundling VAO': e.bundling_vao || e.BUNDLING_VAO || '',
      'Selling Point': e.selling_point || e.SELLING_POINT || '',
      'GG Selingan': e.gg_selingan || e.GG_SELINGAN || '',
      'GG Brand Apa': e.gg_brand_apa || e.GG_BRAND_APA || '',
      'Moment GG': e.moment_gg || e.MOMENT_GG || '',
      Latitude: e.latitude || e.LATITUDE || '',
      Longitude: e.longitude || e.LONGITUDE || '',
      'Created At': e.created_at || e.timestamp || '',
    }));
}

function saveWorkbook(workbook: XLSX.WorkBook, fileName: string) {
  XLSX.writeFile(workbook, fileName);
}

export async function exportAllDatabase(customFileName?: string): Promise<{
  totalSPB: number;
  totalEvent: number;
  totalHajatan: number;
  totalOverall: number;
  fileName: string;
}> {
  const [spb, event, hajatan] = await Promise.all([
    getSpbRecords(),
    getEventRecords(),
    getHajatanRecords(),
  ]);

  const dateStr = new Date().toISOString().split('T')[0];
  const fileName =
    customFileName ||
    `Database_CDC_AO_Tasikmalaya_Lengkap_${dateStr}.xlsx`;

  const wb = XLSX.utils.book_new();

  // Sheet 1: TRACKING SPB
  const wsSPB = XLSX.utils.json_to_sheet(mapSpbToExcelRows(spb));
  XLSX.utils.book_append_sheet(wb, wsSPB, 'TRACKING SPB');

  // Sheet 2: CDC FP SPB
  const wsEvent = XLSX.utils.json_to_sheet(mapEventToExcelRows(event));
  XLSX.utils.book_append_sheet(wb, wsEvent, 'CDC FP SPB');

  // Sheet 3: HAJATAN EVENT
  const wsHajatan = XLSX.utils.json_to_sheet(mapHajatanToExcelRows(hajatan));
  XLSX.utils.book_append_sheet(wb, wsHajatan, 'HAJATAN EVENT');

  saveWorkbook(wb, fileName);

  return {
    totalSPB: spb.length,
    totalEvent: event.length,
    totalHajatan: hajatan.length,
    totalOverall: spb.length + event.length + hajatan.length,
    fileName,
  };
}

export async function exportSPBExcel(
  records?: SpbRecord[],
  customFileName?: string
): Promise<{ total: number; fileName: string }> {
  const data = records || (await getSpbRecords());
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName =
    customFileName || `Tracking_SPB_Database_${dateStr}.xlsx`;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(mapSpbToExcelRows(data));
  XLSX.utils.book_append_sheet(wb, ws, 'TRACKING SPB');

  saveWorkbook(wb, fileName);
  return { total: data.length, fileName };
}

export async function exportEventExcel(
  records?: EventRecord[],
  customFileName?: string
): Promise<{ total: number; fileName: string }> {
  const data = records || (await getEventRecords());
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName =
    customFileName || `CDC_FP_Event_Database_${dateStr}.xlsx`;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(mapEventToExcelRows(data));
  XLSX.utils.book_append_sheet(wb, ws, 'CDC FP SPB');

  saveWorkbook(wb, fileName);
  return { total: data.length, fileName };
}

export function exportEventSummaryExcel(
  summaryList: Array<{
    name: string;
    events: string[];
    contact: number;
    trial: number;
    pack: number;
  }>,
  targetDate?: string,
  allDates?: boolean
): { total: number; fileName: string } {
  const dateStr = allDates
    ? 'Seluruh_Tanggal'
    : targetDate || new Date().toISOString().split('T')[0];
  const fileName = `Rekap_Harian_CDC_FP_PIC_${dateStr}.xlsx`;
  const wb = XLSX.utils.book_new();
  const rows = summaryList.map((item, idx) => ({
    No: idx + 1,
    'Nama PIC': item.name,
    'ID Event / Brand': item.events.join(', ') || '-',
    'Consumer Contact': item.contact,
    'Trial Person': item.trial,
    'Penjualan (Pack)': item.pack,
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'REKAP PIC CDC FP');
  saveWorkbook(wb, fileName);
  return { total: summaryList.length, fileName };
}

export async function exportHajatanExcel(
  records?: HajatanRecord[],
  customFileName?: string
): Promise<{ total: number; fileName: string }> {
  const data = records || (await getHajatanRecords());
  const dateStr = new Date().toISOString().split('T')[0];
  const fileName =
    customFileName || `Hajatan_Event_Database_${dateStr}.xlsx`;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(mapHajatanToExcelRows(data));
  XLSX.utils.book_append_sheet(wb, ws, 'HAJATAN EVENT');

  saveWorkbook(wb, fileName);
  return { total: data.length, fileName };
}
