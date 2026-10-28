package com.nuvio.app.features.addons

import com.nuvio.app.features.plugins.PluginAddonTransport
import com.nuvio.app.features.plugins.PluginRepository

internal suspend fun fetchAddonResponseText(
    url: String,
    forceRefresh: Boolean = false,
): String {
    if (PluginAddonTransport.isVirtualUrl(url)) {
        // Touching PluginRepository installs the bridge handler in builds with the plugin runtime.
        PluginRepository.initialize()
        return PluginAddonTransport.handler?.invoke(url)
            ?: throw IllegalStateException("Plugin source is unavailable")
    }
    return if (forceRefresh) {
        httpGetTextWithHeaders(
            url = url,
            headers = mapOf("Cache-Control" to "no-cache"),
        )
    } else {
        httpGetText(url)
    }
}
