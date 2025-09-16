import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DD_SITE = process.env.DD_SITE || 'datadoghq.com';
const DD_API_KEY = process.env.DD_API_KEY;
const DD_APP_KEY = process.env.DD_APP_KEY;

if (!DD_API_KEY || !DD_APP_KEY) {
  console.error('Missing DD_API_KEY or DD_APP_KEY env vars.');
  process.exit(1);
}

export const config = {
  datadog: {
    site: DD_SITE,
    apiKey: DD_API_KEY,
    appKey: DD_APP_KEY,
  },
  server: {
    port: Number(process.env.PORT || 8080),
  },
  polling: {
    intervalSec: Number(process.env.POLL_INTERVAL_SEC || 300),
    logsWindowMin: Number(process.env.LOGS_WINDOW_MIN || 5),
    maxLogsPerQuery: Number(process.env.MAX_LOGS_PER_QUERY || 500),
  },
  paths: {
    dataDir: path.join(__dirname, '../../data'),
    linksFile: path.join(__dirname, '../../links.json'),
  },
};
