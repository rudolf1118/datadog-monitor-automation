import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';
import { v2 as ddv2 } from '@datadog/datadog-api-client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DD_SITE = process.env.DD_SITE || 'datadoghq.com';
const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;

if (!DD_API_KEY || !DD_APP_KEY) {
  console.error('Missing DD_API_KEY or DD_APP_KEY env vars.');
  process.exit(1);
}

const PORT = Number(process.env.PORT || 8080);
const POLL_INTERVAL_SEC = Number(process.env.POLL_INTERVAL_SEC || 300); // 5m
const LOGS_WINDOW_MIN = Number(process.env.LOGS_WINDOW_MIN || 5);
const MAX_LOGS_PER_QUERY = Number(process.env.MAX_LOGS_PER_QUERY || 500);

const DATA_DIR = path.join(__dirname, 'data');
const LINKS_FILE = path.join(__dirname, 'links.json');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readLinks() {
  const raw = fs.readFileSync(LINKS_FILE, 'utf8');
  const arr = JSON.parse(raw);
  if (!Array.isArray(arr)) throw new Error('links.json must be an array');
  return arr;
}

function extractQueryFromLink(link) {
  try {
    const u = new URL(link);
    const q = u.searchParams.get('query') || '';
    return decodeURIComponent(q);
  } catch {
    return '';
  }
}


function withErrorFilter(query) {
  const lower = query.toLowerCase();
  const hasStatus =
    lower.includes('status:error') ||
    lower.includes('status:critical') ||
    lower.includes('status:warn') ||
    lower.includes('status:info') ||
    lower.includes('@status:') ||
    lower.includes('status:');

  if (hasStatus) return query;
  return `(${query}) AND (status:error OR status:critical)`;
}

function pickLogFields(d) {
  const attrs = d?.attributes || {};
  const tags = attrs?.tags || [];
  return {
    timestamp: attrs?.timestamp,
    status: attrs?.status,
    service: attrs?.service,
    host: attrs?.host,
    message: attrs?.message,
    ddsource: attrs?.attributes?.ddsource || attrs?.ddsource,
    tags,
  };
}

const config = ddv2.createConfiguration({
  authMethods: {
    apiKeyAuth: DD_API_KEY,
    appKeyAuth: DD_APP_KEY,
  },
});

config.setServerVariables({});
config.setServerIndex(0);
config.setServer({
  url: `https://api.${DD_SITE}`,
  description: 'Custom site',
  variables: {},
});

const logsApi = new ddv2.LogsApi(config);

async function fetchLogsRaw(query, fromISO, toISO, max) {
  // POST search with pagination
  const pageSize = 100;
  const collected = [];

  let page = { limit: pageSize };
  while (collected.length < max) {
    const body = {
      filter: {
        query,
        from: fromISO,
        to: toISO,
      },
      sort: 'timestamp',
      page,
    };

    const resp = await logsApi.listLogs({ body });
    const data = resp?.data || [];
    if (data.length === 0) break;

    for (const d of data) {
      collected.push(d);
      if (collected.length >= max) break;
    }

    const nextCursor = resp?.meta?.page?.after;
    if (!nextCursor) break;
    page = { limit: pageSize, cursor: nextCursor };
  }

  return collected.map(pickLogFields);
}

async function runOnce() {
  const links = readLinks();

  const now = Date.now();
  const from = new Date(now - LOGS_WINDOW_MIN * 60 * 1000).toISOString();
  const to = new Date(now).toISOString();

  for (const item of links) {
    const { orgKey, connectorName, link, query: qOverride } = item;

    if (!orgKey || !connectorName) {
      console.warn('Skipping item without orgKey/connectorName', item);
      continue;
    }

    const rawQuery = qOverride && qOverride.trim()
      ? qOverride.trim()
      : extractQueryFromLink(link || '');

    if (!rawQuery) {
      console.warn('Skipping item without query/link', item);
      continue;
    }

    const finalQuery = withErrorFilter(rawQuery);

    try {
      const logs = await fetchLogsRaw(finalQuery, from, to, MAX_LOGS_PER_QUERY);

      const dir = path.join(DATA_DIR, orgKey, connectorName);
      ensureDir(dir);

      const file = path.join(dir, 'errors.json');
      const payload = {
        orgKey,
        connectorName,
        generatedAt: new Date().toISOString(),
        windowMinutes: LOGS_WINDOW_MIN,
        query: finalQuery,
        count: logs.length,
        items: logs
      };

      fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
      console.log(`[ok] ${orgKey}/${connectorName} -> ${logs.length} logs`);
    } catch (e) {
      console.error(`[fail] ${orgKey}/${connectorName}`, e?.message || e);
    }
  }
}

async function start() {
  ensureDir(DATA_DIR);

  await runOnce();

  setInterval(() => {
    runOnce().catch(err => console.error('poll error', err));
  }, POLL_INTERVAL_SEC * 1000);

  const app = express();
  app.use(express.static(DATA_DIR));

  app.get('/health', (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));
  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      `Datadog Errors\n\n` +
      `Serving JSONs from / (data folder)\n` +
      `Example: /${encodeURIComponent('8d91bd77211a06ec')}/${encodeURIComponent('74cbc2a612068bbc')}/errors.json\n`
    );
  });

  app.listen(PORT, () => {
    console.log(`Serving ${DATA_DIR} at http://localhost:${PORT}`);
  });
}

start().catch((e) => {
  console.error(e);
  process.exit(1);
});