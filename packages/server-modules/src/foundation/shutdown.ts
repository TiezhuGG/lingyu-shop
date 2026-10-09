import { INestApplicationContext } from '@nestjs/common';
import { BackendConfigService } from './config';
import { DatabaseService } from './database';

// Explicitly stop ingress first; Nest's destroy hooks otherwise precede server closure.
export function installShutdown(app: INestApplicationContext, stopIngress: () => Promise<void>): () => Promise<void> {
  const config = app.get(BackendConfigService).values;
  const database = app.get(DatabaseService);
  let closing: Promise<void> | undefined;
  const close = (): Promise<void> => closing ??= (async () => {
    database.beginDrain();
    const timer = setTimeout(() => {
      console.error('SHUTDOWN_TIMEOUT');
      process.exit(1);
    }, config.shutdownTimeoutMs);
    try {
      await stopIngress();
      await app.close();
      console.log('SHUTDOWN_COMPLETE');
    } finally { clearTimeout(timer); }
  })();
  const signalClose = () => { void close().then(() => process.disconnect?.()).catch(() => {
    console.error('SHUTDOWN_FAILED'); process.exit(1);
  }); };
  process.on('SIGINT', signalClose);
  process.on('SIGTERM', signalClose);
  if (config.environment === 'test' && process.send) {
    process.on('message', message => {
      if (typeof message === 'object' && message !== null && 'type' in message && message.type === 'shutdown') {
        void close().then(() => process.disconnect?.()).catch(() => process.exit(1));
      }
    });
  }
  return close;
}
