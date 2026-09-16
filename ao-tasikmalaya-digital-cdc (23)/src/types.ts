export type UserRole = 'user' | 'admin' | null;

export type ActiveTab = 'dashboard' | 'spb' | 'event' | 'hajatan';

export interface SpbSession {
  isLoggedIn: boolean;
  spbName: string;
  loginTime: string;
}

export interface EventSession {
  isLoggedIn: boolean;
  picName: string;
  tipeEvent: string;
  brandEvent: string;
  idEvent: string;
  loginTime: string;
}

export interface HajatanSession {
  isLoggedIn: boolean;
  picName: string;
  namaHajatan: string;
  lokasiHajatan: string;
  loginTime: string;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface SpbRecord {
  id: string;
  nama_spb: string;
  kode_toko: string;
  nama_toko: string;
  ou: string;
  ou_code: string;
  kecamatan: string;
  ro: string;
  ao: string;
  nama_responden: string;
  umur: string;
  pengeluaran_rata: string;
  pengeluaran_maks: string;
  berkenan_hp: string;
  no_hp: string;
  brand_utama: string;
  brand_sebelumnya: string;
  brand_rutin_lain: string | string[];
  brand_selingan: string | string[];
  pernah_beli_ggi: string;
  kerapihan_batang: number;
  tembakau_mulut: number;
  konsistensi_tarikan: number;
  minat_16rb: string;
  frekuensi_beli: string;
  beli_gg: string;
  qty_gg: string;
  bundling_garpit: string;
  bundling_lighter: string;
  mantan_perokok_gg: string;
  brand_gg_dulu: string;
  alasan_pindah: string;
  latitude: string;
  longitude: string;
  tanggal: string;
  date?: string;
  timestamp: string;
  created_at?: string;
  Timestamp?: string;
  [key: string]: any;
}

export interface EventRecord {
  id: string;
  nama_pic: string;
  tipe_event: string;
  brand_event: string;
  id_event: string;
  ao: string;
  nama_konsumen: string;
  gender: string;
  kelompok_usia: string;
  usia?: string;
  pekerjaan: string;
  rokok_primary: string;
  lama_konsumsi: string;
  product_sold_brand: string;
  quantity_pack_sold: string;
  qty_pack?: string;
  bundling_vao: string;
  selling_point: string;
  gg_selingan: string;
  gg_brand_apa: string;
  moment_gg: string;
  latitude: string;
  longitude: string;
  tanggal: string;
  date?: string;
  timestamp: string;
  created_at?: string;
  Timestamp?: string;
  [key: string]: any;
}

export interface HajatanRecord {
  id: string;
  nama_pic: string;
  nama_hajatan: string;
  lokasi_hajatan: string;
  ao: string;
  nama_konsumen: string;
  gender: string;
  kelompok_usia: string;
  usia?: string;
  pekerjaan: string;
  rokok_primary: string;
  lama_konsumsi: string;
  product_sold_brand: string;
  quantity_pack_sold: string;
  qty_pack?: string;
  bundling_vao: string;
  selling_point: string;
  gg_selingan: string;
  gg_brand_apa: string;
  moment_gg: string;
  latitude: string;
  longitude: string;
  tanggal: string;
  date?: string;
  timestamp: string;
  created_at?: string;
  Timestamp?: string;
  [key: string]: any;
}

export interface LocationCentroid {
  name: string;
  lat: number;
  lon: number;
  ou: 'GRT' | 'TSA';
  regency: string;
}

export interface SummaryStats {
  consumerContact: number;
  trialPerson: number;
  totalSelling: number;
}

export interface SurveyRunningDetail {
  spb: {
    isRunning: boolean;
    contactCount: number;
    trialCount: number;
    sellingCount: number;
    activePersonnel: string[];
    activeLocations: string[];
  };
  event: {
    isRunning: boolean;
    contactCount: number;
    trialCount: number;
    sellingCount: number;
    activeEvents: string[];
    activePersonnel: string[];
  };
  hajatan: {
    isRunning: boolean;
    contactCount: number;
    trialCount: number;
    sellingCount: number;
    activeHajatan: string[];
    activePersonnel: string[];
  };
}

export interface AllSummaryStats {
  spb: SummaryStats;
  event: SummaryStats;
  hajatan: SummaryStats;
  isLoading: boolean;
  filterDate?: string;
  isAllDates?: boolean;
  runningDetail?: SurveyRunningDetail;
}
