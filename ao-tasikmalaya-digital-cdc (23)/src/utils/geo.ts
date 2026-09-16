import { KECAMATAN_LOCATIONS, KECAMATAN_NAMES } from '../data/constants';
import { LocationCentroid } from '../types';

export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371 * c;
}

export function findNearestCentroid(
  lat: number,
  lon: number
): {
  kecamatan: string;
  ouCode: 'GRT' | 'TSA';
  regency: string;
  distanceKm: number;
} {
  let minDistance = Infinity;
  let nearest: LocationCentroid = KECAMATAN_LOCATIONS[0];

  for (const loc of KECAMATAN_LOCATIONS) {
    const dist = calculateHaversineDistanceKm(lat, lon, loc.lat, loc.lon);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = loc;
    }
  }

  const matchedName =
    KECAMATAN_NAMES.find(
      (name) => name.toUpperCase() === nearest.name.toUpperCase()
    ) || nearest.name;

  return {
    kecamatan: matchedName,
    ouCode: nearest.ou,
    regency: nearest.regency,
    distanceKm: Math.round(minDistance * 10) / 10,
  };
}

const REGENCY_GENERIC_NAMES = new Set([
  'GARUT',
  'KABUPATEN GARUT',
  'KOTA GARUT',
  'TASIKMALAYA',
  'KABUPATEN TASIKMALAYA',
  'KOTA TASIKMALAYA',
  'CIAMIS',
  'KABUPATEN CIAMIS',
  'BANJAR',
  'KOTA BANJAR',
  'PANGANDARAN',
  'KABUPATEN PANGANDARAN',
  'JAWA BARAT',
  'INDONESIA',
]);

function cleanDistrictName(raw: string): string {
  if (!raw) return '';
  return raw
    .toUpperCase()
    .replace(/^KECAMATAN\s+/, '')
    .replace(/^KEC\.\s+/, '')
    .replace(/^KABUPATEN\s+/, '')
    .replace(/^KAB\.\s+/, '')
    .replace(/^KOTA\s+/, '')
    .replace(/[^A-Z0-9\s]/g, '')
    .trim();
}

function matchKecamatan(raw: string): string | null {
  if (!raw) return null;
  const upperRaw = raw.toUpperCase().trim();
  if (REGENCY_GENERIC_NAMES.has(upperRaw)) return null;

  const cleaned = cleanDistrictName(raw);
  if (!cleaned || REGENCY_GENERIC_NAMES.has(cleaned)) return null;

  // 1. Exact match against known kecamatan list
  const exact = KECAMATAN_NAMES.find((k) => k.toUpperCase() === cleaned);
  if (exact) return exact;

  // 2. Strict whole-word match (e.g. "KECAMATAN TAROGONG KIDUL" -> "TAROGONG KIDUL")
  const wordMatch = KECAMATAN_NAMES.find((k) => {
    const ku = k.toUpperCase();
    return cleaned === ku || cleaned.startsWith(ku + ' ') || cleaned.endsWith(' ' + ku);
  });
  return wordMatch || null;
}

export async function detectLocationFromCoordinates(
  lat: number | string,
  lon: number | string
): Promise<{
  kecamatan: string;
  ouCode: 'GRT' | 'TSA';
  regency: string;
  source: 'gps_reverse_api' | 'gps_nearest_centroid';
  distanceKm?: number;
} | null> {
  const latitude = typeof lat === 'string' ? parseFloat(lat) : lat;
  const longitude = typeof lon === 'string' ? parseFloat(lon) : lon;

  if (
    isNaN(latitude) ||
    isNaN(longitude) ||
    (latitude === 0 && longitude === 0)
  ) {
    return null;
  }

  // 1. Mathematical nearest centroid based on 130+ verified West Java kecamatan centroids
  const nearest = findNearestCentroid(latitude, longitude);

  // 2. Try high-precision reverse geocoding via OpenStreetMap Nominatim
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=id`,
      {
        signal: controller.signal,
        headers: { 'User-Agent': 'Aplikasi-Pelaporan-Sales-Tasik/1.0' },
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      // ONLY check district-level address fields, NEVER city, county, state, or country!
      const candidates: string[] = [
        addr.city_district,
        addr.town,
        addr.district,
        addr.suburb,
        addr.municipality,
      ].filter(Boolean);

      for (const cand of candidates) {
        const matched = matchKecamatan(cand);
        if (matched) {
          const loc = KECAMATAN_LOCATIONS.find(
            (l) => l.name.toUpperCase() === matched.toUpperCase()
          );
          if (loc) {
            // Distance sanity check: must be within 25 km of coordinates
            const dist = calculateHaversineDistanceKm(
              latitude,
              longitude,
              loc.lat,
              loc.lon
            );
            if (dist <= 25) {
              return {
                kecamatan: matched,
                ouCode: loc.ou,
                regency: loc.regency,
                source: 'gps_reverse_api',
                distanceKm: Math.round(dist * 10) / 10,
              };
            }
          }
        }
      }
    }
  } catch {
    // Nominatim fallback
  }

  // 3. Fallback to BigDataCloud (with strict admin level filtering)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=id`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const candidates: string[] = [];

      // ONLY check administrative entries that are explicitly sub-district level (adminLevel 7 or includes 'kecamatan')
      if (Array.isArray(data.localityInfo?.administrative)) {
        for (const admin of data.localityInfo.administrative) {
          const desc = (admin.description || '').toLowerCase();
          const name = admin.name || '';
          if (
            admin.adminLevel === 7 ||
            desc.includes('kecamatan') ||
            desc.includes('sub-district')
          ) {
            candidates.push(name);
          }
        }
      }

      for (const cand of candidates) {
        const matched = matchKecamatan(cand);
        if (matched) {
          const loc = KECAMATAN_LOCATIONS.find(
            (l) => l.name.toUpperCase() === matched.toUpperCase()
          );
          if (loc) {
            const dist = calculateHaversineDistanceKm(
              latitude,
              longitude,
              loc.lat,
              loc.lon
            );
            if (dist <= 25) {
              return {
                kecamatan: matched,
                ouCode: loc.ou,
                regency: loc.regency,
                source: 'gps_reverse_api',
                distanceKm: Math.round(dist * 10) / 10,
              };
            }
          }
        }
      }
    }
  } catch {
    // BigDataCloud fallback
  }

  // 4. Return mathematically closest centroid
  return {
    kecamatan: nearest.kecamatan,
    ouCode: nearest.ouCode,
    regency: nearest.regency,
    source: 'gps_nearest_centroid',
    distanceKm: nearest.distanceKm,
  };
}

export function formatDateTime(dateVal?: any): string {
  if (!dateVal) return '-';
  try {
    let d: Date | null = null;
    if (dateVal instanceof Date) {
      d = dateVal;
    } else if (typeof dateVal === 'object') {
      if (typeof dateVal.toDate === 'function') d = dateVal.toDate();
      else if (typeof dateVal.seconds === 'number')
        d = new Date(dateVal.seconds * 1000);
    } else if (typeof dateVal === 'number') {
      d = new Date(dateVal);
    } else if (typeof dateVal === 'string') {
      const parsed = new Date(dateVal);
      if (!isNaN(parsed.getTime())) d = parsed;
    }
    if (d && !isNaN(d.getTime())) {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${day}/${month}/${year} ${hours}:${minutes}`;
    }
  } catch {
    // fallback
  }
  return String(dateVal);
}

export function getTodayDateString(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  } catch {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export interface DeviceCoordinates {
  latitude: string;
  longitude: string;
  accuracy?: number;
}

/**
 * Robust GPS position fetcher with dual-strategy fallback.
 * First tries high-accuracy GPS (8s timeout), and if it times out or errors on older Android devices,
 * immediately falls back to low-accuracy network geolocation (15s timeout) to ensure compatibility.
 */
export async function getDeviceGPSPosition(): Promise<DeviceCoordinates> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    throw new Error('Browser atau perangkat ini tidak mendukung fitur GPS/Geolocation.');
  }

  const tryGetPosition = (highAccuracy: boolean, timeoutMs: number): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: highAccuracy,
        timeout: timeoutMs,
        maximumAge: highAccuracy ? 30000 : 120000,
      });
    });
  };

  try {
    // Strategy 1: High accuracy for clear GPS satellite fix
    const pos = await tryGetPosition(true, 8000);
    return {
      latitude: pos.coords.latitude.toFixed(6),
      longitude: pos.coords.longitude.toFixed(6),
      accuracy: pos.coords.accuracy,
    };
  } catch {
    // Strategy 2: Graceful fallback for older Android devices or indoor locations
    try {
      const fallbackPos = await tryGetPosition(false, 15000);
      return {
        latitude: fallbackPos.coords.latitude.toFixed(6),
        longitude: fallbackPos.coords.longitude.toFixed(6),
        accuracy: fallbackPos.coords.accuracy,
      };
    } catch (fallbackErr: any) {
      let msg = fallbackErr?.message || 'Gagal membaca koordinat GPS.';
      if (fallbackErr?.code === 1) {
        msg = 'Izin lokasi ditolak. Harap izinkan akses lokasi di pengaturan browser Android Anda.';
      } else if (fallbackErr?.code === 2) {
        msg = 'Sinyal GPS / lokasi tidak tersedia. Pastikan Lokasi/GPS aktif di HP Anda.';
      } else if (fallbackErr?.code === 3) {
        msg = 'Waktu pencarian lokasi habis (timeout). Coba lagi atau pastikan GPS HP aktif.';
      }
      throw new Error(msg);
    }
  }
}

