// Server-side geography: Haversine is the authority. The client may show a
// local estimate for instant feedback, but acceptance is decided here.
const EARTH_R_M = 6371000;

/** Great-circle distance in meters between two WGS84 points. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const toRad = (d: number) => (d * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_R_M * Math.asin(Math.sqrt(a));
}

/** Browser GPS under typical classroom conditions is 10–50 m. Above this we
 *  can't honestly compare against a 100 m fence, so the submission waits. */
export const MAX_ACCEPTABLE_ACCURACY_M = 100;

/** Fallback ceiling: a coarse/cached fix up to this accuracy is usable only
 *  as an explicitly-marked approximate zone — never silently. */
export const FALLBACK_MAX_ACCURACY_M = 500;

/** Widened fence for approximate mode: configured radius + the fix's own
 *  error margin, capped so a bad fix can't open the whole campus. */
export const MAX_EFFECTIVE_RADIUS_M = 2000;

export function effectiveRadius(radiusM: number, accuracyM: number, degraded: boolean): number {
	if (!degraded) return radiusM;
	return Math.min(MAX_EFFECTIVE_RADIUS_M, radiusM + Math.max(0, Math.round(accuracyM)));
}

/** Student-side twin: the fence absorbs the host margin and/or the student
 *  margin, whichever side is running approximate. Still capped. */
export function effectiveRadiusFor(
	radiusM: number,
	hostAccuracyM: number,
	hostDegraded: boolean,
	studentAccuracyM: number,
	studentDegraded: boolean
): number {
	return Math.min(
		MAX_EFFECTIVE_RADIUS_M,
		radiusM +
			(hostDegraded ? Math.max(0, Math.round(hostAccuracyM)) : 0) +
			(studentDegraded ? Math.max(0, Math.round(studentAccuracyM)) : 0)
	);
}

export function accuracyOk(accuracyM: number | null | undefined): boolean {
	return typeof accuracyM === 'number' && Number.isFinite(accuracyM) && accuracyM <= MAX_ACCEPTABLE_ACCURACY_M;
}

export const DEFAULT_RADIUS_M = 100;
export const MIN_RADIUS_M = 10;
export const MAX_RADIUS_M = 2000;

export function clampRadius(v: unknown): number {
	const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
	if (!Number.isFinite(n)) return DEFAULT_RADIUS_M;
	return Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, Math.round(n)));
}

export const MIN_CODE_LEN = 4;
export const MAX_CODE_LEN = 8;
export const DEFAULT_CODE_LEN = 6;

export function clampCodeLen(v: unknown): number {
	const n = typeof v === 'string' ? parseInt(v, 10) : typeof v === 'number' ? v : NaN;
	if (!Number.isFinite(n)) return DEFAULT_CODE_LEN;
	return Math.min(MAX_CODE_LEN, Math.max(MIN_CODE_LEN, Math.round(n)));
}
