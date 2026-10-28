package com.nuvio.app.features.nuviotr

import android.content.Context
import android.content.SharedPreferences

internal actual object NuvioTrSetupStorage {
    private const val preferencesName = "nuvio_tr_setup"
    private const val defaultSourcesKey = "default_sources_installed"

    private var preferences: SharedPreferences? = null

    fun initialize(context: Context) {
        preferences = context.getSharedPreferences(preferencesName, Context.MODE_PRIVATE)
    }

    // Without storage, report installed so defaults are never re-added on every launch.
    actual fun isDefaultSourcesInstalled(): Boolean =
        preferences?.getBoolean(defaultSourcesKey, false) ?: true

    actual fun markDefaultSourcesInstalled() {
        preferences?.edit()?.putBoolean(defaultSourcesKey, true)?.apply()
    }
}
