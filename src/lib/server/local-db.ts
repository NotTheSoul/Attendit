// Local-dev database. SQLite via node:sqlite — zero new dependencies.
// Production stays on Supabase/Postgres (see supabase/migrations/0001_init.sql).
// This file mirrors that schema closely enough that Phase 3+ features
// (classes, students, subjects, sessions) build against one shape.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DB_PATH =
	process.env.ATTENDIT_LOCAL_DB ?? join(process.cwd(), '.data', 'attendit-local.db');

let db: DatabaseSync | null = null;

export function localDb(): DatabaseSync {
	if (db) return db;
	mkdirSync(dirname(DB_PATH), { recursive: true });
	db = new DatabaseSync(DB_PATH);
	db.exec(`
		PRAGMA journal_mode = WAL;
		CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			hash TEXT NOT NULL,
			salt TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS local_sessions (
			token TEXT PRIMARY KEY,
			user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			expires_at TEXT NOT NULL,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS profiles (
			id TEXT PRIMARY KEY,
			email TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS classes (
			id TEXT PRIMARY KEY,
			owner_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			section TEXT,
			academic_year TEXT,
			join_slug TEXT NOT NULL UNIQUE,
			deleted_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS students (
			id TEXT PRIMARY KEY,
			class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
			full_name TEXT NOT NULL,
			registration_id TEXT NOT NULL,
			deleted_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS subjects (
			id TEXT PRIMARY KEY,
			class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			code TEXT,
			deleted_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
			subject_id TEXT REFERENCES subjects(id) ON DELETE SET NULL,
			session_code TEXT NOT NULL,
			radius_meters INTEGER NOT NULL DEFAULT 100,
			status TEXT NOT NULL DEFAULT 'draft',
			opens_at TEXT,
			closes_at TEXT,
			sheet_export_id TEXT,
			deleted_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS responses (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
			student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
			submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
			method TEXT,
			lat REAL,
			lng REAL,
			accuracy_m REAL,
			distance_from_host_m REAL,
			device_hash TEXT,
			status TEXT NOT NULL DEFAULT 'accepted',
			UNIQUE (session_id, student_id)
		);
		CREATE INDEX IF NOT EXISTS classes_owner_idx ON classes(owner_id);
		CREATE INDEX IF NOT EXISTS responses_session_idx ON responses(session_id);
		CREATE UNIQUE INDEX IF NOT EXISTS students_class_reg_uidx
			ON students(class_id, registration_id) WHERE deleted_at IS NULL;
		CREATE TABLE IF NOT EXISTS schema_meta (k TEXT PRIMARY KEY, v TEXT);
	`);
	// v1 shipped students with a FULL unique constraint (deleted rows counted),
	// which broke restores/re-adds with a raw constraint error. Rebuild once
	// with the partial index above.
	migrateStudentsUnique(db);
	return db;
}

function migrateStudentsUnique(db: DatabaseSync): void {
	const done = db
		.prepare(`SELECT v FROM schema_meta WHERE k = 'students_partial_unique'`)
		.get() as { v: string } | undefined;
	if (done) return;
	const table = db
		.prepare(`SELECT sql FROM sqlite_master WHERE name = 'students'`)
		.get() as { sql: string } | undefined;
	if (table?.sql?.includes('UNIQUE (class_id, registration_id)')) {
		db.exec(`
			ALTER TABLE students RENAME TO students_v1;
			CREATE TABLE students (
				id TEXT PRIMARY KEY,
				class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
				full_name TEXT NOT NULL,
				registration_id TEXT NOT NULL,
				deleted_at TEXT,
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			INSERT INTO students (id, class_id, full_name, registration_id, deleted_at, created_at)
				SELECT id, class_id, full_name, registration_id, deleted_at, created_at FROM students_v1;
			DROP TABLE students_v1;
			CREATE UNIQUE INDEX students_class_reg_uidx
				ON students(class_id, registration_id) WHERE deleted_at IS NULL;
		`);
	}
	db.prepare(
		`INSERT INTO schema_meta (k, v) VALUES ('students_partial_unique', '1') ON CONFLICT(k) DO NOTHING`
	).run();
}

export type LocalClass = {
	id: string;
	name: string;
	section: string | null;
	academic_year: string | null;
	join_slug: string;
	created_at: string;
};

export type LocalSessionRow = {
	id: string;
	class_id: string;
	status: string;
	opens_at: string | null;
	closes_at: string | null;
	created_at: string;
	class_name: string;
	subject_name: string | null;
	response_count: number;
	sheet_export_id: string | null;
};

export function listClasses(ownerId: string, limit = 20): LocalClass[] {
	const d = localDb();
	return d
		.prepare(
			`SELECT id, name, section, academic_year, join_slug, created_at
			 FROM classes WHERE owner_id = ? AND deleted_at IS NULL
			 ORDER BY created_at DESC LIMIT ?`
		)
		.all(ownerId, limit) as LocalClass[];
}

export function listSessions(ownerId: string, limit = 10): LocalSessionRow[] {
	const d = localDb();
	const rows = d
		.prepare(
			`SELECT s.id, s.class_id, s.status, s.opens_at, s.closes_at, s.created_at, s.sheet_export_id,
			        c.name AS class_name, sub.name AS subject_name
			 FROM sessions s
			 JOIN classes c ON c.id = s.class_id
			 LEFT JOIN subjects sub ON sub.id = s.subject_id
			 WHERE c.owner_id = ? AND s.deleted_at IS NULL AND c.deleted_at IS NULL
			 ORDER BY s.created_at DESC LIMIT ?`
		)
		.all(ownerId, limit) as Array<Omit<LocalSessionRow, 'response_count'>>;

	const countStmt = d.prepare(`SELECT COUNT(*) AS n FROM responses WHERE session_id = ?`);
	return rows.map((r) => ({
		...r,
		response_count: (countStmt.get(r.id) as { n: number }).n
	}));
}
