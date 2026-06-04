package com.purrfolio.app.notificationlistener

import android.content.Context
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import org.json.JSONArray
import org.json.JSONObject

class WalletNotificationListenerService : NotificationListenerService() {

  companion object {
    private const val WALLET_PACKAGE = "com.google.android.apps.walletnfcrel"
    private const val PREFS_NAME = "wallet_notifications"
    private const val PREFS_KEY = "pending"

    // Matches e.g. "HUF3,247.00 with Meow" or "USD12.50 at Store"
    private val AMOUNT_REGEX = Regex("""^([A-Z]{2,3})([\d,]+\.?\d*)""")

    private fun prefs(context: Context) =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private fun load(context: Context): MutableList<Map<String, Any>> {
      val json = prefs(context).getString(PREFS_KEY, "[]") ?: "[]"
      val arr = JSONArray(json)
      return (0 until arr.length()).map { i ->
        val obj = arr.getJSONObject(i)
        mapOf(
          "id" to obj.getString("id"),
          "title" to obj.getString("title"),
          "body" to obj.getString("body"),
          "timestamp" to obj.getLong("timestamp"),
          "amount" to obj.getDouble("amount"),
          "currency" to obj.getString("currency"),
        )
      }.toMutableList()
    }

    private fun save(context: Context, list: List<Map<String, Any>>) {
      val arr = JSONArray()
      list.forEach { item ->
        arr.put(JSONObject(item))
      }
      prefs(context).edit().putString(PREFS_KEY, arr.toString()).apply()
    }

    fun getPendingNotifications(context: Context): List<Map<String, Any>> = load(context)

    fun clearPendingNotifications(context: Context) {
      prefs(context).edit().remove(PREFS_KEY).apply()
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    if (sbn.packageName != WALLET_PACKAGE) return

    val extras = sbn.notification.extras
    val title = extras.getString("android.title") ?: return
    val body = extras.getCharSequence("android.text")?.toString() ?: return

    val match = AMOUNT_REGEX.find(body) ?: return
    val currency = match.groupValues[1]
    val amount = match.groupValues[2].replace(",", "").toDoubleOrNull() ?: return

    val list = load(this)
    if (list.any { it["id"] == sbn.key }) return  // deduplicate

    list.add(
      mapOf(
        "id" to sbn.key,
        "title" to title,
        "body" to body,
        "timestamp" to sbn.postTime,
        "amount" to amount,
        "currency" to currency,
      )
    )
    save(this, list)
  }
}
