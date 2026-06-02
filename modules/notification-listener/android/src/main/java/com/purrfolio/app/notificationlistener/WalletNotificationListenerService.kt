package com.purrfolio.app.notificationlistener

import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.concurrent.CopyOnWriteArrayList

class WalletNotificationListenerService : NotificationListenerService() {

  companion object {
    private const val WALLET_PACKAGE = "com.google.android.apps.walletnfcrel"

    // Matches e.g. "HUF3,247.00 with Meow" or "USD12.50 at Store"
    private val AMOUNT_REGEX = Regex("""^([A-Z]{2,3})([\d,]+\.?\d*)""")

    private val pending = CopyOnWriteArrayList<Map<String, Any>>()

    fun getPendingNotifications(): List<Map<String, Any>> = pending.toList()

    fun clearPendingNotifications() = pending.clear()
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName != WALLET_PACKAGE) return

    val extras = sbn.notification.extras
    val title = extras.getString("android.title") ?: return
    val body = extras.getCharSequence("android.text")?.toString() ?: return

    val match = AMOUNT_REGEX.find(body) ?: return
    val currency = match.groupValues[1]
    val amount = match.groupValues[2].replace(",", "").toDoubleOrNull() ?: return

    // Deduplicate by notification key
    if (pending.any { it["id"] == sbn.key }) return

    pending.add(
      mapOf(
        "id" to sbn.key,
        "title" to title,
        "body" to body,
        "timestamp" to sbn.postTime,
        "amount" to amount,
        "currency" to currency,
      )
    )
  }
}
