// Explicit one-time setup. Never invoked implicitly by a build or shipped in the app.
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync, existsSync, chmodSync, rmSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { homedir } = require('node:os');
const { randomBytes, X509Certificate } = require('node:crypto');
if (process.platform !== 'darwin') throw new Error('macOS is required');
if (existsSync(join(__dirname, '../build/desk/signing-identity.json'))) throw new Error('This product already has a pinned release identity. Restore its original private signing backup; generating a replacement would invalidate existing permissions.');
const dir = join(homedir(), 'Library/Application Support/WheelDeskBuild');
if (existsSync(dir)) throw new Error('Signing directory already exists. Preserve and reuse it; never rotate automatically.');
mkdirSync(dir, { recursive: true, mode: 0o700 });
let phase = 'initialization';
const run = (cmd, args, env = process.env) => { phase = cmd.split('/').pop() + ' ' + args[0]; return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], env }); };
const password = randomBytes(32).toString('hex');
const passwordFile = join(dir, 'password');
const keychain = join(dir, 'signing.keychain-db');
const cert = join(dir, 'certificate.pem');
const privateKey = join(dir, 'temporary-key.pem');
const backup = join(dir, 'identity.p12');
let backupComplete = false;
const config = join(dir, 'openssl.cnf');
writeFileSync(config, '[req]\ndistinguished_name=dn\nx509_extensions=code_sign\n[dn]\n[code_sign]\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\nextendedKeyUsage=critical,codeSigning\n', { mode: 0o600 });
writeFileSync(passwordFile, password, { mode: 0o600 });
try {
  run('/usr/bin/openssl', ['genrsa', '-aes256', '-passout', `file:${passwordFile}`, '-out', privateKey, '3072']);
  chmodSync(privateKey, 0o600);
  run('/usr/bin/openssl', ['req', '-new', '-x509', '-key', privateKey, '-passin', `file:${passwordFile}`, '-sha256', '-days', '3650',
    '-subj', '/CN=WheelDesk Internal Signing/O=WheelDesk Local Builds',
    '-config', config, '-out', cert]);
  chmodSync(privateKey, 0o600);
  run('/usr/bin/openssl', ['pkcs12', '-export', '-inkey', privateKey, '-in', cert, '-out', backup,
    '-name', 'WheelDesk Internal Signing', '-passin', `file:${passwordFile}`, '-passout', 'env:WHEELDESK_SETUP_PASSWORD'], { ...process.env, WHEELDESK_SETUP_PASSWORD: password });
  chmodSync(backup, 0o600);
  backupComplete = true;
  run('/usr/bin/security', ['create-keychain', '-p', password, keychain]);
  run('/usr/bin/security', ['unlock-keychain', '-p', password, keychain]);
  run('/usr/bin/security', ['import', backup, '-k', keychain, '-P', password, '-x', '-T', '/usr/bin/codesign']);
  run('/usr/bin/security', ['set-key-partition-list', '-S', 'apple-tool:,apple:', '-s', '-k', password, keychain]);
  const keychains = run('/usr/bin/security', ['list-keychains', '-d', 'user']).toString().trim().split('\n').filter(Boolean).map(line => JSON.parse(line.trim()));
  run('/usr/bin/security', ['list-keychains', '-d', 'user', '-s', ...new Set([...keychains, keychain])]);
  const fingerprint = new X509Certificate(readFileSync(cert)).fingerprint.replaceAll(':', '').toUpperCase();
  writeFileSync(join(dir, 'identity.json'), JSON.stringify({ fingerprint, keychain, passwordFile, certificate: cert }, null, 2), { mode: 0o600 });
  console.log('Created persistent WheelDesk signing identity:', fingerprint);
  console.log('Keep the private signing directory backed up securely:', dir);
  console.log('No system root trust or privacy permissions were changed.');
} catch (error) {
  if (phase.startsWith('openssl ') && error.stderr) console.error(error.stderr.toString().replaceAll(password, '[redacted]'));
  throw new Error(`Signing setup failed at ${phase}. The private setup directory was preserved for recovery; no secret output was logged.`);
} finally { if (backupComplete) rmSync(privateKey, { force: true }); }
