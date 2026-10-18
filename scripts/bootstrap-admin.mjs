import foundation from '../packages/server-modules/dist/index.js';
const { parseBackendConfig, BackendConfigService, DatabaseService, AuditService, AdminService } = foundation;
const username = process.env.ADMIN_BOOTSTRAP_USERNAME;
const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
delete process.env.ADMIN_BOOTSTRAP_USERNAME;
delete process.env.ADMIN_BOOTSTRAP_PASSWORD;
let database;
try {
  if (!username || !password) throw new Error('missing');
  const config = new BackendConfigService(parseBackendConfig(process.env), 'api');
  database = new DatabaseService(config);
  await database.onModuleInit();
  await new AdminService(config, database, new AuditService()).bootstrap(username, password);
  console.log('Local initial administrator created. Credentials withheld.');
} catch {
  console.error('ADMIN_BOOTSTRAP_FAILED: use an empty local administrator table, valid configuration, and explicit credentials.');
  process.exitCode = 1;
} finally { await database?.close(); }
