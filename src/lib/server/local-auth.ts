// Local-dev auth: email + scrypt-hashed password, opaque session tokens in SQLite.
// Mirrors the shape Supabase gives us (user id + email) so the rest of the app
// doesn't care which backend answered. Production uses Supabase Auth.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { localDb } from './local-db.js';

export const LOCAL_SESSION_COOKIE = 'attendit_local_session';
const SESSION_DAYS = 30;

export type LocalUser = { id: string; email: string };

function hashPassword(password: string, salt: string): string {
	return scryptSync(password, salt, 64).toString('hex');
}

export function localSignUp(email: string, password: string): LocalUser {
	const d = localDb();
	const existing = d.prepare(`SELECT id FROM users WHERE email = ?`).get(email) as
		| { id: string }
		| undefined;
	if (existing) throw new Error('An account with this email already exists. Try signing in.');
	const id = randomUUID();
	const salt = randomBytes(16).toString('hex');
	const hash = hashPassword(password, salt);
	d.prepare(`INSERT INTO users (id, email, hash, salt) VALUES (?, ?, ?, ?)`).run(
		id,
		email,
		hash,
		salt
	);
	d.prepare(`INSERT INTO profiles (id, email) VALUES (?, ?)`).run(id, email);
	return { id, email };
}

export function localSignIn(email: string, password: string): LocalUser {
	const d = localDb();
	const row = d.prepare(`SELECT id, email, hash, salt FROM users WHERE email = ?`).get(email) as
		| { id: string; email: string; hash: string; salt: string }
		| undefined;
	if (!row) throw new Error('Email or password is incorrect. Try again or create an account.');
	const attempt = scryptSync(password, row.salt, 64);
	const expected = Buffer.from(row.hash, 'hex');
	if (attempt.length !== expected.length || !timingSafeEqual(attempt, expected)) {
		throw new Error('Email or password is incorrect. Try again or create an account.');
	}
	return { id: row.id, email: row.email };
}

export function localCreateSession(userId: string): { token: string; expiresAt: Date } {
	const d = localDb();
	const token = randomBytes(32).toString('hex');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
	d.prepare(
		`INSERT INTO local_sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
	).run(token, userId, expiresAt.toISOString());
	return { token, expiresAt };
}

export function localGetUser(token: string | undefined): LocalUser | null {
	if (!token) return null;
	const d = localDb();
	const row = d
		.prepare(
			`SELECT u.id, u.email, s.expires_at AS expires_at
			 FROM local_sessions s JOIN users u ON u.id = s.user_id
			 WHERE s.token = ?`
		)
		.get(token) as { id: string; email: string; expires_at: string } | undefined;
	if (!row) return null;
	if (new Date(row.expires_at).getTime() < Date.now()) {
		d.prepare(`DELETE FROM local_sessions WHERE token = ?`).run(token);
		return null;
	}
	return { id: row.id, email: row.email };
}

export function localDestroySession(token: string | undefined): void {
	if (!token) return;
	localDb().prepare(`DELETE FROM local_sessions WHERE token = ?`).run(token);
}

export function localChangePassword(userId: string, currentPassword: string, nextPassword: string): void {
	const d = localDb();
	const row = d.prepare(`SELECT id, hash, salt FROM users WHERE id = ?`).get(userId) as
		| { id: string; hash: string; salt: string }
		| undefined;
	if (!row) throw new Error('Account not found. Sign in again.');
	const attempt = scryptSync(currentPassword, row.salt, 64);
	const expected = Buffer.from(row.hash, 'hex');
	if (attempt.length !== expected.length || !timingSafeEqual(attempt, expected)) {
		throw new Error('Current password is incorrect.');
	}
	const salt = randomBytes(16).toString('hex');
	d.prepare(`UPDATE users SET hash = ?, salt = ? WHERE id = ?`).run(
		hashPassword(nextPassword, salt),
		salt,
		userId
	);
}
