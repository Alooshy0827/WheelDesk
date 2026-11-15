// afterPack is too early; afterAllArtifactBuild also catches explicit signing bypasses.
const { join } = require('node:path');
const { verify, loadIdentity } = require('./mac-sign.cjs');
module.exports = async result => {
  for (const [platform] of result.platformToTargets) {
    if (platform.name !== 'mac') continue;
    verify(join(result.outDir, 'mac-arm64/WheelDesk.app'), loadIdentity().fingerprint);
  }
  return [];
};
