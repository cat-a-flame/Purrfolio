const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

// Google Play Android developer verification: ships the registration snippet
// as an asset in the APK so Play Console can verify package ownership.
module.exports = function withAdiRegistration(config, { snippet }) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const assetsDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'adi-registration.properties'), `${snippet}\n`);
      return cfg;
    },
  ]);
};
