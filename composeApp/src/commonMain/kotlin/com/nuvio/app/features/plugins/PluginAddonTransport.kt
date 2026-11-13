package com.nuvio.app.features.plugins

import com.nuvio.app.features.nuviotr.NuvioTrSetupStorage
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.atomicfu.locks.synchronized
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlin.io.encoding.Base64
import kotlin.io.encoding.ExperimentalEncodingApi

/**
 * Exposes catalog-capable plugins as virtual Stremio addons so Home, Search, Details and Streams
 * reuse the regular addon pipeline. Requests to [HOST] never leave the device: the addon HTTP
 * client hands them to [handler], which the full plugin runtime installs.
 */
object PluginAddonTransport {
    const val HOST = "plugins.nuviotr.local"
    private const val BASE_URL = "https://$HOST/"

    /** Content ids for plugin items that could not be matched to TMDB. */
    const val CONTENT_ID_PREFIX = "nvp."

    var handler: (suspend (url: String) -> String?)? = null

    /** Site comments for a title opened from a plugin catalog; null when the source has none. */
    var commentsHandler: (suspend (id: String, type: String) -> List<PluginComment>?)? = null

    fun isVirtualUrl(url: String): Boolean = url.startsWith(BASE_URL)

    fun manifestUrlFor(scraperId: String): String = "$BASE_URL${encodeSegment(scraperId)}/manifest.json"

    fun scraperIdFromUrl(url: String): String? =
        url.removePrefix(BASE_URL).substringBefore('/').takeIf { it.isNotBlank() }?.let(::decodeSegment)

    @OptIn(ExperimentalEncodingApi::class)
    fun encodeSegment(value: String): String =
        Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT).encode(value.encodeToByteArray())

    @OptIn(ExperimentalEncodingApi::class)
    fun decodeSegment(value: String): String? = runCatching {
        Base64.UrlSafe.withPadding(Base64.PaddingOption.ABSENT_OPTIONAL).decode(value).decodeToString()
    }.getOrNull()
}

/**
 * Remembers which plugin item a TMDB/IMDb title came from, so the catalog's own plugin can be
 * asked for streams and comments with the provider page URL instead of a title search.
 */
object PluginContentRegistry {
    @Serializable
    data class Origin(
        val scraperId: String,
        val contentId: String,
        val url: String?,
        val type: String,
    )

    private const val STORAGE_KEY = "plugin_content_origins_v1"
    private const val MAX_ENTRIES = 4000

    private val lock = SynchronizedObject()
    // Insertion-ordered so the oldest entries are dropped first once the cap is reached.
    private val originsByKey = LinkedHashMap<String, Origin>()
    private var loaded = false
    private val storageJson = Json { ignoreUnknownKeys = true }

    private fun key(id: String, type: String): String =
        "${normalizePluginType(type)}:${id.trim().lowercase()}"

    /** Home rows come back from the on-disk snapshot after a restart, so origins must survive it too. */
    private fun ensureLoaded() {
        if (loaded) return
        loaded = true
        val raw = runCatching { NuvioTrSetupStorage.loadValue(STORAGE_KEY) }.getOrNull() ?: return
        runCatching { storageJson.decodeFromString<Map<String, Origin>>(raw) }
            .getOrNull()
            ?.let { originsByKey.putAll(it) }
    }

    private val saveScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private var saveJob: Job? = null

    /** Catalog pages remember many items in a burst; write once after it settles. Call under [lock]. */
    private fun persist() {
        while (originsByKey.size > MAX_ENTRIES) {
            originsByKey.remove(originsByKey.keys.first())
        }
        saveJob?.cancel()
        saveJob = saveScope.launch {
            delay(2_000)
            val snapshot = synchronized(lock) { storageJson.encodeToString(originsByKey.toMap()) }
            runCatching { NuvioTrSetupStorage.saveValue(STORAGE_KEY, snapshot) }
        }
    }

    fun remember(ids: List<String>, origin: Origin) {
        synchronized(lock) {
            ensureLoaded()
            var changed = false
            ids.filter { it.isNotBlank() }.forEach { id ->
                val k = key(id, origin.type)
                if (originsByKey[k] != origin) {
                    originsByKey.remove(k)
                    originsByKey[k] = origin
                    changed = true
                }
            }
            if (changed) persist()
        }
    }

    /** Looks up by any id form the app uses: `tt…`, `tmdb:123`, `123` or a plugin content id. */
    fun find(id: String, type: String): Origin? {
        val base = id.substringBefore(':').let { if (it.equals("tmdb", ignoreCase = true)) id.substringAfter(':').substringBefore(':') else it }
        return synchronized(lock) {
            ensureLoaded()
            originsByKey[key(id, type)]
                ?: originsByKey[key(base, type)]
                ?: originsByKey[key("tmdb:$base", type)]
        }
    }
}

/** A comment a catalog plugin returns from its site for one title. */
data class PluginComment(
    val id: String,
    val author: String,
    val text: String,
)
