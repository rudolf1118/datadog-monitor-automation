import { createServer, startServer } from './server/index.js';
import { Scheduler } from './scheduler/index.js';

async function start() {
  try {
    const scheduler = new Scheduler();
    scheduler.start();

    const app = createServer();
    await startServer(app);

    process.on('SIGINT', () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      scheduler.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start application:', error);
    process.exit(1);
  }
}

start();
