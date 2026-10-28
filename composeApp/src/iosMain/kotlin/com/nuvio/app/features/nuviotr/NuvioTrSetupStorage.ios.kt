package com.nuvio.app.features.nuviotr

import platform.Foundation.NSUserDefaults

internal actual object NuvioTrSetupStorage {
    private const val defaultSourcesKey = "nuvio_tr_default_sources_installed"

    actual fun isDefaultSourcesInstalled(): Boolean =
        NSUserDefaults.standardUserDefaults.boolForKey(defaultSourcesKey)

    actual fun markDefaultSourcesInstalled() {
        NSUserDefaults.standardUserDefaults.setBool(true, forKey = defaultSourcesKey)
    }

    actual fun loadValue(key: String): String? =
        NSUserDefaults.standardUserDefaults.stringForKey("nuvio_tr_$key")

    actual fun saveValue(key: String, value: String?) {
        if (value == null) {
            NSUserDefaults.standardUserDefaults.removeObjectForKey("nuvio_tr_$key")
        } else {
            NSUserDefaults.standardUserDefaults.setObject(value, forKey = "nuvio_tr_$key")
        }
    }
}
