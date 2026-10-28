package com.nuvio.app.features.nuviotr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.ArrowDropDown
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.features.addons.AddonRepository
import com.nuvio.app.features.catalog.CatalogTarget
import com.nuvio.app.features.home.HomeUiState
import com.nuvio.app.features.plugins.PluginAddonTransport
import com.nuvio.app.features.plugins.PluginContentRegistry
import com.nuvio.app.features.plugins.PluginRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.nuviotr_menu_catalog
import nuvio.composeapp.generated.resources.nuviotr_menu_catalog_all
import nuvio.composeapp.generated.resources.nuviotr_menu_source
import nuvio.composeapp.generated.resources.nuviotr_menu_source_auto
import org.jetbrains.compose.resources.stringResource

/**
 * The Home "Katalog" and "Kaynak" choices: which source's rows Home shows, and which source
 * playback prefers. Both are kept across launches.
 */
object NuvioTrHomeSelection {
    private const val CATALOG_KEY = "home_catalog_manifest"
    private const val SOURCE_KEY = "playback_source"

    private val _catalogManifestUrl = MutableStateFlow(NuvioTrSetupStorage.loadValue(CATALOG_KEY))
    /** Manifest URL of the addon whose rows Home shows; null shows every row. */
    val catalogManifestUrl: StateFlow<String?> = _catalogManifestUrl.asStateFlow()

    private val _sourceKey = MutableStateFlow(NuvioTrSetupStorage.loadValue(SOURCE_KEY))
    /** `plugin:<scraperId>` or `addon:<manifestUrl>`; null lets the app choose. */
    val sourceKey: StateFlow<String?> = _sourceKey.asStateFlow()

    fun selectCatalog(manifestUrl: String?) {
        _catalogManifestUrl.value = manifestUrl
        NuvioTrSetupStorage.saveValue(CATALOG_KEY, manifestUrl)
    }

    fun selectSource(key: String?) {
        _sourceKey.value = key
        NuvioTrSetupStorage.saveValue(SOURCE_KEY, key)
    }

    /**
     * The stream group to open first for [videoId]: the chosen source, or the plugin whose
     * catalog the title came from. Group ids follow `streamAddonInstanceId` / plugin groups.
     */
    fun preferredStreamGroupId(groupIds: Collection<String>, videoId: String, type: String): String? {
        val key = _sourceKey.value
            ?: PluginContentRegistry.find(videoId, type)?.let { "plugin:${it.scraperId}" }
            ?: return null
        return groupIds.firstOrNull { groupId -> groupId.matchesSourceKey(key) }
    }

    private fun String.matchesSourceKey(key: String): Boolean = when {
        key.startsWith("plugin:") -> {
            val scraperId = key.removePrefix("plugin:")
            this == key || (startsWith("plugin-repo:") && scraperId.startsWith(removePrefix("plugin-repo:") + ":"))
        }
        // Addon groups are "addon:<manifestId>:<manifestUrl>".
        key.startsWith("addon:") -> startsWith("addon:") && endsWith(":" + key.removePrefix("addon:"))
        else -> false
    }
}

/** Home rows (and hero) limited to the chosen catalog source. */
fun HomeUiState.filteredByNuvioTrCatalog(manifestUrl: String?): HomeUiState {
    if (manifestUrl == null) return this
    val kept = sections.filter { (it.target as? CatalogTarget.Addon)?.manifestUrl == manifestUrl }
    return copy(
        sections = kept,
        heroItems = kept.flatMap { it.items }
            .filter { !it.poster.isNullOrBlank() }
            .distinctBy { it.id }
            .take(10)
            .ifEmpty { heroItems },
    )
}

@Composable
fun NuvioTrHomeMenus(modifier: Modifier = Modifier) {
    val addonsState by AddonRepository.uiState.collectAsStateWithLifecycle()
    val pluginsState by PluginRepository.uiState.collectAsStateWithLifecycle()
    val catalogManifestUrl by NuvioTrHomeSelection.catalogManifestUrl.collectAsStateWithLifecycle()
    val sourceKey by NuvioTrHomeSelection.sourceKey.collectAsStateWithLifecycle()

    val catalogOptions = addonsState.addons
        .filter { it.enabled && it.manifest?.catalogs?.any { catalog -> catalog.extra.none { extra -> extra.isRequired } } == true }
        .map { addon -> addon.manifestUrl to addon.manifest!!.name.trimStart('!') }
    val sourceOptions = buildList {
        pluginsState.scrapers
            .filter { it.enabled && it.supportsStreams }
            .forEach { add("plugin:${it.id}" to it.name.trimStart('!')) }
        addonsState.addons
            .filter { addon ->
                addon.enabled && !PluginAddonTransport.isVirtualUrl(addon.manifestUrl) &&
                    addon.manifest?.resources?.any { it.name == "stream" } == true
            }
            .forEach { addon -> add("addon:${addon.manifestUrl}" to addon.manifest!!.name) }
    }

    Row(
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        SelectionChip(
            label = stringResource(Res.string.nuviotr_menu_catalog),
            allLabel = stringResource(Res.string.nuviotr_menu_catalog_all),
            selectedKey = catalogManifestUrl,
            options = catalogOptions,
            onSelect = NuvioTrHomeSelection::selectCatalog,
        )
        SelectionChip(
            label = stringResource(Res.string.nuviotr_menu_source),
            allLabel = stringResource(Res.string.nuviotr_menu_source_auto),
            selectedKey = sourceKey,
            options = sourceOptions,
            onSelect = NuvioTrHomeSelection::selectSource,
        )
    }
}

@Composable
private fun SelectionChip(
    label: String,
    allLabel: String,
    selectedKey: String?,
    options: List<Pair<String, String>>,
    onSelect: (String?) -> Unit,
) {
    var expanded by remember { mutableStateOf(false) }
    val selectedName = options.firstOrNull { it.first == selectedKey }?.second ?: allLabel
    Box {
        FilterChip(
            selected = selectedKey != null,
            onClick = { expanded = true },
            label = { Text("$label: $selectedName", maxLines = 1, overflow = TextOverflow.Ellipsis) },
            trailingIcon = { Icon(Icons.Rounded.ArrowDropDown, contentDescription = null) },
        )
        DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            DropdownMenuItem(
                text = { Text(allLabel) },
                onClick = {
                    onSelect(null)
                    expanded = false
                },
            )
            options.forEach { (key, name) ->
                DropdownMenuItem(
                    text = { Text(name) },
                    onClick = {
                        onSelect(key)
                        expanded = false
                    },
                )
            }
        }
    }
}
