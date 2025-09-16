import dd from '@datadog/datadog-api-client';
import { config } from '../config/index.js';
import { pickLogFields } from '../utils/queryUtils.js';

export class DatadogClient {
  constructor() {
    // Try a simpler configuration approach
    this.config = dd.client.createConfiguration({
      authMethods: {
        apiKeyAuth: config.datadog.apiKey,
        appKeyAuth: config.datadog.appKey,
      },
    });

    // Don't set server configuration - let it use defaults
    this.logsApi = new dd.v2.LogsApi(this.config);
  }

  async fetchLogs(query, fromISO, toISO, maxLogs) {
    const pageSize = 100;
    const collected = [];

    let page = { limit: pageSize };
    while (collected.length < maxLogs) {
      const body = {
        filter: {
          query,
          from: fromISO,
          to: toISO,
        },
        sort: 'timestamp',
        page,
      };

      const resp = await this.logsApi.listLogs({ body });
      const data = resp?.data || [];
      if (data.length === 0) break;

      for (const d of data) {
        collected.push(d);
        if (collected.length >= maxLogs) break;
      }

      const nextCursor = resp?.meta?.page?.after;
      if (!nextCursor) break;
      page = { limit: pageSize, cursor: nextCursor };
    }

    return collected.map(pickLogFields);
  }
}
