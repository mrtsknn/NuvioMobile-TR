package com.nuvio.app.features.plugins

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
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
    data class Origin(
        val scraperId: String,
        val contentId: String,
        val url: String?,
        val type: String,
    )

    private val lock = SynchronizedObject()
    private val originsByKey = mutableMapOf<String, Origin>()

    private fun key(id: String, type: String): String =
        "${normalizePluginType(type)}:${id.trim().lowercase()}"

    fun remember(ids: List<String>, origin: Origin) {
        synchronized(lock) {
            ids.filter { it.isNotBlank() }.forEach { originsByKey[key(it, origin.type)] = origin }
        }
    }

    /** Looks up by any id form the app uses: `tt…`, `tmdb:123`, `123` or a plugin content id. */
    fun find(id: String, type: String): Origin? {
        val base = id.substringBefore(':').let { if (it.equals("tmdb", ignoreCase = true)) id.substringAfter(':').substringBefore(':') else it }
        return synchronized(lock) {
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
