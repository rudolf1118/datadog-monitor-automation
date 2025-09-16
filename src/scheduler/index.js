import { LogProcessor } from '../services/logProcessor.js';
import { readLinks } from '../utils/fileUtils.js';
import { ensureDir } from '../utils/fileUtils.js';
import { config } from '../config/index.js';

export class Scheduler {
  constructor() {
    this.logProcessor = new LogProcessor();
    this.intervalId = null;
  }

  async runOnce() {
    try {
      const links = readLinks(config.paths.linksFile);
      await this.logProcessor.processLinks(links);
    } catch (error) {
      console.error('Error in runOnce:', error);
    }
  }

  start() {
    ensureDir(config.paths.dataDir);

    this.runOnce();

    this.intervalId = setInterval(() => {
      this.runOnce().catch(err => console.error('poll error', err));
    }, config.polling.intervalSec * 1000);

    console.log(`Scheduler started with ${config.polling.intervalSec}s interval`);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Scheduler stopped');
    }
  }
}
