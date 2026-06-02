package com.purrfolio.app.notificationlistener

import android.content.ComponentName
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

  override fun definition() = ModuleDefinition {
    Name("NotificationListenerModule")

    AsyncFunction("hasPermission") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val flat = Settings.Secure.getString(
        context.contentResolver,
        "enabled_notification_listeners"
      ) ?: return@AsyncFunction false
      val cn = ComponentName(
        context,
        WalletNotificationListenerService::class.java
      ).flattenToString()
      flat.contains(cn)
    }

    AsyncFunction("openPermissionSettings") {
      val context = appContext.reactContext ?: return@AsyncFunction
      val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
    }

    AsyncFunction("getPendingNotifications") {
      WalletNotificationListenerService.getPendingNotifications()
    }

    AsyncFunction("clearPendingNotifications") {
      WalletNotificationListenerService.clearPendingNotifications()
    }
  }
}
