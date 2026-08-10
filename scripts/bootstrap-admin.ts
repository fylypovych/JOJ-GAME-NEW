#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadEnvFile } from '../server/env';
import { createUserStore } from '../server/services/user-store';

type BootstrapOptions = {
  username: string;
  email?: string;
  displayName?: string;
  preferredLang: 'uk' | 'en';
  ifNoAdmin: boolean;
};

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const usage = () => {
  process.stdout.write(`Usage:
  printf '%s' "$PASSWORD" | npm run admin:create -- --username NAME [options]

Options:
  --username NAME       Required administrator username
  --email EMAIL         Optional email address
  --display-name NAME   Optional public display name
  --lang uk|en          Preferred language (default: uk)
  --if-no-admin         Exit successfully without changes if an administrator exists
  --password-stdin      Required safety acknowledgement; read password from stdin
  -h, --help            Show this help
`);
};

export const parseBootstrapArgs = (
  argv: string[],
): BootstrapOptions & { passwordStdin: boolean } => {
  const takeValue = (index: number, option: string) => {
    const value = argv[index + 1]?.trim();
    if (!value || value.startsWith('--'))
      throw new Error(`${option} requires a value.`);
    return value;
  };

  const options: BootstrapOptions & { passwordStdin: boolean } = {
    username: '',
    preferredLang: 'uk',
    ifNoAdmin: false,
    passwordStdin: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--username') options.username = takeValue(index++, arg);
    else if (arg === '--email') options.email = takeValue(index++, arg);
    else if (arg === '--display-name')
      options.displayName = takeValue(index++, arg);
    else if (arg === '--lang') {
      const lang = takeValue(index++, arg);
      if (lang !== 'uk' && lang !== 'en')
        throw new Error('--lang must be uk or en.');
      options.preferredLang = lang;
    } else if (arg === '--if-no-admin') options.ifNoAdmin = true;
    else if (arg === '--password-stdin') options.passwordStdin = true;
    else if (arg === '-h' || arg === '--help') {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.username) throw new Error('--username is required.');
  if (!options.passwordStdin) {
    throw new Error(
      '--password-stdin is required; passwords in command arguments are not supported.',
    );
  }
  return options;
};

const readPasswordFromStdin = async () => {
  if (process.stdin.isTTY) {
    throw new Error(
      'Refusing to echo a password in a terminal. Pipe it to --password-stdin.',
    );
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  const password = Buffer.concat(chunks)
    .toString('utf8')
    .replace(/[\r\n]+$/, '');
  if (password.length < 8)
    throw new Error('Password must be at least 8 characters.');
  return password;
};

export const bootstrapAdministrator = async (
  pool: Pool,
  options: BootstrapOptions,
  password: string,
) => {
  const existingAdmin = await pool.query<{ username: string }>(`
    SELECT username
    FROM app_users
    WHERE role = 'administrator' AND status = 'active'
    ORDER BY created_at ASC
    LIMIT 1
  `);
  if (options.ifNoAdmin && existingAdmin.rows[0]) {
    return { created: false, username: existingAdmin.rows[0].username };
  }

  const duplicate = await pool.query<{
    username: string;
    role: string;
    status: string;
  }>(
    `
    SELECT username, role, status
    FROM app_users
    WHERE lower(username) = lower($1)
       OR ($2::text IS NOT NULL AND lower(email) = lower($2))
    LIMIT 1
  `,
    [options.username, options.email ?? null],
  );
  if (duplicate.rows[0]) {
    if (
      duplicate.rows[0].role === 'administrator' &&
      duplicate.rows[0].status === 'active'
    ) {
      return { created: false, username: duplicate.rows[0].username };
    }
    throw new Error(
      `User "${duplicate.rows[0].username}" already exists but is not an active administrator.`,
    );
  }

  const userStore = createUserStore(pool);
  const user = await userStore.createUser({
    username: options.username,
    email: options.email,
    password,
    displayName: options.displayName,
    preferredLang: options.preferredLang,
    role: 'administrator',
  });
  return { created: true, username: user.username };
};

const main = async () => {
  const options = parseBootstrapArgs(process.argv.slice(2));
  const password = await readPasswordFromStdin();
  loadEnvFile(path.resolve(appRoot, '.env'));
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required in .env.');

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const result = await bootstrapAdministrator(pool, options, password);
    process.stdout.write(
      result.created
        ? `Administrator "${result.username}" created.\n`
        : `Administrator "${result.username}" already exists; no changes made.\n`,
    );
  } finally {
    await pool.end();
  }
};

const isEntryPoint = process.argv[1]
  ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;
if (isEntryPoint) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[admin:create] ${message}\n`);
    process.exitCode = 1;
  });
}
