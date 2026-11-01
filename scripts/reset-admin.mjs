import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('✖ DATABASE_URL not set (use --env-file=.env.local).');
    process.exit(1);
  }
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    console.error('✖ ADMIN_PASSWORD is required.');
    process.exit(1);
  }

  const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: true } });
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rowCount } = await pool.query(
      'update admins set password_hash = $1 where username = $2',
      [hash, username],
    );
    if (!rowCount) {
      await pool.query(
        `insert into admins (username, password_hash, display_name, role)
         values ($1, $2, $3, 'admin')`,
        [username, hash, 'מנהל'],
      );
      console.log(`✔ Admin created: user = ${username}`);
    } else {
      console.log(`✔ Password updated: user = ${username}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('✖ Reset failed:', err);
  process.exit(1);
});
