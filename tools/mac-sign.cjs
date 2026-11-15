const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join, basename, resolve } = require('node:path');
const { homedir } = require('node:os');
const { X509Certificate } = require('node:crypto');
const { signAsync } = require('@electron/osx-sign');

function loadIdentity() {
  const path = process.env.WHEELDESK_SIGNING_CONFIG || join(homedir(), 'Library/Application Support/WheelDeskBuild/identity.json');
  let identity;
  try { identity = JSON.parse(readFileSync(path, 'utf8')); }
  catch { throw new Error('Persistent signing identity missing. Restore the original private signing backup and configure WHEELDESK_SIGNING_CONFIG. Never generate a replacement certificate for an existing release. Ad-hoc release builds are forbidden.'); }
  if (!/^[A-F0-9]{40}$/.test(identity.fingerprint)) throw new Error('Invalid signing certificate fingerprint');
  if (identity.fingerprint !== require('../build/desk/signing-identity.json').fingerprint) throw new Error('Signer differs from the released WheelDesk identity. Restore the original signing backup; do not rotate it.');
  const certificate = new X509Certificate(readFileSync(identity.certificate));
  if (certificate.fingerprint.replaceAll(':', '').toUpperCase() !== identity.fingerprint) throw new Error('Signing certificate changed; refusing to change application identity.');
  return identity;
}

function verify(app, fingerprint) {
  for (const [file, id] of [[app, 'app.wheeldesk.desktop'],
    [join(app, 'Contents/Helpers/hook-helper'), 'app.wheeldesk.desktop.hook'],
    [join(app, 'Contents/Helpers/context-helper'), 'app.wheeldesk.desktop.context']]) {
    const requirement = `identifier "${id}" and certificate leaf = H"${fingerprint}"`;
    execFileSync('/usr/bin/codesign', ['--verify', '--strict', '-R', '=' + requirement, file], { stdio: 'pipe' });
    const result = require('node:child_process').spawnSync('/usr/bin/codesign', ['-d', '-r-', file], { encoding: 'utf8' });
    const requirementText = result.stdout + result.stderr;
    const designated = requirementText.split('\n').find(line => line.startsWith('designated => '));
    if (result.status !== 0 || designated?.toLowerCase() !== ('designated => ' + requirement).toLowerCase()) throw new Error('Unstable signing requirement: ' + id);
  }
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio: 'pipe' });
}

exports.sign = async options => {
  const identity = loadIdentity();
  const app = resolve(options.app);
  try {
    execFileSync('/usr/bin/security', ['unlock-keychain', '-p', readFileSync(identity.passwordFile, 'utf8').trim(), identity.keychain], { stdio: 'pipe' });
  } catch { throw new Error('Cannot unlock the private WheelDesk signing keychain.'); }
  await signAsync({ app, platform: 'darwin', identity: identity.fingerprint, keychain: identity.keychain,
    identityValidation: false, preAutoEntitlements: false, preEmbedProvisioningProfile: false,
    gatekeeperAssess: false, strictVerify: true,
    binaries: [join(app, 'Contents/Helpers/hook-helper'), join(app, 'Contents/Helpers/context-helper')],
    optionsForFile: file => {
      const id = resolve(file) === app ? 'app.wheeldesk.desktop'
        : basename(file) === 'hook-helper' ? 'app.wheeldesk.desktop.hook'
          : basename(file) === 'context-helper' ? 'app.wheeldesk.desktop.context'
            : 'app.wheeldesk.desktop.component.' + basename(file).replace(/[^A-Za-z0-9.-]/g, '-');
      return { hardenedRuntime: false, timestamp: 'none',
        requirements: `=designated => identifier "${id}" and certificate leaf = H"${identity.fingerprint}"`,
        additionalArguments: ['--identifier', id] };
    },
  });
  verify(app, identity.fingerprint);
  console.log('Verified persistent WheelDesk signer:', identity.fingerprint);
};
exports.verify = verify;
exports.loadIdentity = loadIdentity;
