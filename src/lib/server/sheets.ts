// Google Sheets export — server-only, zero extra dependencies.
// Service-account JWT (RS256, node:crypto) → OAuth access token → Sheets
// REST `values.update`. Deliberately NOT the `googleapis` mega-package:
// it OOMs typechecking and busts the 512 MB server budget for one call.
// Credentials never touch the client. Overwrites one tab per export
// (idempotent: re-exporting never duplicates rows).
import { createSign } from 'node:crypto';
import { reportSheetValues, type SessionReport } from './report-store.js';

export function sheetsConfigured(): boolean {
	return !!process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
}

type ServiceAccount = { client_email?: string; private_key?: string };

function loadCredentials(): ServiceAccount {
	const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
	if (!raw) {
		throw new Error(
			'Sheets export is not configured. Add GOOGLE_SERVICE_ACCOUNT_JSON (and optionally GOOGLE_SHEET_ID) to the server environment first.'
		);
	}
	try {
		return JSON.parse(raw) as ServiceAccount;
	} catch {
		throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.');
	}
}

const b64url = (input: string | Buffer): string =>
	Buffer.from(input).toString('base64url');

/** Mint an OAuth access token from the service-account key. */
async function accessToken(creds: ServiceAccount): Promise<string> {
	if (!creds.client_email || !creds.private_key) {
		throw new Error('Service-account JSON is missing client_email or private_key.');
	}
	const now = Math.floor(Date.now() / 1000);
	const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
	const claims = b64url(
		JSON.stringify({
			iss: creds.client_email,
			sub: creds.client_email,
			aud: 'https://oauth2.googleapis.com/token',
			iat: now,
			exp: now + 3600,
			scope: 'https://www.googleapis.com/auth/spreadsheets'
		})
	);
	const signer = createSign('RSA-SHA256');
	signer.update(`${header}.${claims}`);
	const signature = signer.sign(creds.private_key.replace(/\\n/g, '\n'), 'base64url');
	const res = await fetch('https://oauth2.googleapis.com/token', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
			assertion: `${header}.${claims}.${signature}`
		})
	});
	if (!res.ok) throw new Error(`Google auth refused the service key (${res.status}).`);
	const body = (await res.json()) as { access_token?: string; error_description?: string };
	if (!body.access_token) throw new Error(body.error_description ?? 'Google auth gave no token.');
	return body.access_token;
}

/** Write the report into the spreadsheet; returns the sheet URL. */
export async function exportReportToSheet(report: SessionReport, spreadsheetId?: string): Promise<string> {
	const id = (spreadsheetId || process.env.GOOGLE_SHEET_ID || '').trim();
	if (!id) {
		throw new Error('No spreadsheet selected. Paste a Spreadsheet ID or set GOOGLE_SHEET_ID on the server.');
	}
	const token = await accessToken(loadCredentials());
	const tab = `Attendit ${report.session.id.slice(0, 8)}`;
	const res = await fetch(
		`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}/values/${encodeURIComponent(`${tab}!A1`)}?valueInputOption=USER_ENTERED`,
		{
			method: 'PUT',
			headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
			body: JSON.stringify({ values: reportSheetValues(report) })
		}
	);
	if (!res.ok) {
		if (res.status === 403 || res.status === 404) {
			throw new Error(
				'Google rejected the write. Check the Spreadsheet ID and share the sheet with the service-account email as Editor.'
			);
		}
		throw new Error(`Sheets export failed (HTTP ${res.status}).`);
	}
	return `https://docs.google.com/spreadsheets/d/${id}`;
}
