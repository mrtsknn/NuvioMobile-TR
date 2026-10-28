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
import com.nuvio.app.features.collection.CollectionRepository
import com.nuvio.app.features.plugins.AddPluginRepositoryResult
import com.nuvio.app.features.plugins.PluginAddonTransport
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.plugins.PluginScraper
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.nuviotr_badge_installed
import nuvio.composeapp.generated.resources.nuviotr_badge_on_home
import nuvio.composeapp.generated.resources.nuviotr_button_add_to_home
import nuvio.composeapp.generated.resources.nuviotr_button_install
import nuvio.composeapp.generated.resources.nuviotr_button_installing
import nuvio.composeapp.generated.resources.nuviotr_button_remove
import nuvio.composeapp.generated.resources.nuviotr_button_view
import nuvio.composeapp.generated.resources.nuviotr_capability_catalog
import nuvio.composeapp.generated.resources.nuviotr_capability_comments
import nuvio.composeapp.generated.resources.nuviotr_capability_search
import nuvio.composeapp.generated.resources.nuviotr_catalogs_title
import nuvio.composeapp.generated.resources.nuviotr_collection_items
import nuvio.composeapp.generated.resources.nuviotr_collections_title
import nuvio.composeapp.generated.resources.nuviotr_load_failed
import nuvio.composeapp.generated.resources.nuviotr_loading
import nuvio.composeapp.generated.resources.nuviotr_plugins_title
import nuvio.composeapp.generated.resources.nuviotr_preview_providers
import org.jetbrains.compose.resources.getString
import org.jetbrains.compose.resources.stringResource

/** Community index of Turkish catalogs, collections and plugin repositories, maintained by manitux-app/nuvio-tr. */
private const val NUVIOTR_REPOS_URL = "https://raw.githubusercontent.com/manitux-app/nuvio-tr/main/repos.json"

@Serializable
private data class NuvioTrIndex(
    val catalogs: List<NuvioTrEntry> = emptyList(),
    val collections: List<NuvioTrEntry> = emptyList(),
    val plugins: List<NuvioTrEntry> = emptyList(),
)

@Serializable
private data class NuvioTrSupports(
    val stream: Boolean = false,
    val catalog: Boolean = false,
    val search: Boolean = false,
    val comments: Boolean = false,
)

@Serializable
private data class NuvioTrEntry(
    val id: String = "",
    val name: String = "",
    val description: String = "",
    val manifestUrl: String = "",
    val collectionUrl: String = "",
    // Cloudstream entries ship Android DEX code and cannot run in this app.
    val origin: String? = null,
    val supports: NuvioTrSupports? = null,
) {
    val sourceUrl: String get() = manifestUrl.ifBlank { collectionUrl }
}

enum class NuvioTrKind { Catalogs, Collections, Plugins }

private val nuvioTrJson = Json { ignoreUnknownKeys = true }

private sealed interface NuvioTrLoadState {
    data object Loading : NuvioTrLoadState
    data object Failed : NuvioTrLoadState
    data class Loaded(val index: NuvioTrIndex) : NuvioTrLoadState
}

private fun String.normalizedManifestUrl(): String = trim().trimEnd('/').lowercase()

private suspend fun loadNuvioTrIndex(): NuvioTrLoadState =
    runCatching { nuvioTrJson.decodeFromString<NuvioTrIndex>(httpGetText(NUVIOTR_REPOS_URL)) }
        .fold(onSuccess = { NuvioTrLoadState.Loaded(it) }, onFailure = { NuvioTrLoadState.Failed })

/** Adds a virtual addon for every plugin of [repositoryUrl] that serves catalogs or search. */
suspend fun addPluginContentSourcesToHome(repositoryUrl: String) {
    PluginRepository.uiState.value.scrapers
        .filter { it.repositoryUrl == repositoryUrl && it.enabled && it.hasContentSource }
        .forEach { scraper -> AddonRepository.addAddon(PluginAddonTransport.manifestUrlFor(scraper.id)) }
}

private suspend fun collectionIds(collectionUrl: String): Pair<String, List<String>> {
    val payload = httpGetText(collectionUrl)
    val ids = (nuvioTrJson.parseToJsonElement(payload) as? JsonArray)
        ?.mapNotNull { ((it as? JsonObject)?.get("id") as? JsonPrimitive)?.contentOrNull }
        .orEmpty()
    return payload to ids
}

@Composable
fun NuvioTrRecommendedSection(
    kind: NuvioTrKind,
    modifier: Modifier = Modifier,
) {
    val loadState by produceState<NuvioTrLoadState>(NuvioTrLoadState.Loading) { value = loadNuvioTrIndex() }
    val addonsState by AddonRepository.uiState.collectAsStateWithLifecycle()
    val pluginsState by PluginRepository.uiState.collectAsStateWithLifecycle()
    val collections by CollectionRepository.collections.collectAsStateWithLifecycle()
    // Collection files list their ids only once downloaded; remember them per URL for the installed state.
    val collectionIdsByUrl = remember { mutableStateMapOf<String, List<String>>() }
    val installedKeys = remember(kind, addonsState, pluginsState, collections, collectionIdsByUrl.toMap()) {
        when (kind) {
            NuvioTrKind.Catalogs -> addonsState.addons.map { it.manifestUrl.normalizedManifestUrl() }.toSet()
            NuvioTrKind.Plugins -> pluginsState.repositories.map { it.manifestUrl.normalizedManifestUrl() }.toSet()
            NuvioTrKind.Collections -> {
                val installedIds = collections.map { it.id }.toSet()
                collectionIdsByUrl.filterValues { ids -> ids.isNotEmpty() && installedIds.containsAll(ids) }
                    .keys.map { it.normalizedManifestUrl() }.toSet()
            }
        }
    }
    val busy = remember { mutableStateMapOf<String, Boolean>() }
    val previews = remember { mutableStateMapOf<String, String>() }
    var message by remember { mutableStateOf<String?>(null) }
    val coroutineScope = rememberCoroutineScope()

    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        NuvioSectionLabel(
            stringResource(
                when (kind) {
                    NuvioTrKind.Catalogs -> Res.string.nuviotr_catalogs_title
                    NuvioTrKind.Collections -> Res.string.nuviotr_collections_title
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
                        NuvioTrKind.Collections -> state.index.collections
                        NuvioTrKind.Plugins -> state.index.plugins
                    }.filter { it.sourceUrl.isNotBlank() && !it.origin.equals("Cloudstream", ignoreCase = true) }

                    entries.forEachIndexed { index, entry ->
                        if (index > 0) {
                            Spacer(modifier = Modifier.height(10.dp))
                            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                            Spacer(modifier = Modifier.height(10.dp))
                        }
                        val key = entry.sourceUrl.normalizedManifestUrl()
                        NuvioTrEntryRow(
                            entry = entry,
                            installed = key in installedKeys,
                            busy = busy[key] == true,
                            preview = previews[key],
                            onPreview = {
                                coroutineScope.launch {
                                    previews[key] = runCatching {
                                        when (kind) {
                                            NuvioTrKind.Collections -> {
                                                val (_, ids) = collectionIds(entry.collectionUrl)
                                                collectionIdsByUrl[entry.collectionUrl] = ids
                                                getString(Res.string.nuviotr_collection_items, ids.size)
                                            }
                                            else -> {
                                                val manifest = nuvioTrJson.parseToJsonElement(httpGetText(entry.manifestUrl)) as? JsonObject
                                                val names = ((manifest?.get("scrapers") ?: manifest?.get("catalogs")) as? JsonArray)
                                                    ?.mapNotNull { ((it as? JsonObject)?.get("name") as? JsonPrimitive)?.contentOrNull?.trimStart('!') }
                                                    .orEmpty()
                                                getString(Res.string.nuviotr_preview_providers, names.joinToString(", ").ifBlank { "-" })
                                            }
                                        }
                                    }.getOrElse { it.message.orEmpty() }
                                }
                            },
                            onInstall = {
                                busy[key] = true
                                message = null
                                coroutineScope.launch {
                                    message = when (kind) {
                                        NuvioTrKind.Catalogs -> when (val result = AddonRepository.addAddon(entry.manifestUrl)) {
                                            is AddAddonResult.Success -> null
                                            is AddAddonResult.Error -> result.message
                                        }
                                        NuvioTrKind.Plugins -> when (val result = PluginRepository.addRepository(entry.manifestUrl)) {
                                            is AddPluginRepositoryResult.Success -> {
                                                addPluginContentSourcesToHome(result.repository.manifestUrl)
                                                null
                                            }
                                            is AddPluginRepositoryResult.Error -> result.message
                                        }
                                        NuvioTrKind.Collections -> runCatching {
                                            val (payload, ids) = collectionIds(entry.collectionUrl)
                                            collectionIdsByUrl[entry.collectionUrl] = ids
                                            CollectionRepository.mergeFromJson(payload).getOrThrow()
                                        }.exceptionOrNull()?.message
                                    }
                                    busy.remove(key)
                                }
                            },
                            onRemove = {
                                when (kind) {
                                    NuvioTrKind.Catalogs -> addonsState.addons
                                        .firstOrNull { it.manifestUrl.normalizedManifestUrl() == key }
                                        ?.let { AddonRepository.removeAddon(it.manifestUrl) }
                                    NuvioTrKind.Plugins -> pluginsState.repositories
                                        .firstOrNull { it.manifestUrl.normalizedManifestUrl() == key }
                                        ?.let { repository ->
                                            pluginsState.scrapers
                                                .filter { it.repositoryUrl == repository.manifestUrl }
                                                .forEach { AddonRepository.removeAddon(PluginAddonTransport.manifestUrlFor(it.id)) }
                                            PluginRepository.removeRepository(repository.manifestUrl)
                                        }
                                    NuvioTrKind.Collections -> collectionIdsByUrl[entry.collectionUrl]
                                        ?.forEach(CollectionRepository::removeCollection)
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
    busy: Boolean,
    preview: String?,
    onPreview: () -> Unit,
    onInstall: () -> Unit,
    onRemove: () -> Unit,
) {
    Column(modifier = Modifier.fillMaxWidth()) {
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
            Spacer(modifier = Modifier.width(8.dp))
            if (installed) {
                NuvioInfoBadge(text = stringResource(Res.string.nuviotr_badge_installed))
                TextButton(onClick = onRemove) { Text(stringResource(Res.string.nuviotr_button_remove)) }
            } else {
                if (preview == null) {
                    TextButton(onClick = onPreview) { Text(stringResource(Res.string.nuviotr_button_view)) }
                }
                TextButton(onClick = onInstall, enabled = !busy) {
                    Text(
                        stringResource(
                            if (busy) Res.string.nuviotr_button_installing else Res.string.nuviotr_button_install,
                        ),
                    )
                }
            }
        }
        entry.supports?.let { supports ->
            val labels = buildList {
                if (supports.catalog) add(stringResource(Res.string.nuviotr_capability_catalog))
                if (supports.search) add(stringResource(Res.string.nuviotr_capability_search))
                if (supports.comments) add(stringResource(Res.string.nuviotr_capability_comments))
            }
            if (labels.isNotEmpty()) {
                Spacer(modifier = Modifier.height(6.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    labels.forEach { NuvioInfoBadge(text = it) }
                }
            }
        }
        preview?.let {
            Spacer(modifier = Modifier.height(6.dp))
            NuvioTrStatusText(it)
        }
    }
}

/** Capability badges and the "add to Home" switch for a catalog/search capable plugin. */
@Composable
fun PluginContentSourceControls(scraper: PluginScraper) {
    if (!scraper.hasContentSource && !scraper.supportsComments) return
    val addonsState by AddonRepository.uiState.collectAsStateWithLifecycle()
    val sourceUrl = remember(scraper.id) { PluginAddonTransport.manifestUrlFor(scraper.id) }
    val onHome = addonsState.addons.any { it.manifestUrl == sourceUrl }
    val coroutineScope = rememberCoroutineScope()
    var adding by remember { mutableStateOf(false) }

    Spacer(modifier = Modifier.height(10.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        if (scraper.catalogs.isNotEmpty()) NuvioInfoBadge(text = stringResource(Res.string.nuviotr_capability_catalog))
        if (scraper.supportsSearch) NuvioInfoBadge(text = stringResource(Res.string.nuviotr_capability_search))
        if (scraper.supportsComments) NuvioInfoBadge(text = stringResource(Res.string.nuviotr_capability_comments))
        Spacer(modifier = Modifier.weight(1f))
        if (scraper.hasContentSource) {
            if (onHome) {
                NuvioInfoBadge(text = stringResource(Res.string.nuviotr_badge_on_home))
            } else {
                TextButton(
                    enabled = !adding && scraper.enabled,
                    onClick = {
                        adding = true
                        coroutineScope.launch {
                            AddonRepository.addAddon(sourceUrl)
                            adding = false
                        }
                    },
                ) { Text(stringResource(Res.string.nuviotr_button_add_to_home)) }
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
