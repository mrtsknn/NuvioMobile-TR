package com.nuvio.app.features.plugins.skystream

import com.nuvio.app.core.logging.InAppLogger
import com.nuvio.app.features.addons.httpGetText
import com.nuvio.app.features.addons.httpRequestRaw
import com.nuvio.app.features.plugins.readZipEntries
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull

internal const val PLUGIN_FORMAT_SKYSTREAM = "skystream"

private const val MAX_PACKAGE_BYTES = 12 * 1024 * 1024
private const val MAX_ENTRY_BYTES = 8 * 1024 * 1024

/**
 * Reads SkyStream repositories: `repo.json` (`pluginLists`) -> plugin list -> `.sky` packages
 * (zip with `plugin.json` and `plugin.js`) or bare `.js` plugins.
 */
internal object SkyStreamPackage {
    private val json = Json { ignoreUnknownKeys = true }

    data class Repository(
        val name: String,
        val description: String?,
        val plugins: List<Plugin>,
        val skippedCloudstream: Int,
    )

    data class Plugin(
        val packageName: String,
        val name: String,
        val version: String,
        val description: String?,
        val iconUrl: String?,
        val languages: List<String>,
        val sourceUrl: String,
        /** Plugin code wrapped with the SkyStream SDK shim, ready for the Nuvio runtime. */
        val code: String,
    )

    /** SkyStream (and Cloudstream) repositories list plugin files instead of Nuvio `scrapers`. */
    fun isRepository(payload: String): Boolean {
        val root = runCatching { json.parseToJsonElement(payload) }.getOrNull() as? JsonObject ?: return false
        return root["scrapers"] == null && (root["pluginLists"] as? JsonArray)?.isNotEmpty() == true
    }

    suspend fun fetchRepository(repositoryUrl: String, payload: String): Repository {
        val root = json.parseToJsonElement(payload) as JsonObject
        val listUrls = (root["pluginLists"] as JsonArray).mapNotNull { it.stringValue()?.resolveAgainst(repositoryUrl) }
        val entries = listUrls.flatMap { listUrl ->
            runCatching {
                (json.parseToJsonElement(httpGetText(listUrl)) as? JsonArray)
                    ?.mapNotNull { element -> (element as? JsonObject)?.let { it to listUrl } }
                    .orEmpty()
            }.onFailure { error ->
                InAppLogger.warn("Plugins/SkyStream", "Plugin list failed url=${InAppLogger.redactUrl(listUrl)} error=${InAppLogger.throwableSummary(error)}")
            }.getOrDefault(emptyList())
        }

        var skippedCloudstream = 0
        val plugins = entries.mapNotNull { (entry, listUrl) ->
            val url = entry.string("url")?.resolveAgainst(listUrl) ?: return@mapNotNull null
            val path = url.substringBefore('?').lowercase()
            if (path.endsWith(".cs3") || entry["internalName"] != null) {
                // Cloudstream packages are Android DEX code and cannot run here.
                skippedCloudstream++
                return@mapNotNull null
            }
            runCatching { loadPlugin(entry, url) }
                .onFailure { error ->
                    InAppLogger.warn("Plugins/SkyStream", "Plugin load failed url=${InAppLogger.redactUrl(url)} error=${InAppLogger.throwableSummary(error)}")
                }
                .getOrNull()
        }
        return Repository(
            name = root.string("name") ?: "SkyStream",
            description = root.string("description"),
            plugins = plugins,
            skippedCloudstream = skippedCloudstream,
        )
    }

    private suspend fun loadPlugin(entry: JsonObject, url: String): Plugin {
        val (manifest, code) = if (url.substringBefore('?').lowercase().endsWith(".js")) {
            entry to httpGetText(url)
        } else {
            val archive = httpRequestRaw(
                method = "GET",
                url = url,
                headers = emptyMap(),
                body = "",
                maxResponseBodyBytes = MAX_PACKAGE_BYTES,
            ).also { require(it.status in 200..299) { "HTTP ${it.status}" } }.bodyBytes
            val files = readZipEntries(archive, MAX_ENTRY_BYTES)
            val manifestBytes = files.entries.firstOrNull { it.key.substringAfterLast('/') == "plugin.json" }?.value
                ?: error("plugin.json missing")
            val codeBytes = files.entries.firstOrNull { it.key.substringAfterLast('/') == "plugin.js" }?.value
                ?: error("plugin.js missing")
            (json.parseToJsonElement(manifestBytes.decodeToString()) as JsonObject) to codeBytes.decodeToString()
        }
        val packageName = manifest.string("packageName") ?: manifest.string("id") ?: entry.string("packageName")
            ?: error("packageName missing")
        // Repository listings may override the base URL for moved sites.
        val effectiveManifest = entry.string("customBaseUrl")?.let { customBaseUrl ->
            JsonObject(manifest + ("baseUrl" to JsonPrimitive(customBaseUrl)))
        } ?: manifest
        return Plugin(
            packageName = packageName,
            name = manifest.string("name") ?: entry.string("name") ?: packageName,
            version = (manifest["version"] as? JsonPrimitive)?.contentOrNull ?: "1",
            description = manifest.string("description") ?: entry.string("description"),
            iconUrl = entry.string("iconUrl") ?: manifest.string("iconUrl"),
            languages = (manifest["languages"] as? JsonArray)?.mapNotNull { it.stringValue() }.orEmpty(),
            sourceUrl = url,
            code = SkyStreamShim.wrap(effectiveManifest.toString(), code),
        )
    }

    private fun JsonObject.string(key: String): String? = this[key]?.stringValue()

    private fun kotlinx.serialization.json.JsonElement.stringValue(): String? =
        (this as? JsonPrimitive)?.takeIf { it.isString || it.intOrNull != null }?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun String.resolveAgainst(base: String): String = when {
        startsWith("http://") || startsWith("https://") -> this
        startsWith("/") -> base.substringBefore("://") + "://" + base.substringAfter("://").substringBefore('/') + this
        else -> base.substringBefore('?').substringBeforeLast('/') + "/" + this
    }
}
