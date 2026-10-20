require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const fetch = require('node-fetch');
const Database = require('better-sqlite3');
const compression = require('compression');
const { Pool } = require('pg');

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Hostinger/YorkHost)
app.use(compression()); // Gzip for all responses
const PORT = process.env.PORT || 26005;

// Helper for dynamic base URL (environment-aware)
function getBaseUrl(req) {
    const protocol = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
    const host = req.get('host');
    return `${protocol}://${host}`;
}
// ============================================================
// DATABASE SETUP
// ============================================================
let db;
let usePostgres = false;

// Use PostgreSQL if DATABASE_URL is provided, otherwise SQLite
if (process.env.DATABASE_URL) {
    usePostgres = true;
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    });
    console.log('✅ Using PostgreSQL database');
} else {
    usePostgres = false;
    db = new Database(path.join(__dirname, 'ossearch.db'));
    try {
        db.prepare('SELECT 1').get();
    } catch (err) {
        console.error('❌ Database failure:', err.message);
    }
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    db.pragma('cache_size = -10000');
    db.pragma('foreign_keys = ON');
    db.pragma('temp_store = MEMORY');
    console.log('✅ Using SQLite database');
}

// Database query helper - works with both SQLite and PostgreSQL
async function dbQuery(sql, params = []) {
    if (usePostgres) {
        // PostgreSQL uses $1, $2, etc. - convert ? to $1, $2
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
        const result = await db.query(pgSql, params);
        return result.rows;
    } else {
        // SQLite
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith('SELECT') || upper.startsWith('WITH') || upper.startsWith('PRAGMA') || upper.startsWith('INSERT')) {
            return stmt.all(...params);
        } else {
            return stmt.run(...params);
        }
    }
}

async function dbGet(sql, params = []) {
    if (usePostgres) {
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
        const result = await db.query(pgSql, params);
        return result.rows[0] || null;
    } else {
        const stmt = db.prepare(sql);
        return stmt.get(...params);
    }
}

async function dbRun(sql, params = []) {
    if (usePostgres) {
        let pgSql = sql;
        let paramIndex = 1;
        pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);
        const result = await db.query(pgSql, params);
        return { lastInsertRowid: null, changes: result.rowCount };
    } else {
        const stmt = db.prepare(sql);
        return stmt.run(...params);
    }
}

// Normalise une date (SQLite string / PostgreSQL Date object) en 'YYYY-MM-DD'
function toDateStr(value) {
    if (!value) return value;
    if (typeof value === 'string') return value.split('T')[0].split(' ')[0];
    try { return new Date(value).toISOString().split('T')[0]; } catch (e) { return value; }
}

// Ensure database is saved and closed gracefully
process.on('SIGINT', async () => {
    if (usePostgres) await db.end();
    else db.close();
    process.exit(0);
});
process.on('SIGTERM', async () => {
    if (usePostgres) await db.end();
    else db.close();
    process.exit(0);
});

// Initialize database tables
async function initDatabase() {
    if (usePostgres) {
        // PostgreSQL table creation
        await db.query(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                plan TEXT DEFAULT 'free',
                credits INTEGER DEFAULT 5,
                credits_max INTEGER DEFAULT 5,
                total_searches INTEGER DEFAULT 0,
                discord_id TEXT DEFAULT '',
                discord_tag TEXT DEFAULT '',
                role TEXT DEFAULT 'user',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP,
                last_credit_reset DATE,
                banned INTEGER DEFAULT 0,
                avatar_url TEXT DEFAULT '',
                banner_url TEXT DEFAULT '',
                profile_bio TEXT DEFAULT '',
                profile_music_url TEXT DEFAULT '',
                profile_effect TEXT DEFAULT 'none',
                admin_notes TEXT DEFAULT '',
                profile_views INTEGER DEFAULT 0,
                uuid TEXT UNIQUE
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                ip TEXT,
                user_agent TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS search_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                query TEXT,
                ip TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS connection_logs (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                ip TEXT,
                user_agent TEXT,
                browser TEXT,
                is_vpn INTEGER DEFAULT 0,
                is_proxy INTEGER DEFAULT 0,
                isp TEXT,
                country TEXT,
                city TEXT,
                region TEXT,
                ip_type TEXT DEFAULT 'residential',
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                amount REAL,
                plan TEXT,
                method TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS blacklisted_ips (
                ip TEXT PRIMARY KEY,
                reason TEXT DEFAULT '',
                added_by TEXT DEFAULT 'system',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS whitelisted_ips (
                ip TEXT PRIMARY KEY,
                reason TEXT DEFAULT 'VPN bypass',
                added_by TEXT DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS login_attempts (
                id SERIAL PRIMARY KEY,
                ip TEXT,
                email TEXT,
                success INTEGER DEFAULT 0,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                paypal_subscription_id TEXT UNIQUE,
                status TEXT DEFAULT 'active',
                start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                next_billing_date TIMESTAMP,
                cancelled_at TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS security_alerts (
                id SERIAL PRIMARY KEY,
                ip TEXT,
                email TEXT,
                discord_id TEXT,
                alert_type TEXT,
                details TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                message TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS reviews (
                id SERIAL PRIMARY KEY,
                username TEXT NOT NULL,
                discord_id TEXT NOT NULL,
                content TEXT NOT NULL,
                stars INTEGER DEFAULT 5,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS bot_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS search_blacklist (
                id SERIAL PRIMARY KEY,
                term TEXT UNIQUE NOT NULL,
                added_by TEXT DEFAULT 'admin',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS admin_accounts (
                id SERIAL PRIMARY KEY,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                last_login TIMESTAMP
            );
        `);

        // Create indexes
        await db.query('CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp)');
        await db.query('CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id)');

        console.log('✅ PostgreSQL tables initialized');
    } else {
        // SQLite table creation
        db.exec(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                plan TEXT DEFAULT 'free',
                credits INTEGER DEFAULT 5,
                credits_max INTEGER DEFAULT 5,
                total_searches INTEGER DEFAULT 0,
                discord_id TEXT DEFAULT '',
                discord_tag TEXT DEFAULT '',
                role TEXT DEFAULT 'user',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME,
                last_credit_reset DATE,
                banned INTEGER DEFAULT 0,
                avatar_url TEXT DEFAULT '',
                banner_url TEXT DEFAULT '',
                profile_bio TEXT DEFAULT '',
                profile_music_url TEXT DEFAULT '',
                profile_effect TEXT DEFAULT 'none',
                admin_notes TEXT DEFAULT '',
                profile_views INTEGER DEFAULT 0,
                uuid TEXT UNIQUE
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                ip TEXT,
                user_agent TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME
            );

            CREATE TABLE IF NOT EXISTS search_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                query TEXT,
                ip TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS connection_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                ip TEXT,
                user_agent TEXT,
                browser TEXT,
                is_vpn INTEGER DEFAULT 0,
                is_proxy INTEGER DEFAULT 0,
                isp TEXT,
                country TEXT,
                city TEXT,
                region TEXT,
                ip_type TEXT DEFAULT 'residential',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS payments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                amount REAL,
                plan TEXT,
                method TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS blacklisted_ips (
                ip TEXT PRIMARY KEY,
                reason TEXT DEFAULT '',
                added_by TEXT DEFAULT 'system',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS whitelisted_ips (
                ip TEXT PRIMARY KEY,
                reason TEXT DEFAULT 'VPN bypass',
                added_by TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS login_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT,
                email TEXT,
                success INTEGER DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS subscriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                plan TEXT NOT NULL,
                paypal_subscription_id TEXT UNIQUE,
                status TEXT DEFAULT 'active',
                start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                next_billing_date DATETIME,
                cancelled_at DATETIME
            );

            CREATE TABLE IF NOT EXISTS security_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip TEXT,
                email TEXT,
                discord_id TEXT,
                alert_type TEXT,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                message TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                discord_id TEXT NOT NULL,
                content TEXT NOT NULL,
                stars INTEGER DEFAULT 5,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS bot_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );

            CREATE TABLE IF NOT EXISTS search_blacklist (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                term TEXT UNIQUE NOT NULL,
                added_by TEXT DEFAULT 'admin',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS admin_accounts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                salt TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_login DATETIME
            );

            CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
            CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
            CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
            CREATE INDEX IF NOT EXISTS idx_chat_timestamp ON chat_messages(timestamp);
            CREATE INDEX IF NOT EXISTS idx_search_logs_user ON search_logs(user_id);
        `);
        console.log('✅ SQLite tables initialized');
    }
}

// ============================================================
// BOOTSTRAP DB : création des tables + migrations + admin seed
// Identique en SQLite (local) et PostgreSQL (comptes partagés partout)
// ============================================================
(async () => {
    try {
        await initDatabase();

        if (!usePostgres) {
            // === Migrations SQLite uniquement ===
            try {
                const tableInfo = db.prepare("PRAGMA table_info(users)").all();
                const hasUuid = tableInfo.some(c => c.name === 'uuid');
                if (!hasUuid) {
                    db.prepare('ALTER TABLE users ADD COLUMN uuid TEXT UNIQUE').run();
                    console.log('✅ Added uuid column to users table');
                }

                // Ensure all users have UUIDs
                const usersWithoutUUID = db.prepare('SELECT id FROM users WHERE uuid IS NULL OR uuid = ""').all();
                if (usersWithoutUUID.length > 0) {
                    const updateStmt = db.prepare('UPDATE users SET uuid = ? WHERE id = ?');
                    for (const u of usersWithoutUUID) {
                        updateStmt.run(crypto.randomUUID(), u.id);
                    }
                    console.log(`✅ Populated UUIDs for ${usersWithoutUUID.length} users`);
                }
            } catch (e) {
                console.error('UUID Migration error:', e.message);
            }

            try {
                db.prepare("ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''").run();
            } catch (e) {}
            try {
                db.prepare("ALTER TABLE users ADD COLUMN banner_url TEXT DEFAULT ''").run();
                db.prepare("ALTER TABLE users ADD COLUMN profile_bio TEXT DEFAULT ''").run();
                db.prepare("ALTER TABLE users ADD COLUMN profile_music_url TEXT DEFAULT ''").run();
                db.prepare("ALTER TABLE users ADD COLUMN profile_effect TEXT DEFAULT 'none'").run();
            } catch (e) {}
            try {
                db.prepare("ALTER TABLE users ADD COLUMN admin_notes TEXT DEFAULT ''").run();
            } catch (e) {}
            try {
                db.prepare("ALTER TABLE users ADD COLUMN profile_views INTEGER DEFAULT 0").run();
                console.log('✅ Added profile_views column to users table');
            } catch (e) {}
        } else {
            // === Migrations PostgreSQL (idempotentes, pour base existante) ===
            try {
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS uuid TEXT UNIQUE");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT ''");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT ''");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_bio TEXT DEFAULT ''");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_music_url TEXT DEFAULT ''");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_effect TEXT DEFAULT 'none'");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes TEXT DEFAULT ''");
                await db.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_views INTEGER DEFAULT 0");

                const usersWithoutUUID = (await db.query('SELECT id FROM users WHERE uuid IS NULL')).rows;
                for (const u of usersWithoutUUID) {
                    await db.query('UPDATE users SET uuid = $1 WHERE id = $2', [crypto.randomUUID(), u.id]);
                }
                if (usersWithoutUUID.length > 0) {
                    console.log(`✅ Populated UUIDs for ${usersWithoutUUID.length} users`);
                }
            } catch (e) {
                console.error('PG Migration error:', e.message);
            }
        }

        await seedDefaultAdmin();
    } catch (e) {
        console.error('❌ Database bootstrap error:', e.message);
    }
})();

// ============================================================
// ADMIN ACCOUNT SEEDING
// ============================================================
async function seedDefaultAdmin() {
    const adminRow = await dbGet('SELECT COUNT(*) as count FROM admin_accounts');
    const adminCount = Number(adminRow ? adminRow.count : 0);
    const newAdminUser = 'admin';
    const newAdminPass = 'admin123';

    if (adminCount === 0) {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = await hashPassword(newAdminPass, salt);
        if (usePostgres) {
            await db.query('INSERT INTO admin_accounts (username, password_hash, salt) VALUES ($1, $2, $3)', [newAdminUser, hash, salt]);
        } else {
            db.prepare('INSERT INTO admin_accounts (username, password_hash, salt) VALUES (?, ?, ?)').run(newAdminUser, hash, salt);
        }
        console.log(`[+] Default secret admin created: ${newAdminUser} / ${newAdminPass}`);
    } else {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = await hashPassword(newAdminPass, salt);
        if (usePostgres) {
            await db.query('UPDATE admin_accounts SET username = $1, password_hash = $2, salt = $3', [newAdminUser, hash, salt]);
        } else {
            db.prepare('UPDATE admin_accounts SET username = ?, password_hash = ?, salt = ?').run(newAdminUser, hash, salt);
        }
        console.log(`[+] Admin account(s) updated to: ${newAdminUser}`);
    }

    // Check database persistence
    try {
        const userRow = await dbGet('SELECT COUNT(*) as cnt FROM users');
        const userCount = Number(userRow ? userRow.cnt : 0);
        console.log(`[📁 DB] Database loaded: ${userCount} users registered.`);
    } catch (e) {
        console.error('⚠️ Error reading DB at startup:', e.message);
    }

    // ============================================================
    // SEED HIDDEN BLACKLIST
    // ============================================================
    try {
        const hNames = [
            'Y2FtZWxpYSBmaW5pa2k=',
            'Y2Ftw6lsaWEgZmluaWtp',
            'ZWx5ZXMgZmluaWtp',
            'w6lseWVzIGZpbmlraQ==',
            'c2FuZHJpbmUgbWFuY2hvbg==',
            'c2FsYWggZmluaWtp'
        ];

        for (const encoded of hNames) {
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
            if (usePostgres) {
                await db.query('INSERT INTO search_blacklist (term, added_by) VALUES ($1, $2) ON CONFLICT (term) DO NOTHING', [decoded, 'system']);
            } else {
                db.prepare('INSERT OR IGNORE INTO search_blacklist (term, added_by) VALUES (?, ?)').run(decoded, 'system');
            }
        }
    } catch (e) {
        console.error('⚠️ Error seeding blacklist:', e.message);
    }
}
// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false }));

// ============================================================
// DOMAIN ENFORCEMENT & CANONICAL REDIRECT (Top of stack)
// ============================================================
app.use((req, res, next) => {
    // TEMPORARILY DISABLED FOR TESTING
    /*
    const baseUrl = process.env.BASE_URL; // ossearch.fr
    const host = req.hostname; // Accurate with 'trust proxy'

    // Only redirect GET requests for the main site (excluding API/Admin)
    if (baseUrl && req.method === 'GET' && !req.path.startsWith('/api/') && req.path !== '/admin.html') {

        // Skip for local development
        if (host === 'localhost' || host === '127.0.0.1') {
            return next();
        }

        // Redirect if NOT on the domain (handles IPs and subdomains)
        if (host !== baseUrl) {
            return res.redirect(301, `${req.protocol}://${baseUrl}${req.url}`);
        }
    }
    */
    next();
});

app.use((req, res, next) => {
    next();
});

// ============================================================
// LIVE LOGS SYSTEM (SSE)
// ============================================================
const LOG_BUFFER = [];
const logStreamClients = new Set();

const originalLog = console.log;
const originalError = console.error;

function captureLog(type, args) {
    const msg = {
        type,
        timestamp: new Date().toISOString(),
        content: args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
    };
    LOG_BUFFER.push(msg);
    if (LOG_BUFFER.length > 200) LOG_BUFFER.shift();
    
    // Broadcast to SSE clients
    const sseData = `data: ${JSON.stringify(msg)}\n\n`;
    logStreamClients.forEach(client => client.res.write(sseData));
}

console.log = (...args) => {
    originalLog(...args);
    captureLog('info', args);
};
console.error = (...args) => {
    originalError(...args);
    captureLog('error', args);
};

app.use(express.static(path.join(__dirname)));


// Get real IP
function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.connection?.remoteAddress
        || req.ip
        || '0.0.0.0';
}

// Input sanitizer
function sanitize(str) {
    if (typeof str !== 'string') return '';
    // Allow spaces for Name Surname searches, but keep other characters restricted
    return str.replace(/[<>"'`;]/g, '').trim().substring(0, 500);
}

// ============================================================
// RATE LIMITERS
// ============================================================
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    message: { error: 'Trop de requêtes. Réessayez plus tard.' },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
});
app.use(globalLimiter);

const loginLimiter = (req, res, next) => next(); // Rate limit disabled by user request

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 3,
    message: { error: 'Trop de créations de compte. Réessayez plus tard.' },
    validate: { trustProxy: false },
});

// ============================================================
// IP BLACKLIST MIDDLEWARE
// ============================================================
app.use(async (req, res, next) => {
    try {
        const ip = getClientIp(req);
        const blocked = await dbGet('SELECT * FROM blacklisted_ips WHERE ip = ?', [ip]);
        if (blocked) {
            if (req.path.startsWith('/api/')) {
                return res.status(403).json({ error: 'IP_BLACKLISTED', message: 'Votre adresse IP a été blacklistée.' });
            }
            return res.send(`<!DOCTYPE html>
<html><head><title>Accès Bloqué</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#0a0a0a;color:#fff;font-family:'Outfit',sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh}
.blocked{text-align:center;padding:3rem}.blocked h1{color:#ff1a1a;font-size:3rem;margin-bottom:1rem}.blocked p{color:#888;font-size:1.2rem;margin-bottom:2rem}
.blocked .icon{font-size:5rem;color:#ff1a1a;margin-bottom:2rem}</style>
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
</head><body><div class="blocked"><div class="icon"><i class="fas fa-ban"></i></div>
<h1>🚫 Accès Bloqué</h1>
<p>Votre adresse IP <strong>${ip}</strong> a été blacklistée.</p>
<p>Raison : ${blocked.reason || 'Non spécifiée'}</p>
<p style="color:#555;margin-top:2rem">Contactez un administrateur pour contester cette décision.</p>
</div></body></html>`);
        }
        next();
    } catch (e) {
        // En cas d'erreur DB, on laisse passer (disponibilité prioritaire)
        next();
    }
});

// ============================================================
// ANTI-VPN MIDDLEWARE
// ============================================================
const vpnCache = new Map();

async function checkVPN(ip) {
    if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
        return { isVpn: false, isProxy: false, isp: 'Local', country: 'Local', city: 'Local', region: 'Local', ipType: 'residential' };
    }

    const whitelisted = await dbGet('SELECT * FROM whitelisted_ips WHERE ip = ?', [ip]);
    if (whitelisted) {
        return { isVpn: false, isProxy: false, isp: 'Whitelisted', country: '-', city: '-', region: '-', ipType: 'whitelisted', whitelisted: true };
    }

    if (vpnCache.has(ip)) {
        const cached = vpnCache.get(ip);
        if (Date.now() - cached.time < 10 * 60 * 1000) return cached.data;
    }

    try {
        const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,regionName,city,isp,proxy,hosting,query`);
        const data = await resp.json();
        if (data.status === 'success') {
            const result = {
                isVpn: data.hosting || false,
                isProxy: data.proxy || false,
                isp: data.isp || 'Unknown',
                country: data.country || 'Unknown',
                city: data.city || 'Unknown',
                region: data.regionName || 'Unknown',
                ipType: (data.hosting || data.proxy) ? 'vpn/proxy' : 'residential'
            };
            vpnCache.set(ip, { data: result, time: Date.now() });
            return result;
        }
    } catch (e) {
        console.error('VPN check error:', e.message);
    }
    return { isVpn: false, isProxy: false, isp: 'Unknown', country: 'Unknown', city: 'Unknown', region: 'Unknown', ipType: 'unknown' };
}

// ============================================================
// AUTH HELPERS
// ============================================================
async function hashPassword(password, salt) {
    return new Promise((resolve, reject) => {
        crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
            if (err) reject(err);
            else resolve(derivedKey.toString('hex'));
        });
    });
}

function generateToken() {
    return crypto.randomBytes(48).toString('hex');
}

async function getSessionUser(req) {
    const token = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
    if (!token) return null;
    const session = await dbGet('SELECT * FROM sessions WHERE token = ?', [token]);
    if (!session) return null;
    // Vérification de l'expiration en JS (compatible SQLite ET PostgreSQL)
    if (session.expires_at && new Date(session.expires_at) < new Date()) return null;
    return await dbGet('SELECT * FROM users WHERE id = ?', [session.user_id]);
}

async function resetDailyCredits(user) {
    const today = new Date().toISOString().split('T')[0];
    const lastReset = toDateStr(user.last_credit_reset);
    
    // Check if user has active subscription
    const subscription = await dbGet('SELECT * FROM subscriptions WHERE user_id = ? AND status = ?', [user.id, 'active']);
    
    if (subscription) {
        // Check if subscription has expired
        const now = new Date();
        const nextBilling = new Date(subscription.next_billing_date);
        
        if (now > nextBilling) {
            // Subscription expired - downgrade to free
            await dbRun('UPDATE users SET plan = ?, credits = 5, credits_max = 5 WHERE id = ?', ['free', user.id]);
            await dbRun('UPDATE subscriptions SET status = ? WHERE id = ?', ['expired', subscription.id]);
            user.plan = 'free';
            user.credits = 5;
            user.credits_max = 5;
        } else {
            // Active subscription - don't reset credits, reset date only
            await dbRun('UPDATE users SET last_credit_reset = ? WHERE id = ?', [today, user.id]);
            user.last_credit_reset = today;
        }
    } else {
        // No subscription - reset daily credits
        if (lastReset !== today) {
            const planCredits = { free: 5, beginner: 100, pro: 500, premiumhq: 5000 };
            const maxCredits = planCredits[user.plan] || 5;
            await dbRun('UPDATE users SET credits = ?, credits_max = ?, last_credit_reset = ? WHERE id = ?', [maxCredits, maxCredits, today, user.id]);
            user.credits = maxCredits;
            user.credits_max = maxCredits;
        }
    }
    return user;
}

// ============================================================
// DISCORD WEBHOOK HELPER
// ============================================================
async function sendWebhook(url, embed) {
    if (!url) return;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'ѲsSearch Logs',
                avatar_url: 'https://i.imgur.com/placeholder.png',
                embeds: [embed]
            })
        });
    } catch (e) {
        console.error('Webhook error:', e.message);
    }
}

// ============================================================
// AUTH ROUTES
// ============================================================
app.post('/api/auth/register', registerLimiter, async (req, res) => {
    try {
        const username = sanitize(req.body.username);
        const email = sanitize(req.body.email);
        const password = req.body.password;
        const ip = getClientIp(req);

        if (!username || !email || !password) return res.status(400).json({ error: 'Tous les champs sont requis.' });
        if (username.length < 3 || username.length > 30) return res.status(400).json({ error: 'Username: 3-30 caractères.' });
        if (password.length < 6) return res.status(400).json({ error: 'Mot de passe: 6 caractères min.' });

        // Check availability
        const existing = await dbGet('SELECT 1 FROM users WHERE username = ? OR email = ?', [username, email]);
        if (existing) return res.status(409).json({ error: 'Nom d\'utilisateur ou email déjà utilisé.' });

        // Create User
        const salt = crypto.randomBytes(16).toString('hex');
        const password_hash = await hashPassword(password, salt);
        const today = new Date().toISOString().split('T')[0];
        const uuid = crypto.randomUUID();

        let userId;
        if (usePostgres) {
            const result = await db.query(
                'INSERT INTO users (username, email, password_hash, salt, credits, credits_max, last_credit_reset, uuid) VALUES ($1, $2, $3, $4, 5, 5, $5, $6) RETURNING id',
                [username, email, password_hash, salt, today, uuid]
            );
            userId = result.rows[0].id;
        } else {
            const result = db.prepare(
                'INSERT INTO users (username, email, password_hash, salt, credits, credits_max, last_credit_reset, uuid) VALUES (?, ?, ?, ?, 5, 5, ?, ?)'
            ).run(username, email, password_hash, salt, today, uuid);
            userId = result.lastInsertRowid;
        }

        const token = generateToken();
        const ua = req.headers['user-agent'] || '';

        // Create Session
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        if (usePostgres) {
            await db.query('INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)', [token, userId, ip, req.headers['user-agent'] || '', expiresAt.toISOString()]);
        } else {
            db.prepare('INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+30 days\'))').run(token, userId, ip, req.headers['user-agent'] || '');
        }

        console.log(`[✅ REGISTER] New user created: ${username} (ID: ${userId})`);

        // BACKGROUND TASKS (Non-blocking)
        setImmediate(async () => {
            try {
                const vpnInfo = await checkVPN(ip);
                if (usePostgres) {
                    await db.query(
                        'INSERT INTO connection_logs (user_id, ip, user_agent, browser, is_vpn, is_proxy, isp, country, city, region, ip_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                        [userId, ip, ua, parseBrowser(ua), vpnInfo.isVpn ? 1 : 0, vpnInfo.isProxy ? 1 : 0, vpnInfo.isp, vpnInfo.country, vpnInfo.city, vpnInfo.region, vpnInfo.ipType]
                    );
                } else {
                    db.prepare(
                        'INSERT INTO connection_logs (user_id, ip, user_agent, browser, is_vpn, is_proxy, isp, country, city, region, ip_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(userId, ip, ua, parseBrowser(ua), vpnInfo.isVpn ? 1 : 0, vpnInfo.isProxy ? 1 : 0, vpnInfo.isp, vpnInfo.country, vpnInfo.city, vpnInfo.region, vpnInfo.ipType);
                }

                sendWebhook(process.env.WEBHOOK_SECURITY_LOGS, {
                    title: '✨ `[NEW USER]` Inscription Réussie',
                    color: 0x9D4EDD,
                    description: `Un nouvel utilisateur vient de rejoindre **OsSearch** !`,
                    thumbnail: { url: 'https://i.imgur.com/8Q850Zc.png' },
                    fields: [
                        { name: '👤 Utilisateur', value: `\`${username}\`\n✉️ ${email}`, inline: true },
                        { name: '🌍 Localisation', value: `📍 ${vpnInfo.city}, ${vpnInfo.country}\n🏢 ${vpnInfo.isp}`, inline: true },
                        { name: '🌐 Réseau', value: `💻 IP: ||${ip}||\n🛡️ VPN/Proxy: ${vpnInfo.isVpn || vpnInfo.isProxy ? '✅ Oui' : '❌ Non'}`, inline: false },
                    ],
                    footer: { text: 'OsSearch Security System', icon_url: 'https://i.imgur.com/K1x5Z7p.png' },
                    timestamp: new Date().toISOString()
                });
            } catch (err) { console.error('Bg tasks error (Register):', err.message); }
        });

        const user = await dbGet('SELECT * FROM users WHERE id = ?', [userId]);
        res.json({ success: true, token, user: safeUser(user) });
    } catch (e) {
        console.error('Register Error:', e.message);
        res.status(500).json({ error: 'SERVER_ERROR' });
    }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
    try {
        const username = sanitize(req.body.username);
        const password = req.body.password;
        const ip = getClientIp(req);
        const ua = req.headers['user-agent'] || '';

        if (!username || !password) return res.status(400).json({ error: 'Identifiants requis.' });

        const user = await dbGet('SELECT * FROM users WHERE username = ? OR email = ?', [username, username]);
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects.' });
        if (user.banned) return res.status(403).json({ error: 'Compte suspendu.' });

        const hash = await hashPassword(password, user.salt);
        if (hash !== user.password_hash) return res.status(401).json({ error: 'Identifiants incorrects.' });

        // Update basic info
        if (usePostgres) {
            await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
        } else {
            db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
        }
        resetDailyCredits(user).catch(err => console.error('Credits reset error:', err.message));

        // Create session
        const token = generateToken();
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        if (usePostgres) {
            await db.query('INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, $5)', [token, user.id, ip, ua, expiresAt.toISOString()]);
        } else {
            db.prepare('INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, datetime(\'now\', \'+30 days\'))').run(token, user.id, ip, ua);
        }

        // BACKGROUND TASKS (Non-blocking)
        setImmediate(async () => {
            try {
                const vpnInfo = await checkVPN(ip);
                if (usePostgres) {
                    await db.query(
                        'INSERT INTO connection_logs (user_id, ip, user_agent, browser, is_vpn, is_proxy, isp, country, city, region, ip_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                        [user.id, ip, ua, parseBrowser(ua), vpnInfo.isVpn ? 1 : 0, vpnInfo.isProxy ? 1 : 0, vpnInfo.isp, vpnInfo.country, vpnInfo.city, vpnInfo.region, vpnInfo.ipType]
                    );
                } else {
                    db.prepare(
                        'INSERT INTO connection_logs (user_id, ip, user_agent, browser, is_vpn, is_proxy, isp, country, city, region, ip_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                    ).run(user.id, ip, ua, parseBrowser(ua), vpnInfo.isVpn ? 1 : 0, vpnInfo.isProxy ? 1 : 0, vpnInfo.isp, vpnInfo.country, vpnInfo.city, vpnInfo.region, vpnInfo.ipType);
                }

                sendWebhook(process.env.WEBHOOK_CONNECTION_LOGS, {
                    title: '🔐 `[LOGIN]` Nouvelle Connexion',
                    color: 0x00D4FF,
                    description: `**${user.username}** s'est connecté au panel.`,
                    fields: [
                        { name: '👤 Compte', value: `\`${user.username}\``, inline: true },
                        { name: '🌍 Localisation', value: `📍 ${vpnInfo.city}, ${vpnInfo.country}`, inline: true },
                        { name: '🌐 Info', value: `💻 IP: ||${ip}||\n🛡️ VPN: ${vpnInfo.isVpn ? '✅' : '❌'}`, inline: true },
                    ],
                    footer: { text: 'OsSearch Auth System' },
                    timestamp: new Date().toISOString()
                });
            } catch (err) { console.error('Bg tasks error (Login):', err.message); }
        });

        const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
        res.json({ success: true, token, user: safeUser(updatedUser) });
    } catch (e) {
        console.error('Login Error:', e.message);
        res.status(500).json({ error: 'SERVER_ERROR' });
    }
});

app.post('/api/auth/logout', async (req, res) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) {
        await dbRun('DELETE FROM sessions WHERE token = ?', [token]);
    }
    res.json({ success: true });
});

app.get('/api/auth/me', async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Non authentifié.' });
        await resetDailyCredits(user);
        const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
        
        // Get subscription info
        const subscription = await dbGet('SELECT * FROM subscriptions WHERE user_id = ? AND status = ?', [user.id, 'active']);
        
        res.json({ 
            user: safeUser(updatedUser),
            subscription: subscription ? {
                plan: subscription.plan,
                nextBillingDate: subscription.next_billing_date,
                startDate: subscription.start_date
            } : null
        });
    } catch (e) {
        console.error('Auth/me error:', e.message);
        res.status(500).json({ error: 'SERVER_ERROR' });
    }
});

// ============================================================
// SUBSCRIPTION STATUS ENDPOINT
// ============================================================
app.get('/api/subscription/status', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });
    
    const subscription = await dbGet('SELECT * FROM subscriptions WHERE user_id = ? AND status = ?', [user.id, 'active']);
    
    if (!subscription) {
        return res.json({ hasSubscription: false });
    }
    
    const now = new Date();
    const nextBilling = new Date(subscription.next_billing_date);
    const daysRemaining = Math.ceil((nextBilling - now) / (1000 * 60 * 60 * 24));
    
    res.json({
        hasSubscription: true,
        plan: subscription.plan,
        nextBillingDate: subscription.next_billing_date,
        startDate: subscription.start_date,
        daysRemaining: daysRemaining > 0 ? daysRemaining : 0
    });
});

// DEDUCT CREDIT ENDPOINT
app.post('/api/deduct-credit', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });
    
    if (user.credits <= 0) {
        return res.status(400).json({ error: 'Aucun crédit disponible.' });
    }
    
    await dbRun('UPDATE users SET credits = credits - 1 WHERE id = ?', [user.id]);
    res.json({ success: true, remainingCredits: user.credits - 1 });
});

app.post('/api/auth/update-discord', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });
    const discordId = sanitize(req.body.discord_id || '');
    const discordTag = sanitize(req.body.discord_tag || '');
    await dbRun('UPDATE users SET discord_id = ?, discord_tag = ? WHERE id = ?', [discordId, discordTag, user.id]);
    res.json({ success: true });
});

// Update Profile Customization
app.post('/api/auth/update-profile', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });
    
    const { bio, banner_url, music_url, effect } = req.body;
    
    // Limits
    if (bio && bio.length > 250) return res.status(400).json({ error: 'Bio trop longue (250 car. max)' });
    
    try {
        await dbRun('UPDATE users SET profile_bio = ?, banner_url = ?, profile_music_url = ?, profile_effect = ? WHERE id = ?',
            [bio || '', banner_url || '', music_url || '', effect || 'none', user.id]);
        
        const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
        res.json({ success: true, user: safeUser(updatedUser), message: 'Profil mis à jour' });
    } catch (err) {
        res.status(500).json({ error: 'Erreur SQL' });
    }
});

app.post('/api/auth/update-avatar', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });
    const avatarUrl = String(req.body.avatar_url || '').trim();
    if (avatarUrl.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Fichier trop lourd.' });
    await dbRun('UPDATE users SET avatar_url = ? WHERE id = ?', [avatarUrl, user.id]);
    const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
    res.json({ success: true, user: safeUser(updatedUser), message: 'Avatar mis à jour' });
});

// Public profile by UUID
app.get('/api/public/user/:uuid', async (req, res) => {
    try {
        // Increment views (try as UUID first, then as username)
        await dbRun('UPDATE users SET profile_views = profile_views + 1 WHERE uuid = ? OR username = ?', [req.params.uuid, req.params.uuid]);

        const user = await dbGet('SELECT username, avatar_url, banner_url, profile_bio, profile_music_url, profile_effect, role, plan, created_at, discord_tag, total_searches, profile_views FROM users WHERE uuid = ? OR username = ?', [req.params.uuid, req.params.uuid]);
        if (!user) return res.status(404).json({ error: 'Utilisateur non trouvé' });
        
        res.json({ 
            success: true, 
            user: {
                username: user.username,
                avatarUrl: user.avatar_url,
                bannerUrl: user.banner_url || '',
                profileBio: user.profile_bio || '',
                profileMusicUrl: user.profile_music_url || '',
                profileEffect: user.profile_effect || 'none',
                role: user.role,
                plan: user.plan,
                createdAt: user.created_at,
                discordTag: user.discord_tag,
                totalSearches: user.total_searches,
                profileViews: user.profile_views || 0
            }
        });
    } catch (err) {
        console.error('Public user profile error:', err);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

app.get('/api/public/users', async (req, res) => {
    try {
        const users = await dbQuery(`
            SELECT uuid, username, email, discord_id, discord_tag, plan, role, created_at, avatar_url 
            FROM users 
            ORDER BY created_at ASC
        `);
        
        const safeUsers = users.map(u => ({
            uuid: u.uuid || '',
            username: u.username || 'Inconnu',
            email: u.email || '',
            discordId: u.discord_id || '',
            discordTag: u.discord_tag || '',
            plan: u.plan || 'free',
            role: u.role || 'user',
            createdAt: u.created_at,
            avatarUrl: u.avatar_url || ''
        }));
        
        res.json({ success: true, users: safeUsers });
    } catch (e) {
        console.error('Public users error:', e.message);
        res.status(500).json({ error: 'Erreur serveur: ' + e.message });
    }
});

// ============================================================
// REVIEW & FEEDBACK ROUTES
// ============================================================

// Internal endpoint for Discord Bot to submit reviews
app.post('/api/internal/review', async (req, res) => {
    const { key, username, discord_id, content, stars } = req.body;
    
    const internalKey = process.env.INTERNAL_BOT_KEY || 'ossearch_internal_secure_key_2024';
    if (key !== internalKey) {
        return res.status(403).json({ error: 'Clé interne invalide.' });
    }

    if (!username || !content || !stars) {
        return res.status(400).json({ error: 'Données manquantes.' });
    }

    try {
        await dbRun('INSERT INTO reviews (username, discord_id, content, stars) VALUES (?, ?, ?, ?)',
            [username, discord_id || '', content, stars]);
        
        console.log(`[Review] Nouvel avis de ${username} (${stars} étoiles)`);
        res.json({ success: true });
    } catch (e) {
        console.error('Internal review error:', e);
        res.status(500).json({ error: 'Erreur lors de l\'enregistrement de l\'avis.' });
    }
});

// Public endpoint to get reviews
app.get('/api/public/reviews', async (req, res) => {
    try {
        const reviews = await dbQuery('SELECT username, discord_id, content, stars, timestamp FROM reviews ORDER BY timestamp DESC LIMIT 20');
        res.json({ success: true, reviews });
    } catch (e) {
        console.error('Public reviews error:', e);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// Internal endpoint to delete reviews
app.delete('/api/internal/review/:discord_id', async (req, res) => {
    const { key } = req.body;
    const discord_id = req.params.discord_id;
    
    const internalKey = process.env.INTERNAL_BOT_KEY || 'ossearch_internal_secure_key_2024';
    if (key !== internalKey) {
        return res.status(403).json({ error: 'Clé interne invalide.' });
    }

    try {
        const info = await dbRun('DELETE FROM reviews WHERE discord_id = ?', [discord_id]);
        res.json({ success: true, changes: info.changes });
    } catch (e) {
        console.error('Internal delete review error:', e);
        res.status(500).json({ error: 'Erreur lors de la suppression.' });
    }
});

// ============================================================
// CHAT ROUTES
// ============================================================
app.get('/api/chat/messages', async (req, res) => {
    try {
        const messages = await dbQuery(`
            SELECT c.id, c.message, c.timestamp, u.username, u.plan
            FROM chat_messages c
            JOIN users u ON c.user_id = u.id
            ORDER BY c.timestamp DESC
            LIMIT 50
        `);
        res.json({ success: true, messages: messages.reverse() });
    } catch (e) {
        console.error('Chat GET error:', e);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

const chatLimiter = rateLimit({
    windowMs: 5000, // 1 message per 5 seconds
    max: 1,
    message: { error: 'Veuillez patienter avant de renvoyer un message.' }
});

app.post('/api/chat/send', chatLimiter, async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Connectez-vous pour utiliser le chat.' });
        if (user.banned) return res.status(403).json({ error: 'Vous êtes banni du chat.' });

        const message = sanitize(req.body.message);
        if (!message || message.length < 1 || message.length > 200) {
            return res.status(400).json({ error: 'Le message doit contenir entre 1 et 200 caractères.' });
        }

        await dbRun('INSERT INTO chat_messages (user_id, message) VALUES (?, ?)', [user.id, message]);
        res.json({ success: true });
    } catch (e) {
        console.error('Chat POST error:', e);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

app.get('/api/user/history', async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Non autorisé.' });

        const history = await dbQuery(`
            SELECT query, timestamp 
            FROM search_logs 
            WHERE user_id = ? 
            ORDER BY timestamp DESC 
            LIMIT 20
        `, [user.id]);

        res.json({ success: true, history });
    } catch (e) {
        console.error('History GET error:', e);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ============================================================
// CHECK VPN ENDPOINT (for frontend)
// ============================================================
app.get('/api/check-vpn', async (req, res) => {
    const ip = getClientIp(req);
    const vpnInfo = await checkVPN(ip);
    res.json({ ip, ...vpnInfo });
});

// ============================================================
// PAYMENT LOGGING
// ============================================================
app.post('/api/payment/confirm', async (req, res) => {
    try {
        const user = await getSessionUser(req);
        if (!user) return res.status(401).json({ error: 'Non authentifié.' });

        const { plan, amount, method } = req.body;
        if (!plan || !amount) return res.status(400).json({ error: 'Données de paiement manquantes.' });

        const planCredits = { beginner: 100, pro: 500, premiumhq: 5000 };
        const maxCredits = planCredits[plan] || 5;

        // Calculate subscription end date (30 days from now)
        const startDate = new Date();
        const nextBillingDate = new Date();
        nextBillingDate.setDate(nextBillingDate.getDate() + 30);

        // Update user plan and credits
        await dbRun('UPDATE users SET plan = ?, credits = ?, credits_max = ? WHERE id = ?',
            [plan, maxCredits, maxCredits, user.id]);

        // Create or update subscription
        const existingSub = await dbGet('SELECT * FROM subscriptions WHERE user_id = ? AND status = ?', [user.id, 'active']);
        
        if (existingSub) {
            // Update existing subscription
            await dbRun(`
                UPDATE subscriptions 
                SET plan = ?, next_billing_date = ?, status = 'active', cancelled_at = NULL
                WHERE id = ?
            `, [plan, nextBillingDate.toISOString(), existingSub.id]);
        } else {
            // Create new subscription
            await dbRun(`
                INSERT INTO subscriptions (user_id, plan, paypal_subscription_id, status, start_date, next_billing_date)
                VALUES (?, ?, ?, 'active', ?, ?)
            `, [user.id, plan, `manual_${Date.now()}`, startDate.toISOString(), nextBillingDate.toISOString()]);
        }

        await dbRun('INSERT INTO payments (user_id, amount, plan, method) VALUES (?, ?, ?, ?)',
            [user.id, amount, plan, method || 'paypal']);

        // Webhook payment
        await sendWebhook(process.env.WEBHOOK_PAYMENT_STATS, {
            title: '💎 `[PAYMENT]` Nouvel Abonnement',
            color: 0xFFB703,
            description: `Un utilisateur vient de souscrire au plan \`${plan.toUpperCase()}\` pour 30 jours!`,
            thumbnail: { url: 'https://i.imgur.com/Qj04Kbx.png' },
            fields: [
                { name: '👤 Client', value: `**${user.username}**\n✉️ ${user.email}`, inline: true },
                { name: '📦 Produit', value: `**Plan ${plan.toUpperCase()}**\n💳 ${method || 'PayPal'}`, inline: true },
                { name: '💰 Montant', value: `\`€${amount}\``, inline: true },
                { name: '📅 Durée', value: `30 jours\nExpire: ${nextBillingDate.toLocaleDateString('fr-FR')}`, inline: true },
                { name: '🔗 Discord', value: `<@${user.discord_id || ''}>`, inline: true },
            ],
            footer: { text: 'OsSearch Billing' },
            timestamp: new Date().toISOString()
        });

        const updatedUser = await dbGet('SELECT * FROM users WHERE id = ?', [user.id]);
        res.json({ success: true, user: safeUser(updatedUser), expiresAt: nextBillingDate.toISOString() });
    } catch (e) {
        console.error('Payment error:', e);
        res.status(500).json({ error: 'Erreur serveur.' });
    }
});

// ============================================================
// ADMIN HTML ROUTE (Secret Panel)
// ============================================================
app.get('/nexus-admin-portal', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// ============================================================
// ADMIN ROUTES (SECRET PANEL)
// ============================================================
async function requireAdmin(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Non autorisé.' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Non autorisé.' });

    try {
        // Authenticate admin token against the session that we will store for admins
        const session = await dbGet('SELECT * FROM sessions WHERE token = ?', [token]);
        if (!session || (session.expires_at && new Date(session.expires_at) < new Date())) {
            return res.status(401).json({ error: 'Session invalide ou expirée.' });
        }

        const admin = await dbGet('SELECT * FROM admin_accounts WHERE id = ?', [session.user_id]);
        if (!admin) return res.status(401).json({ error: 'Compte admin introuvable.' });

        req.adminUser = admin;
        next();
    } catch (err) {
        return res.status(500).json({ error: 'Erreur serveur.' });
    }
}

// Admin Auth Endpoint
app.post('/api/admin-auth/login', loginLimiter, async (req, res) => {
    let { username, password } = req.body;
    username = sanitize(username);
    password = sanitize(password);

    if (!username || !password) return res.status(400).json({ error: 'Champs manquants.' });

    const admin = await dbGet('SELECT * FROM admin_accounts WHERE username = ?', [username]);
    if (!admin) return res.status(401).json({ error: 'Identifiants invalides.' });

    const hash = crypto.pbkdf2Sync(password, admin.salt, 100000, 64, 'sha512').toString('hex');
    if (admin.password_hash !== hash) return res.status(401).json({ error: 'Identifiants invalides.' });

    const token = crypto.randomBytes(32).toString('hex');
    const ip = getClientIp(req);
    const ua = sanitize(req.headers['user-agent'] || '');

    if (usePostgres) {
        await db.query('INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL \'12 hours\')', [token, admin.id, ip, ua]);
    } else {
        await dbRun(`INSERT INTO sessions (token, user_id, ip, user_agent, expires_at) VALUES (?, ?, ?, ?, datetime('now', '+12 hours'))`, [token, admin.id, ip, ua]);
    }

    await dbRun('UPDATE admin_accounts SET last_login = CURRENT_TIMESTAMP WHERE id = ?', [admin.id]);

    res.json({ token, admin: { id: admin.id, username: admin.username } });
});

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const users = await dbQuery('SELECT * FROM users ORDER BY created_at DESC');
    res.json({ users: users.map(u => ({ ...safeUser(u), adminNotes: u.admin_notes })) });
});

app.post('/api/admin/set-credits', requireAdmin, async (req, res) => {
    const { userId, credits } = req.body;
    await dbRun('UPDATE users SET credits = ? WHERE id = ?', [credits, userId]);
    res.json({ success: true });
});

app.post('/api/admin/set-plan', requireAdmin, async (req, res) => {
    const { userId, plan: grade } = req.body;
    const roles = ['owner', 'admin', 'staff'];
    const plans = ['premiumhq', 'pro', 'beginner', 'free'];

    if (roles.includes(grade)) {
        await dbRun('UPDATE users SET role = ? WHERE id = ?', [grade, userId]);
        res.json({ success: true, message: 'Grade updated' });
    } else if (plans.includes(grade)) {
        const planCredits = { free: 5, beginner: 100, pro: 500, premiumhq: 5000 };
        const credits = planCredits[grade] || 5;
        await dbRun('UPDATE users SET plan = ?, credits = ?, credits_max = ? WHERE id = ?',
            [grade, credits, credits, userId]);
        res.json({ success: true, message: 'Plan updated' });
    } else {
        res.status(400).json({ error: 'Identifiant de plan ou grade invalide.' });
    }
});

app.post('/api/admin/set-role', requireAdmin, async (req, res) => {
    const { userId, role } = req.body;
    if (!['user', 'admin', 'owner', 'staff'].includes(role)) return res.status(400).json({ error: 'Rôle invalide.' });
    await dbRun('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    res.json({ success: true });
});

app.post('/api/admin/update-notes', requireAdmin, async (req, res) => {
    const { userId, notes } = req.body;
    await dbRun('UPDATE users SET admin_notes = ? WHERE id = ?', [notes || '', userId]);
    res.json({ success: true });
});

app.get('/api/admin/live-logs', requireAdmin, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send history
    LOG_BUFFER.forEach(log => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    });

    const client = { res };
    logStreamClients.add(client);

    req.on('close', () => {
        logStreamClients.delete(client);
    });
});

app.get('/api/admin/ip-alerts', requireAdmin, async (req, res) => {
    try {
        let alerts;
        if (usePostgres) {
            alerts = await dbQuery(`
                SELECT c.user_id, u.username, COUNT(DISTINCT c.ip) as ip_count, STRING_AGG(DISTINCT c.ip, ',') as ips
                FROM connection_logs c
                JOIN users u ON c.user_id = u.id
                WHERE c.timestamp > NOW() - INTERVAL '24 hours'
                GROUP BY c.user_id, u.username
                HAVING COUNT(DISTINCT c.ip) > 3
            `);
        } else {
            alerts = await dbQuery(`
                SELECT user_id, u.username, COUNT(DISTINCT ip) as ip_count, GROUP_CONCAT(DISTINCT ip) as ips
                FROM connection_logs c
                JOIN users u ON c.user_id = u.id
                WHERE c.timestamp > datetime('now', '-24 hours')
                GROUP BY user_id
                HAVING ip_count > 3
            `);
        }
        res.json({ success: true, alerts });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/user/usage-stats', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non autorisé' });

    try {
        let stats;
        if (usePostgres) {
            stats = await dbQuery(`
                SELECT to_char(d::date, 'YYYY-MM-DD') as day, 
                       COUNT(s.id) as count
                FROM generate_series(CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day') d
                LEFT JOIN search_logs s ON s.timestamp::date = d::date AND s.user_id = ?
                GROUP BY d
                ORDER BY d ASC
            `, [user.id]);
        } else {
            stats = await dbQuery(`
                WITH RECURSIVE dates(date) AS (
                    SELECT date('now', '-6 days')
                    UNION ALL
                    SELECT date(date, '+1 day')
                    FROM dates
                    WHERE date < date('now')
                )
                SELECT 
                    d.date as day, 
                    COUNT(s.id) as count
                FROM dates d
                LEFT JOIN search_logs s ON date(s.timestamp, 'localtime') = d.date AND s.user_id = ?
                GROUP BY d.date
                ORDER BY d.date ASC
            `, [user.id]);
        }
        res.json({ success: true, stats });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/delete-user', requireAdmin, async (req, res) => {
    const { userId } = req.body;
    await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]);
    await dbRun('DELETE FROM users WHERE id = ?', [userId]);
    res.json({ success: true });
});

app.post('/api/admin/update-user-email', requireAdmin, async (req, res) => {
    const { userId, newEmail } = req.body;
    if (!newEmail || !newEmail.includes('@')) return res.status(400).json({ error: 'Email invalide' });
    
    try {
        const existing = await dbGet('SELECT 1 FROM users WHERE email = ? AND id != ?', [newEmail, userId]);
        if (existing) return res.status(409).json({ error: 'Cet email est déjà utilisé par un autre utilisateur.' });
        
        await dbRun('UPDATE users SET email = ? WHERE id = ?', [newEmail, userId]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'email' });
    }
});

app.post('/api/admin/reset-user-password', requireAdmin, async (req, res) => {
    const { userId, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Mot de passe trop court (min 6).' });
    
    try {
        const salt = crypto.randomBytes(16).toString('hex');
        const hash = await hashPassword(newPassword, salt);
        await dbRun('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [hash, salt, userId]);
        
        // Optionnel : déconnecter l'utilisateur après le reset
        await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]);
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors du reset du mot de passe' });
    }
});

app.post('/api/auth/change-password', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non autorisé' });
    
    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Nouveau mot de passe trop court.' });

    try {
        const currentHash = await hashPassword(currentPassword, user.salt);
        if (currentHash !== user.password_hash) {
            return res.status(403).json({ error: 'Mot de passe actuel incorrect.' });
        }

        const newSalt = crypto.randomBytes(16).toString('hex');
        const newHash = await hashPassword(newPassword, newSalt);
        await dbRun('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?', [newHash, newSalt, user.id]);
        
        // Supprimer toutes les sessions sauf l'actuelle (optionnel)
        const currentToken = req.headers['authorization']?.replace('Bearer ', '') || req.query.token;
        await dbRun('DELETE FROM sessions WHERE user_id = ? AND token != ?', [user.id, currentToken]);

        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: 'Erreur lors du changement de mot de passe' });
    }
});

app.post('/api/admin/ban-user', requireAdmin, async (req, res) => {
    const { userId, banned } = req.body;
    await dbRun('UPDATE users SET banned = ? WHERE id = ?', [banned ? 1 : 0, userId]);
    if (banned) await dbRun('DELETE FROM sessions WHERE user_id = ?', [userId]);
    res.json({ success: true });
});

app.post('/api/admin/blacklist-ip', requireAdmin, async (req, res) => {
    const { ip, reason } = req.body;
    if (usePostgres) {
        await dbRun('INSERT INTO blacklisted_ips (ip, reason, added_by) VALUES (?, ?, ?) ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason, added_by = EXCLUDED.added_by',
            [ip, reason || '', req.adminUser.username]);
    } else {
        await dbRun('INSERT OR REPLACE INTO blacklisted_ips (ip, reason, added_by) VALUES (?, ?, ?)',
            [ip, reason || '', req.adminUser.username]);
    }
    res.json({ success: true });
});

app.post('/api/admin/unblacklist-ip', requireAdmin, async (req, res) => {
    const { ip } = req.body;
    await dbRun('DELETE FROM blacklisted_ips WHERE ip = ?', [ip]);
    res.json({ success: true });
});


app.get('/api/admin/stats', requireAdmin, async (req, res) => {
    const t24 = usePostgres ? "NOW() - INTERVAL '24 hours'" : "datetime('now', '-24 hours')";
    const t1h = usePostgres ? "NOW() - INTERVAL '1 hour'" : "datetime('now', '-1 hour')";

    const totalUsers = Number((await dbGet(`SELECT COUNT(*) as cnt FROM users`)).cnt);
    const todayUsers = Number((await dbGet(`SELECT COUNT(*) as cnt FROM users WHERE created_at > ${t24}`)).cnt);
    const hourUsers = Number((await dbGet(`SELECT COUNT(*) as cnt FROM users WHERE created_at > ${t1h}`)).cnt);
    const todaySearches = Number((await dbGet(`SELECT COUNT(*) as cnt FROM search_logs WHERE timestamp > ${t24}`)).cnt);
    const todayLogins = Number((await dbGet(`SELECT COUNT(*) as cnt FROM connection_logs WHERE timestamp > ${t24}`)).cnt);
    const todayPayments = Number((await dbGet(`SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE timestamp > ${t24}`)).total);
    const totalPayments = Number((await dbGet('SELECT COALESCE(SUM(amount), 0) as total FROM payments')).total);

    res.json({
        totalUsers, todayUsers, hourUsers,
        todaySearches, todayLogins,
        todayPayments, totalPayments
    });
});

app.get('/api/admin/logs', requireAdmin, async (req, res) => {
    const searchLogs = await dbQuery('SELECT s.*, u.username FROM search_logs s LEFT JOIN users u ON s.user_id = u.id ORDER BY s.timestamp DESC LIMIT 100');
    const connectionLogs = await dbQuery('SELECT c.*, u.username FROM connection_logs c LEFT JOIN users u ON c.user_id = u.id ORDER BY c.timestamp DESC LIMIT 100');
    res.json({ searchLogs, connectionLogs });
});

app.post('/api/admin/clear-logs', requireAdmin, async (req, res) => {
    const { type } = req.body;
    if (type === 'search') {
        await dbRun('DELETE FROM search_logs');
    } else if (type === 'connection') {
        await dbRun('DELETE FROM connection_logs');
    } else {
        return res.status(400).json({ error: 'Type invalide' });
    }
    res.json({ success: true });
});

app.get('/api/admin/blacklist', requireAdmin, async (req, res) => {
    const blacklisted = await dbQuery('SELECT * FROM blacklisted_ips ORDER BY created_at DESC');
    res.json({ blacklisted });
});

// ============================================================
// PERIODIC STATS WEBHOOKS (every 5 minutes)
// ============================================================
setInterval(async () => {
    try {
        const t1h = usePostgres ? "NOW() - INTERVAL '1 hour'" : "datetime('now', '-1 hour')";
        const t24 = usePostgres ? "NOW() - INTERVAL '24 hours'" : "datetime('now', '-24 hours')";

        // Account Stats
        const totalUsers = Number((await dbGet(`SELECT COUNT(*) as cnt FROM users`)).cnt);
        const newUsers1h = Number((await dbGet(`SELECT COUNT(*) as cnt FROM users WHERE created_at > ${t1h}`)).cnt);
        const newUsers24h = Number((await dbGet(`SELECT COUNT(*) as cnt FROM users WHERE created_at > ${t24}`)).cnt);
        const connections24h = Number((await dbGet(`SELECT COUNT(*) as cnt FROM connection_logs WHERE timestamp > ${t24}`)).cnt);
        const searches24h = Number((await dbGet(`SELECT COUNT(*) as cnt FROM search_logs WHERE timestamp > ${t24}`)).cnt);

        await sendWebhook(process.env.WEBHOOK_ACCOUNT_STATS, {
            title: '📈 `[STATS]` Rapport Périodique Automatique',
            color: 0x00F0FF,
            description: `Résumé de l'activité du réseau **OsSearch**.`,
            fields: [
                { name: '👥 Audience', value: `🚀 **Total:** \`${totalUsers}\` users\n🔥 **Aujourd'hui:** \`+${newUsers24h}\` nouveaux\n⚡ **Dernière Heure:** \`+${newUsers1h}\``, inline: true },
                { name: '🎯 Activité (24h)', value: `🔑 **Connexions:** \`${connections24h}\`\n🔍 **Recherches:** \`${searches24h}\``, inline: true },
            ],
            footer: { text: 'OsSearch Analytics' },
            timestamp: new Date().toISOString()
        });

        // Payment Stats
        const payments24h = await dbGet(`SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM payments WHERE timestamp > ${t24}`);
        const paymentsTotal = await dbGet('SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt FROM payments');

        await sendWebhook(process.env.WEBHOOK_PAYMENT_STATS, {
            title: '🏦 `[FINANCE]` Rapport Financier',
            color: 0x00FF88,
            description: `Performance des ventes de **OsSearch**.`,
            fields: [
                { name: '💶 Dernières 24 Heures', value: `💰 **Revenus:** \`€${Number(payments24h.total).toFixed(2)}\`\n🧾 **Ventes:** \`${payments24h.cnt}\``, inline: true },
                { name: '💎 Total Cumulé', value: `💰 **Revenus:** \`€${Number(paymentsTotal.total).toFixed(2)}\`\n📦 **Ventes:** \`${paymentsTotal.cnt}\``, inline: true },
            ],
            footer: { text: 'OsSearch Billing' },
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error('Stats webhook error:', e.message);
    }
}, 5 * 60 * 1000); // 5 minutes

// ============================================================
// SECURITY ALERT ENDPOINT
// ============================================================
app.post('/api/security-alert', async (req, res) => {
    const ip = getClientIp(req);
    const user = await getSessionUser(req);
    const { type, details } = req.body;

    await dbRun('INSERT INTO security_alerts (ip, email, discord_id, alert_type, details) VALUES (?, ?, ?, ?, ?)',
        [ip, user?.email || '', user?.discord_id || '', type || 'unknown', details || '']);

    await sendWebhook(process.env.WEBHOOK_SECURITY_LOGS, {
        title: '🚨 `[SECURITY]` Alerte Système',
        color: 0xFF0000,
        description: `Une activité suspecte a été détectée.`,
        fields: [
            { name: '🛡️ Type d\'Alerte', value: `\`${type || 'Unknown'}\``, inline: true },
            { name: '👤 Cible', value: `**${user?.username || 'Anonyme'}**\nIP: ||${ip}||`, inline: true },
            { name: '📋 Détails Techniques', value: `\`\`\`\n${details || '-'}\n\`\`\``, inline: false },
        ],
        footer: { text: 'OsSearch Security System' },
        timestamp: new Date().toISOString()
    });

    res.json({ success: true });
});



// ============================================================
// LOOKUP2BZ API ENDPOINT
// ============================================================
app.get('/v1/lookup', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });

    const LOOKUP_API_URL = 'https://api.lookup2bz.xyz/api/v1/query';
    const API_KEY = process.env.LOOKUP2BZ_API_KEY;
    const ip = getClientIp(req);

    if (!API_KEY) {
        console.error('[LOOKUP API] API key not configured');
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        console.log('[LOOKUP API] Starting lookup request...');

        // Extract query parameters
        const { query, limit } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        // Log search to database
        if (usePostgres) {
            await db.query('INSERT INTO search_logs (user_id, query, ip) VALUES ($1, $2, $3)', [user.id, query, ip]);
            await db.query('UPDATE users SET total_searches = total_searches + 1 WHERE id = $1', [user.id]);
        } else {
            db.prepare('INSERT INTO search_logs (user_id, query, ip) VALUES (?, ?, ?)').run(user.id, query, ip);
            db.prepare('UPDATE users SET total_searches = total_searches + 1 WHERE id = ?').run(user.id);
        }

        // Send webhook for search log
        setImmediate(async () => {
            try {
                const vpnInfo = await checkVPN(ip);
                await sendWebhook(process.env.WEBHOOK_SEARCH_LOGS, {
                    title: '🔍 `[SEARCH]` Nouvelle Recherche',
                    color: 0x00FF88,
                    description: `**${user.username}** a effectué une recherche.`,
                    fields: [
                        { name: '👤 Utilisateur', value: `\`${user.username}\`\n📧 ${user.email}`, inline: true },
                        { name: '🔎 Requête', value: `\`${query}\``, inline: true },
                        { name: '🌍 Localisation', value: `📍 ${vpnInfo.city}, ${vpnInfo.country}`, inline: true },
                        { name: '🌐 Réseau', value: `💻 IP: ||${ip}||\n🛡️ VPN: ${vpnInfo.isVpn ? '✅' : '❌'}`, inline: true },
                        { name: '📊 Stats', value: `Total recherches: ${user.total_searches + 1}\nPlan: ${user.plan}`, inline: true },
                    ],
                    footer: { text: 'OsSearch Search System' },
                    timestamp: new Date().toISOString()
                });
            } catch (err) {
                console.error('Search webhook error:', err.message);
            }
        });

        // Build query string
        const queryParams = new URLSearchParams();
        queryParams.append('query', query);
        if (limit) {
            queryParams.append('limit', limit);
        }

        const url = `${LOOKUP_API_URL}?${queryParams.toString()}`;
        console.log(`[LOOKUP API] Proxying request to: ${url}`);

        // Make request with timeout handling
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 60000);
        });

        const response = await Promise.race([
            fetch(url, {
                method: 'GET',
                headers: {
                    'X-API-Key': API_KEY,
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Connection': 'keep-alive'
                }
            }),
            timeoutPromise
        ]);

        console.log(`[LOOKUP API] Response status: ${response.status}`);

        // Read response body
        let responseText;
        try {
            responseText = await response.text();
            console.log(`[LOOKUP API] Response length: ${responseText.length} bytes`);
        } catch (textErr) {
            console.error('[LOOKUP API] Failed to read response text:', textErr.message);
            responseText = '';
        }

        // Handle non-200 responses
        if (!response.ok) {
            console.error(`[LOOKUP API] Received error status ${response.status}`);
            return res.status(response.status).json({
                error: 'API returned error',
                status: response.status,
                message: responseText.substring(0, 500)
            });
        }

        // Parse JSON response
        if (!responseText || responseText.trim() === '') {
            console.error('[LOOKUP API] Empty response body');
            return res.status(200).json({
                status: 'success',
                data: []
            });
        }

        let data;
        try {
            data = JSON.parse(responseText);
            console.log('[LOOKUP API] Successfully parsed JSON response');
        } catch (parseErr) {
            console.error('[LOOKUP API] JSON parse error:', parseErr.message);
            return res.status(500).json({
                error: 'Invalid response format from API',
                parseError: parseErr.message
            });
        }

        // Return the data
        return res.status(200).json(data);

    } catch (error) {
        if (error.message === 'Request timeout') {
            console.error('[LOOKUP API] Request timeout after 60s');
            return res.status(504).json({ error: 'API request timeout' });
        }

        console.error('[LOOKUP API] CRITICAL ERROR:', error.message);
        return res.status(500).json({
            error: 'API call failed',
            message: error.message
        });
    }
});

// ============================================================
// LOOKUP2BZ SNAPCHAT API ENDPOINT
// ============================================================
app.get('/v1/snapchat', async (req, res) => {
    const user = await getSessionUser(req);
    if (!user) return res.status(401).json({ error: 'Non authentifié.' });

    const SNAPCHAT_API_URL = 'https://api.lookup2bz.xyz/api/v1/snapchat';
    const API_KEY = process.env.LOOKUP2BZ_API_KEY;
    const ip = getClientIp(req);

    if (!API_KEY) {
        console.error('[SNAPCHAT API] API key not configured');
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        console.log('[SNAPCHAT API] Starting snapchat request...');

        // Extract query parameter
        const { query } = req.query;

        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        // Log search to database
        if (usePostgres) {
            await db.query('INSERT INTO search_logs (user_id, query, ip) VALUES ($1, $2, $3)', [user.id, `[SNAPCHAT] ${query}`, ip]);
            await db.query('UPDATE users SET total_searches = total_searches + 1 WHERE id = $1', [user.id]);
        } else {
            db.prepare('INSERT INTO search_logs (user_id, query, ip) VALUES (?, ?, ?)').run(user.id, `[SNAPCHAT] ${query}`, ip);
            db.prepare('UPDATE users SET total_searches = total_searches + 1 WHERE id = ?').run(user.id);
        }

        // Send webhook for Snapchat search log
        setImmediate(async () => {
            try {
                const vpnInfo = await checkVPN(ip);
                await sendWebhook(process.env.WEBHOOK_SEARCH_LOGS, {
                    title: '👻 `[SNAPCHAT]` Recherche Snapchat',
                    color: 0xFFFC00,
                    description: `**${user.username}** a effectué une recherche Snapchat.`,
                    fields: [
                        { name: '👤 Utilisateur', value: `\`${user.username}\`\n📧 ${user.email}`, inline: true },
                        { name: '👻 Requête', value: `\`${query}\``, inline: true },
                        { name: '🌍 Localisation', value: `📍 ${vpnInfo.city}, ${vpnInfo.country}`, inline: true },
                        { name: '🌐 Réseau', value: `💻 IP: ||${ip}||\n🛡️ VPN: ${vpnInfo.isVpn ? '✅' : '❌'}`, inline: true },
                        { name: '📊 Stats', value: `Total recherches: ${user.total_searches + 1}\nPlan: ${user.plan}`, inline: true },
                    ],
                    footer: { text: 'OsSearch Snapchat System' },
                    timestamp: new Date().toISOString()
                });
            } catch (err) {
                console.error('Snapchat webhook error:', err.message);
            }
        });

        // Build query string
        const queryParams = new URLSearchParams();
        queryParams.append('query', query);

        const url = `${SNAPCHAT_API_URL}?${queryParams.toString()}`;
        console.log(`[SNAPCHAT API] Proxying request to: ${url}`);

        // Make request with timeout handling
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 60000);
        });

        const response = await Promise.race([
            fetch(url, {
                method: 'GET',
                headers: {
                    'X-API-Key': API_KEY,
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Connection': 'keep-alive'
                }
            }),
            timeoutPromise
        ]);

        console.log(`[SNAPCHAT API] Response status: ${response.status}`);

        // Read response body
        let responseText;
        try {
            responseText = await response.text();
            console.log(`[SNAPCHAT API] Response length: ${responseText.length} bytes`);
        } catch (textErr) {
            console.error('[SNAPCHAT API] Failed to read response text:', textErr.message);
            responseText = '';
        }

        // Handle non-200 responses
        if (!response.ok) {
            console.error(`[SNAPCHAT API] Received error status ${response.status}`);
            return res.status(response.status).json({
                error: 'API returned error',
                status: response.status,
                message: responseText.substring(0, 500)
            });
        }

        // Parse JSON response
        if (!responseText || responseText.trim() === '') {
            console.error('[SNAPCHAT API] Empty response body');
            return res.status(200).json({
                success: false,
                result: null
            });
        }

        let data;
        try {
            data = JSON.parse(responseText);
            console.log('[SNAPCHAT API] Successfully parsed JSON response');
        } catch (parseErr) {
            console.error('[SNAPCHAT API] JSON parse error:', parseErr.message);
            return res.status(500).json({
                error: 'Invalid response format from API',
                parseError: parseErr.message
            });
        }

        // Return the data
        return res.status(200).json(data);

    } catch (error) {
        if (error.message === 'Request timeout') {
            console.error('[SNAPCHAT API] Request timeout after 60s');
            return res.status(504).json({ error: 'API request timeout' });
        }

        console.error('[SNAPCHAT API] CRITICAL ERROR:', error.message);
        return res.status(500).json({
            error: 'API call failed',
            message: error.message
        });
    }
});

// ============================================================
// HELPERS
// ============================================================
function parseBrowser(ua) {
    if (!ua) return 'Unknown';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Edg/')) return 'Edge';
    if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Safari')) return 'Safari';
    return 'Other';
}

function safeUser(user) {
    if (!user) return null;

    // Safety check: ensure UUID exists
    if (!user.uuid) {
        try {
            const newUuid = crypto.randomUUID();
            dbRun('UPDATE users SET uuid = ? WHERE id = ?', [newUuid, user.id]).catch(() => {});
            user.uuid = newUuid;
        } catch (e) {
            console.error('SafeUser UUID fix error:', e.message);
        }
    }

    // Safety check: ensure profile_views exists
    if (user.profile_views === undefined || user.profile_views === null) {
        try {
            dbRun('UPDATE users SET profile_views = 0 WHERE id = ?', [user.id]).catch(() => {});
            user.profile_views = 0;
        } catch (e) {
            console.error('SafeUser profile_views fix error:', e.message);
        }
    }

    return {
        id: user.id,
        uuid: user.uuid,
        username: user.username,
        email: user.email,
        plan: user.plan,
        credits: user.credits,
        creditsMax: user.credits_max,
        totalSearches: user.total_searches,
        discordId: user.discord_id,
        discordTag: user.discord_tag,
        role: user.role,
        createdAt: user.created_at,
        lastLogin: user.last_login,
        banned: user.banned,
        avatarUrl: user.avatar_url,
        bannerUrl: user.banner_url || '',
        profileBio: user.profile_bio || '',
        profileMusicUrl: user.profile_music_url || '',
        profileEffect: user.profile_effect || 'none',
        adminNotes: user.admin_notes || '',
        profileViews: user.profile_views || 0
    };
}

// ============================================================
// FALLBACK ROUTE
// ============================================================
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================================
// START SERVER
// ============================================================
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🌑 NEXUS ADMIN SYSTEM - READY`);
    console.log(`🚀 Network Port: ${PORT}`);
    console.log(`📊 Database: ${usePostgres ? 'PostgreSQL (comptes partagés)' : 'SQLite locale (ossearch.db)'}`);
    console.log(`🤖 Bot Status: Integrated and Running\n`);
});

// ============================================================
// INTEGRATE DISCORD BOT (SAFE START)
// ============================================================
// Temporarily disabled due to invalid Discord token
// try {
//     require('./bot.js');
// } catch (err) {
//     console.error('❌ Erreur critique lors du chargement du bot:', err.message);
// }

module.exports = { db, sendWebhook, safeUser };
