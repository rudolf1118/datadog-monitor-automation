import { DatadogClient } from '../datadog/client.js';
import { pickLogFields } from '../utils/queryUtils.js';
import { ensureDir, writeErrorData } from '../utils/fileUtils.js';
import { config } from '../config/index.js';
import path from 'path';

export class LogProcessor {
  constructor() {
    this.datadogClient = new DatadogClient();
  }

  async processLinks(links) {
    const now = Date.now();
    const from = new Date(now - config.polling.logsWindowMin * 60 * 1000).toISOString();
    const to = new Date(now).toISOString();

    const allErrors = [];
    const summary = {
      totalErrors: 0,
      byOrg: {},
      byIntegration: {},
      byStatus: {},
      processedLinks: 0,
      failedLinks: 0
    };

    for (const item of links) {
      try {
        const result = await this.processLinkItem(item, from, to);
        if (result && result.logs && result.logs.length > 0) {
          const enrichedLogs = result.logs.map(log => ({
            ...log,
            orgKey: result.orgKey,
            connectorName: result.connectorName,
            datadogLink: result.originalLink
          }));
          
          allErrors.push(...enrichedLogs);
          
          summary.totalErrors += result.logs.length;
          summary.processedLinks++;
          
          summary.byOrg[result.orgKey] = (summary.byOrg[result.orgKey] || 0) + result.logs.length;
          
          summary.byIntegration[result.connectorName] = (summary.byIntegration[result.connectorName] || 0) + result.logs.length;
          
         
          result.logs.forEach(log => {
            const status = log.status || 'unknown';
            summary.byStatus[status] = (summary.byStatus[status] || 0) + 1;
          });
        } else {
          summary.processedLinks++;
        }
      } catch (error) {
        summary.failedLinks++;
        console.error(`[fail] ${item.orgKey}/${item.connectorName}`, error?.message || error);
      }
    }

    
    await this.writeConsolidatedErrors(allErrors, summary, from, to);
  }

  async processLinkItem(item, fromISO, toISO) {
    const { orgKey, connectorName, link, query: qOverride } = item;

    if (!orgKey || !connectorName) {
      console.warn('Skipping item without orgKey/connectorName', item);
      return;
    }

    const resolvedConnectorName = this.connectorNameResolver(connectorName);

    const rawQuery = qOverride && qOverride.trim()
      ? qOverride.trim()
      : this.extractQueryFromLink(link || '');

    if (!rawQuery) {
      console.warn('Skipping item without query/link', item);
      return;
    }

    const finalQuery = this.withErrorFilter(rawQuery);

    try {
      const rawLogs = await this.datadogClient.fetchLogs(
        finalQuery, 
        fromISO, 
        toISO, 
        config.polling.maxLogsPerQuery
      );

      const logs = rawLogs.map(pickLogFields);

      console.log(`[ok] ${orgKey}/${resolvedConnectorName} -> ${logs.length} logs`);
      
      return {
        orgKey,
        connectorName: resolvedConnectorName,
        logs,
        query: finalQuery,
        originalLink: link
      };
    } catch (e) {
      console.error(`[fail] ${orgKey}/${resolvedConnectorName}`, e?.message || e);
      throw e;
    }
  }

  extractQueryFromLink(link) {
    try {
      const u = new URL(link);
      const q = u.searchParams.get('query') || '';
      return decodeURIComponent(q);
    } catch {
      return '';
    }
  }

  withErrorFilter(query) {
    const lower = query.toLowerCase();
    const hasStatus =
      lower.includes('status:error') ||
      lower.includes('status:critical') ||
      lower.includes('status:warn') ||
      lower.includes('status:info') ||
      lower.includes('@status:') ||
      lower.includes('status:');

    if (hasStatus) return query;
    
    return `(${query})`;
  }

  async writeConsolidatedErrors(allErrors, summary, fromISO, toISO) {
    const consolidatedData = {
      generatedAt: new Date().toISOString(),
      windowMinutes: config.polling.logsWindowMin,
      timeRange: {
        from: fromISO,
        to: toISO
      },
      summary,
      errors: allErrors
    };

    const file = path.join(config.paths.dataDir, 'errors.json');
    writeErrorData(file, consolidatedData);
    
    console.log(`Consolidated ${summary.totalErrors} errors from ${summary.processedLinks} integrations`);
    console.log(`Saved to: ${file}`);
  }

  connectorNameResolver(connectorName) {
    const parts = connectorName.split('-');
    if (parts.length > 2) {
      return connectorName;
    }
    return 'no connector name';
  }
}
