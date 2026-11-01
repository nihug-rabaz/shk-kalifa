// Runs db/schema.sql against Neon, then seeds a default group + admin.
// Usage:  npm run db:migrate         (loads .env.local via --env-file)
//         ADMIN_USER=... ADMIN_PASSWORD=... npm run db:migrate
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const { Pool } = pg;

// Same rule as src/lib/db.ts: a database on this machine speaks plain TCP, everything
// else is remote and must be encrypted.
function sslFor(connectionString) {
  try {
    const host = new URL(connectionString).hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  } catch {}
  return { rejectUnauthorized: true };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('✖ DATABASE_URL not set (expected in .env.local).');
    process.exit(1);
  }
  const pool = new Pool({ connectionString, ssl: sslFor(connectionString) });

  try {
    console.log('→ Connecting to Neon…');
    const { rows: v } = await pool.query('select version()');
    console.log('  connected:', v[0].version.split(',')[0]);

    console.log('→ Applying schema (db/schema.sql)…');
    const schema = await readFile(join(root, 'db', 'schema.sql'), 'utf8');
    await pool.query(schema);
    console.log('  schema applied.');

    // ── Default group "בניין A" (Jerusalem coordinates for zmanim) ──────────
    console.log('→ Seeding default group…');
    const { rows: grp } = await pool.query(
      `insert into groups (name, slug, location, theme, music)
       values ($1, $2, $3, $4, $5)
       on conflict (slug) do update set name = excluded.name
       returning id, name, slug`,
      [
        'בניין A',
        'binyan-a',
        JSON.stringify({
          label: 'ירושלים',
          latitude: 31.7683,
          longitude: 35.2137,
          elevation: 754,
          timezone: 'Asia/Jerusalem',
        }),
        JSON.stringify({ primaryHex: '#1c4080', gradient: ['#bbdfc5', '#d9efe0'] }),
        JSON.stringify({ enabled: false, volume: 0.6, shuffle: true, loop: true }),
      ],
    );
    const groupId = grp[0].id;
    console.log(`  group #${groupId} "${grp[0].name}" (${grp[0].slug})`);

    // Seed sample content so the board is not empty on first boot. Field names match
    // the board-data.js contract exactly. Self-corrects sample rows on re-run but
    // never clobbers rows an admin has already edited (updated_by is not null).
    await pool.query(
      `insert into board_content (group_id, prayers, updates, letter)
       values ($1, $2, $3, null)
       on conflict (group_id) do update
         set prayers = excluded.prayers, updates = excluded.updates
         where board_content.updated_by is null`,
      [
        groupId,
        JSON.stringify([
          { id: 'p1', title: 'שחרית', timeType: 'fixed', fixedTime: '06:30', location: 'בית כנסת מרכזי' },
          { id: 'p2', title: 'מנחה', timeType: 'fixed', fixedTime: '13:00', location: 'בית כנסת מרכזי' },
          { id: 'p3', title: 'ערבית', timeType: 'relative', relativeBase: 'stars_out', offsetMinutes: 0, fixedTime: '19:00', location: 'בית כנסת מרכזי' },
        ]),
        JSON.stringify([
          { id: 'u1', title: 'עדכון כללי', type: 'עדכון כללי', content: 'ברוכים הבאים — מערכת התצוגה פעילה', displayTime: 12 },
        ]),
      ],
    );
    console.log('  sample content seeded.');

    // ── Default admin ────────────────────────────────────────────────────────
    console.log('→ Seeding admin user…');
    const username = process.env.ADMIN_USER || 'admin';
    const provided = process.env.ADMIN_PASSWORD;
    const password = provided || randomBytes(9).toString('base64url');
    const hash = await bcrypt.hash(password, 12);

    const { rows: existing } = await pool.query('select id from admins where username = $1', [username]);
    if (existing.length) {
      console.log(`  admin "${username}" already exists — left unchanged.`);
    } else {
      await pool.query(
        `insert into admins (username, password_hash, display_name, role)
         values ($1, $2, $3, 'admin')`,
        [username, hash, 'מנהל'],
      );
      console.log('  ┌───────────────────────────────────────────────');
      console.log(`  │ Admin created:  user = ${username}`);
      console.log(`  │                 pass = ${password}`);
      if (!provided) console.log('  │ (randomly generated — save it, then change it in the app)');
      console.log('  └───────────────────────────────────────────────');
    }

    console.log('\n✔ Migration complete.');
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('✖ Migration failed:', err);
  process.exit(1);
});
