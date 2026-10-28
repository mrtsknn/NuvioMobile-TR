package com.nuvio.app.features.nuviotr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.core.ui.NuvioInfoBadge
import com.nuvio.app.core.ui.NuvioSectionLabel
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.features.addons.AddAddonResult
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.plugins.AddPluginRepositoryResult
import com.nuvio.app.features.plugins.PluginRepository
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.nuviotr_badge_installed
import nuvio.composeapp.generated.resources.nuviotr_button_install
import nuvio.composeapp.generated.resources.nuviotr_button_installing
import nuvio.composeapp.generated.resources.nuviotr_catalogs_title
import nuvio.composeapp.generated.resources.nuviotr_load_failed
import nuvio.composeapp.generated.resources.nuviotr_loading
import nuvio.composeapp.generated.resources.nuviotr_plugins_title
import org.jetbrains.compose.resources.stringResource

/** Community index of Turkish catalogs and plugin repositories, maintained by manitux-app/nuvio-tr. */
private const val NUVIOTR_REPOS_URL = "https://raw.githubusercontent.com/manitux-app/nuvio-tr/main/repos.json"

@Serializable
private data class NuvioTrIndex(
    val catalogs: List<NuvioTrEntry> = emptyList(),
    val plugins: List<NuvioTrEntry> = emptyList(),
)

@Serializable
private data class NuvioTrEntry(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val manifestUrl: String = "",
    // Cloudstream entries ship Android DEX code and cannot run in this app.
    val origin: String? = null,
)

enum class NuvioTrKind { Catalogs, Plugins }

private val nuvioTrJson = Json { ignoreUnknownKeys = true }

private sealed interface NuvioTrLoadState {
    data object Loading : NuvioTrLoadState
    data object Failed : NuvioTrLoadState
    data class Loaded(val index: NuvioTrIndex) : NuvioTrLoadState
}

private fun String.normalizedManifestUrl(): String = trim().trimEnd('/').lowercase()

@Composable
fun NuvioTrRecommendedSection(
    kind: NuvioTrKind,
    modifier: Modifier = Modifier,
) {
    val loadState by produceState<NuvioTrLoadState>(NuvioTrLoadState.Loading) {
        value = runCatching { nuvioTrJson.decodeFromString<NuvioTrIndex>(httpGetText(NUVIOTR_REPOS_URL)) }
            .fold(onSuccess = { NuvioTrLoadState.Loaded(it) }, onFailure = { NuvioTrLoadState.Failed })
    }
    val addonsState by AddonRepository.uiState.collectAsStateWithLifecycle()
    val pluginsState by PluginRepository.uiState.collectAsStateWithLifecycle()
    val installedUrls = remember(kind, addonsState, pluginsState) {
        when (kind) {
            NuvioTrKind.Catalogs -> addonsState.addons.map { it.manifestUrl.normalizedManifestUrl() }
            NuvioTrKind.Plugins -> pluginsState.repositories.map { it.manifestUrl.normalizedManifestUrl() }
        }.toSet()
    }
    val installing = remember { mutableStateMapOf<String, Boolean>() }
    var message by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        NuvioSectionLabel(
            stringResource(
                when (kind) {
                    NuvioTrKind.Catalogs -> Res.string.nuviotr_catalogs_title
                    NuvioTrKind.Plugins -> Res.string.nuviotr_plugins_title
                },
            ),
        )
        NuvioSurfaceCard {
            when (val state = loadState) {
                NuvioTrLoadState.Loading -> NuvioTrStatusText(stringResource(Res.string.nuviotr_loading))
                NuvioTrLoadState.Failed -> NuvioTrStatusText(stringResource(Res.string.nuviotr_load_failed))
                is NuvioTrLoadState.Loaded -> {
                    val entries = when (kind) {
                        NuvioTrKind.Catalogs -> state.index.catalogs
                        NuvioTrKind.Plugins -> state.index.plugins
                    }.filter { it.manifestUrl.isNotBlank() && !it.origin.equals("Cloudstream", ignoreCase = true) }

                    entries.forEachIndexed { index, entry ->
                        if (index > 0) {
                            Spacer(modifier = Modifier.height(10.dp))
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                        val key = entry.manifestUrl.normalizedManifestUrl()
                        NuvioTrEntryRow(
                            entry = entry,
                            installed = key in installedUrls,
                            installing = installing[key] == true,
                            onInstall = {
                                installing[key] = true
                                message = null
                                coroutineScope.launch {
                                    message = when (kind) {
                                        NuvioTrKind.Catalogs -> when (val result = AddonRepository.addAddon(entry.manifestUrl)) {
                                            is AddAddonResult.Success -> null
                                            is AddAddonResult.Error -> result.message
                                        }
                                        NuvioTrKind.Plugins -> when (val result = PluginRepository.addRepository(entry.manifestUrl)) {
                                            is AddPluginRepositoryResult.Success -> null
                                            is AddPluginRepositoryResult.Error -> result.message
                                        }
                                    }
                                    installing.remove(key)
                                }
                            },
                        )
                    }
                    message?.let {
                        Spacer(modifier = Modifier.height(12.dp))
                        NuvioTrStatusText(it)
                    }
                }
            }
        }
    }
}

@Composable
private fun NuvioTrEntryRow(
    entry: NuvioTrEntry,
    installed: Boolean,
    installing: Boolean,
    onInstall: () -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = entry.name,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (entry.description.isNotBlank()) {
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = entry.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        if (installed) {
            NuvioInfoBadge(text = stringResource(Res.string.nuviotr_badge_installed))
        } else {
            TextButton(onClick = onInstall, enabled = !installing) {
                Text(
                    stringResource(
                        if (installing) Res.string.nuviotr_button_installing else Res.string.nuviotr_button_install,
                    ),
                )
            }
        }
    }
}

@Composable
private fun NuvioTrStatusText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
