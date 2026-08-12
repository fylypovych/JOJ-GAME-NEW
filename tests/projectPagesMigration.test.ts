import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { newDb } from 'pg-mem';

test('project pages migration creates a persistent editable rules record', async () => {
  const migration = await readFile(
    path.resolve('db', 'migrations', '005_project_pages.sql'),
    'utf8',
  );
  const db = newDb();
  db.public.none(migration);
  db.public.none(`INSERT INTO project_pages
    (page_key, title, body, status)
    VALUES ('rules', 'Правила', 'Перше правило', 'published')`);

  const page = db.public.one(
    `SELECT page_key, title, body, status FROM project_pages WHERE page_key = 'rules'`,
  );
  assert.deepEqual(page, {
    page_key: 'rules',
    title: 'Правила',
    body: 'Перше правило',
    status: 'published',
  });
  assert.throws(
    () =>
      db.public.none(
        `UPDATE project_pages SET status = 'invalid' WHERE page_key = 'rules'`,
      ),
    /check constraint/i,
  );
});
