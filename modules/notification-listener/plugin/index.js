const { withAndroidManifest } = require('@expo/config-plugins');

const SERVICE_CLASS = 'com.purrfolio.app.notificationlistener.WalletNotificationListenerService';

/**
 * Adds the WalletNotificationListenerService to AndroidManifest.xml.
 * Without this entry the Android OS will not bind the service even if the
 * native code is compiled and the user has granted notification access.
 */
module.exports = function withNotificationListener(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application[0];

    if (!app.service) app.service = [];

    const alreadyAdded = app.service.some(
      (s) => s.$?.['android:name'] === SERVICE_CLASS
    );

    if (!alreadyAdded) {
      app.service.push({
        $: {
          'android:name': SERVICE_CLASS,
          'android:label': '@string/app_name',
          'android:permission': 'android.permission.BIND_NOTIFICATION_LISTENER_SERVICE',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name':
                    'android.service.notification.NotificationListenerService',
                },
              },
            ],
          },
        ],
      });
    }

    return config;
  });
};
