package com.nuvio.app.features.nuviotr

import com.nuvio.app.core.logging.InAppLogger
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.plugins.AddPluginRepositoryResult
import com.nuvio.app.features.plugins.PluginRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

internal expect object NuvioTrSetupStorage {
    fun isDefaultSourcesInstalled(): Boolean
    fun markDefaultSourcesInstalled()
}

/**
 * Nuvio starts without any source unless an account syncs one. Nuvio TR installs a Turkish
 * starter set once, on the first launch with nothing installed; removing them later sticks.
 */
object NuvioTrFirstRun {
    private const val CINEMETA_URL = "https://v3-cinemeta.strem.io/manifest.json"
    private val defaultCatalogs = listOf(
        "https://katalog.izlelan.com/manifest.json",
        "https://izlemeli.github.io/nuvio/tr/manifest.json",
    )
    private val defaultPluginRepositories = listOf(
        "https://raw.githubusercontent.com/manitux-app/nuvio-test-plugins/refs/heads/main/manifest.json",
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var started = false

    fun installDefaultsIfNeeded() {
        if (started || NuvioTrSetupStorage.isDefaultSourcesInstalled()) return
        started = true
        scope.launch {
            AddonRepository.initialize()
            PluginRepository.initialize()
            val hasSources = AddonRepository.uiState.value.addons.isNotEmpty() ||
                PluginRepository.uiState.value.repositories.isNotEmpty()
            if (!hasSources) {
                InAppLogger.info("NuvioTR/FirstRun", "Installing Turkish starter sources")
                (listOf(CINEMETA_URL) + defaultCatalogs).forEach { url -> AddonRepository.addAddon(url) }
                defaultPluginRepositories.forEach { url ->
                    val result = PluginRepository.addRepository(url)
                    if (result is AddPluginRepositoryResult.Success) {
                        addPluginContentSourcesToHome(result.repository.manifestUrl)
                    }
                }
            }
            NuvioTrSetupStorage.markDefaultSourcesInstalled()
        }
    }
}
