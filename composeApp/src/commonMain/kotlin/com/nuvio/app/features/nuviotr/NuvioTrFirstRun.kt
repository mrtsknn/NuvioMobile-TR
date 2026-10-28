package com.nuvio.app.features.nuviotr

import com.nuvio.app.core.logging.InAppLogger
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.plugins.AddPluginRepositoryResult
import com.nuvio.app.features.plugins.PluginRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

internal expect object NuvioTrSetupStorage {
    fun isDefaultSourcesInstalled(): Boolean
    fun markDefaultSourcesInstalled()
    fun loadValue(key: String): String?
    fun saveValue(key: String, value: String?)
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
        "https://raw.githubusercontent.com/mrtsknn/NuvioMobile-TR/tr/skystream-plugins/repo.json",
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var started = false

    fun installDefaultsIfNeeded() {
        if (started) return
        started = true
        scope.launch {
            installStarterSourcesInternal(force = false)
        }
    }

    fun installStarterSources(force: Boolean = true) {
        scope.launch {
            installStarterSourcesInternal(force = force)
        }
    }

    private suspend fun installStarterSourcesInternal(force: Boolean) {
        AddonRepository.initialize()
        PluginRepository.initialize()

        val activeAddonCount = AddonRepository.uiState.value.addons.count { it.manifest != null }
        val hasSources = activeAddonCount > 0 || AddonRepository.uiState.value.addons.isNotEmpty()

        if (!force && NuvioTrSetupStorage.isDefaultSourcesInstalled() && hasSources) {
            return
        }

        InAppLogger.info("NuvioTR/FirstRun", "Installing Turkish starter sources (force=$force)")

        coroutineScope {
            // Catalogs
            (listOf(CINEMETA_URL) + defaultCatalogs).forEach { url ->
                launch {
                    runCatching {
                        if (force || AddonRepository.uiState.value.addons.none { it.manifestUrl == url }) {
                            AddonRepository.addAddon(url)
                        }
                    }.onFailure { error ->
                        InAppLogger.warn("NuvioTR/FirstRun", "Failed to add starter addon $url: ${error.message}")
                    }
                }
            }

            // Plugin Repositories
            defaultPluginRepositories.forEach { url ->
                launch {
                    runCatching {
                        if (PluginRepository.uiState.value.repositories.none { it.manifestUrl == url }) {
                            val result = PluginRepository.addRepository(url)
                            if (result is AddPluginRepositoryResult.Success) {
                                addPluginContentSourcesToHome(result.repository.manifestUrl)
                            }
                        } else {
                            addPluginContentSourcesToHome(url)
                        }
                    }.onFailure { error ->
                        InAppLogger.warn("NuvioTR/FirstRun", "Failed to add starter repo $url: ${error.message}")
                    }
                }
            }
        }

        NuvioTrSetupStorage.markDefaultSourcesInstalled()
    }
}
