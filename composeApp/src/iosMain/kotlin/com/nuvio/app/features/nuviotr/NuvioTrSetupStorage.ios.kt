package com.nuvio.app.features.nuviotr

import platform.Foundation.NSUserDefaults

internal actual object NuvioTrSetupStorage {
    private const val defaultSourcesKey = "nuvio_tr_default_sources_installed"

    actual fun isDefaultSourcesInstalled(): Boolean =
        NSUserDefaults.standardUserDefaults.boolForKey(defaultSourcesKey)

    actual fun markDefaultSourcesInstalled() {
        NSUserDefaults.standardUserDefaults.setBool(true, forKey = defaultSourcesKey)
    }
}
