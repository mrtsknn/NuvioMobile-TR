package com.nuvio.app.features.plugins

import com.nuvio.app.core.logging.InAppLogger
import com.nuvio.app.features.plugins.runtime.PluginRuntime
import com.nuvio.app.features.tmdb.TmdbService
import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.add
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

private const val SEARCH_CATALOG_ID = "nuviotr-search"
private const val TMDB_MATCH_CONCURRENCY = 6

/** Serves the virtual addon protocol described in [PluginAddonTransport] from installed plugins. */
internal object PluginAddonBridge {
    private val json = Json { ignoreUnknownKeys = true }

    // Plugin pages are cursor based; the addon pipeline pages by item offset (`skip`).
    private val pageTokensLock = SynchronizedObject()
    private val pageTokens = mutableMapOf<String, String>()

    @Serializable
    private data class CustomContent(
        val c: String,
        val u: String? = null,
        val n: String,
        val t: String,
        val y: Int? = null,
        val p: String? = null,
        val b: String? = null,
        val d: String? = null,
    )

    private data class PluginItem(
        val contentId: String,
        val url: String?,
        val name: String,
        val type: String,
        val year: Int?,
        val poster: String?,
        val background: String?,
        val logo: String?,
        val description: String?,
        val genres: List<String>,
        val tmdbId: String?,
        val imdbId: String?,
    )

    suspend fun handle(url: String): String? {
        val scraperId = PluginAddonTransport.scraperIdFromUrl(url) ?: return null
        val scraper = findScraper(scraperId) ?: return null
        val path = url.substringBefore('?')
            .substringAfter("${PluginAddonTransport.HOST}/")
            .substringAfter('/')
            .removeSuffix(".json")
        val segments = path.split('/')
        return when (segments.firstOrNull()) {
            "manifest" -> manifestJson(scraper)
            "catalog" -> catalogJson(
                scraper = scraper,
                type = segments.getOrNull(1) ?: return null,
                catalogId = segments.getOrNull(2)?.percentDecode() ?: return null,
                extra = parseExtra(segments.getOrNull(3)),
            )
            "meta" -> metaJson(scraper, segments.getOrNull(2)?.percentDecode() ?: return null)
            "stream" -> streamsJson(scraper, segments.getOrNull(2)?.percentDecode() ?: return null)
            else -> null
        }
    }

    /** Comments for a title that was opened from a plugin catalog; null when not available. */
    suspend fun comments(id: String, type: String): List<PluginComment>? {
        val origin = originFor(id, type) ?: return null
        val scraper = findScraper(origin.scraperId)?.takeIf { it.supportsComments } ?: return null
        val raw = PluginRuntime.executeEntryPoint(
            code = scraper.code,
            scraperId = scraper.id,
            functionName = "comments",
            argsJson = buildJsonObject {
                put("contentId", origin.contentId)
                put("url", origin.url)
                put("type", origin.type)
                put("pageToken", null as String?)
                put("language", "tr")
            }.toString(),
            emptyResultJson = """{"comments":[]}""",
        )
        val root = runCatching { json.parseToJsonElement(raw) }.getOrNull() ?: return emptyList()
        val elements = when (root) {
            is JsonObject -> (root["comments"] ?: root["items"]) as? JsonArray
            is JsonArray -> root
            else -> null
        } ?: return emptyList()
        return elements.mapIndexedNotNull { index, element ->
            val value = element as? JsonObject ?: return@mapIndexedNotNull null
            val author = value.string("author") ?: value.string("name") ?: value.string("username")
                ?: return@mapIndexedNotNull null
            val text = value.string("text") ?: value.string("comment") ?: value.string("body")
                ?: return@mapIndexedNotNull null
            PluginComment(
                id = value.string("id") ?: "${origin.contentId}:$index",
                author = author.decodeHtmlEntities(),
                text = text.decodeHtmlEntities(),
            )
        }
    }

    /** The plugin page URL to pass to [scraper] when it is asked for streams of [id]. */
    fun contentUrlFor(scraper: PluginScraper, id: String, type: String): String? =
        PluginContentRegistry.find(id, type)?.takeIf { it.scraperId == scraper.id }?.url

    private fun originFor(id: String, type: String): PluginContentRegistry.Origin? =
        PluginContentRegistry.find(id, type) ?: decodeCustomId(id)?.let { (scraperId, content) ->
            PluginContentRegistry.Origin(scraperId = scraperId, contentId = content.c, url = content.u, type = content.t)
        }

    private fun findScraper(scraperId: String): PluginScraper? {
        PluginRepository.initialize()
        return PluginRepository.uiState.value.scrapers.firstOrNull { it.id == scraperId && it.enabled }
    }

    private fun manifestJson(scraper: PluginScraper): String {
        val types = buildList {
            if (scraper.supportsType("movie")) add("movie")
            if (scraper.supportsType("series")) add("series")
        }.ifEmpty { listOf("movie", "series") }
        val idPrefix = customIdPrefix(scraper.id)
        return buildJsonObject {
            put("id", "nuviotr.plugin.${PluginAddonTransport.encodeSegment(scraper.id).takeLast(24)}")
            put("version", scraper.version.ifBlank { "1.0.0" })
            put("name", scraper.name.trimStart('!'))
            put("description", scraper.description)
            scraper.logo?.let { put("logo", it) }
            putJsonArray("types") { types.forEach { add(it) } }
            putJsonArray("catalogs") {
                scraper.catalogs.forEach { catalog ->
                    addJsonObject {
                        put("type", catalog.type.toStremioType())
                        put("id", catalog.id)
                        put("name", catalog.name)
                        putJsonArray("extra") {
                            if (catalog.supportsPagination) addJsonObject { put("name", "skip") }
                        }
                    }
                }
                if (scraper.supportsSearch) {
                    types.forEach { type ->
                        addJsonObject {
                            put("type", type)
                            put("id", SEARCH_CATALOG_ID)
                            put("name", scraper.name.trimStart('!'))
                            putJsonArray("extra") {
                                addJsonObject {
                                    put("name", "search")
                                    put("isRequired", true)
                                }
                            }
                        }
                    }
                }
            }
            putJsonArray("resources") {
                add("catalog")
                listOf("meta", "stream").forEach { resource ->
                    addJsonObject {
                        put("name", resource)
                        putJsonArray("types") { types.forEach { add(it) } }
                        putJsonArray("idPrefixes") { add(idPrefix) }
                    }
                }
            }
            putJsonArray("idPrefixes") { add(idPrefix) }
        }.toString()
    }

    private suspend fun catalogJson(
        scraper: PluginScraper,
        type: String,
        catalogId: String,
        extra: Map<String, String>,
    ): String {
        val skip = extra["skip"]?.toIntOrNull() ?: 0
        val items: List<PluginItem>
        if (catalogId == SEARCH_CATALOG_ID) {
            val query = extra["search"]?.takeIf { it.isNotBlank() } ?: return emptyCatalog()
            if (skip > 0) return emptyCatalog()
            val raw = PluginRuntime.executeEntryPoint(
                code = scraper.code,
                scraperId = scraper.id,
                functionName = "search",
                argsJson = buildJsonObject {
                    put("query", query)
                    put("language", "tr")
                }.toString(),
                emptyResultJson = """{"items":[]}""",
            )
            items = parseItems(raw).filter { it.type.toStremioType() == type }
        } else {
            val declared = scraper.catalogs.firstOrNull { it.id == catalogId && it.type.toStremioType() == type }
                ?: return emptyCatalog()
            val tokenKey = "${scraper.id}|$type|$catalogId"
            val pageToken = if (skip > 0) {
                if (!declared.supportsPagination) return emptyCatalog()
                synchronized(pageTokensLock) { pageTokens["$tokenKey|$skip"] } ?: return emptyCatalog()
            } else {
                null
            }
            val raw = PluginRuntime.executeEntryPoint(
                code = scraper.code,
                scraperId = scraper.id,
                functionName = "getCatalog",
                argsJson = buildJsonObject {
                    put("catalogId", catalogId)
                    put("type", declared.type)
                    put("pageToken", pageToken)
                    put("language", "tr")
                }.toString(),
                emptyResultJson = """{"items":[]}""",
            )
            items = parseItems(raw).filter { it.type.toStremioType() == type }
            val nextToken = (runCatching { json.parseToJsonElement(raw) }.getOrNull() as? JsonObject)?.string("nextPageToken")
            if (nextToken != null && nextToken != pageToken && items.isNotEmpty()) {
                synchronized(pageTokensLock) { pageTokens["$tokenKey|${skip + items.size}"] = nextToken }
            }
        }

        val semaphore = Semaphore(TMDB_MATCH_CONCURRENCY)
        val metas = coroutineScope {
            items.map { item ->
                async { semaphore.withPermit { item.toMeta(scraper) } }
            }.awaitAll()
        }
        InAppLogger.info("Plugins/Bridge", "catalog scraper=${scraper.id} catalog=$catalogId skip=$skip items=${metas.size}")
        return buildJsonObject { put("metas", JsonArray(metas)) }.toString()
    }

    /** Prefers ids the rest of the app understands, so details, episodes and history work as usual. */
    private suspend fun PluginItem.toMeta(scraper: PluginScraper): JsonObject {
        val stremioType = type.toStremioType()
        val tmdb = tmdbId ?: if (imdbId == null) {
            runCatching { TmdbService.searchTmdbId(name, year, stremioType) }.getOrNull()
        } else {
            null
        }
        val id = imdbId
            ?: tmdb?.let { "tmdb:$it" }
            ?: encodeCustomId(scraper.id, this)
        PluginContentRegistry.remember(
            ids = listOfNotNull(id, imdbId, tmdb, tmdb?.let { "tmdb:$it" }),
            origin = PluginContentRegistry.Origin(scraperId = scraper.id, contentId = contentId, url = url, type = stremioType),
        )
        return buildJsonObject {
            put("id", id)
            put("type", stremioType)
            put("name", name)
            poster?.let { put("poster", it) }
            background?.let { put("background", it) }
            logo?.let { put("logo", it) }
            description?.let { put("description", it) }
            year?.let { put("releaseInfo", it.toString()) }
            if (genres.isNotEmpty()) putJsonArray("genres") { genres.forEach { add(it) } }
        }
    }

    /** Minimal details for plugin items that have no TMDB match. */
    private fun metaJson(scraper: PluginScraper, id: String): String? {
        val (scraperId, content) = decodeCustomId(id) ?: return null
        if (scraperId != scraper.id) return null
        return buildJsonObject {
            putJsonObject("meta") {
                put("id", id)
                put("type", content.t)
                put("name", content.n)
                content.p?.let { put("poster", it) }
                content.b?.let { put("background", it) }
                content.d?.let { put("description", it) }
                content.y?.let { put("releaseInfo", it.toString()) }
            }
        }.toString()
    }

    private suspend fun streamsJson(scraper: PluginScraper, id: String): String {
        val (scraperId, content) = decodeCustomId(id.substringBefore(':')) ?: return """{"streams":[]}"""
        if (scraperId != scraper.id) return """{"streams":[]}"""
        val episodeParts = id.split(':').drop(1).mapNotNull(String::toIntOrNull)
        val results = PluginRepository.executeScraperForContent(
            scraper = scraper,
            tmdbId = content.c,
            mediaType = content.t,
            season = episodeParts.getOrNull(0),
            episode = episodeParts.getOrNull(1),
            contentUrl = content.u,
        ).getOrDefault(emptyList())
        return buildJsonObject {
            putJsonArray("streams") {
                results.forEach { result ->
                    addJsonObject {
                        put("url", result.url)
                        put("name", result.provider ?: scraper.name.trimStart('!'))
                        put("title", listOfNotNull(result.title, result.quality, result.size).joinToString(" · "))
                        if (!result.headers.isNullOrEmpty() || result.subtitles != null) {
                            putJsonObject("behaviorHints") {
                                put("notWebReady", true)
                                result.headers?.let { headers ->
                                    putJsonObject("proxyHeaders") {
                                        putJsonObject("request") { headers.forEach { (key, value) -> put(key, value) } }
                                    }
                                }
                            }
                        }
                        result.subtitles?.let { subtitles ->
                            putJsonArray("subtitles") {
                                subtitles.forEachIndexed { index, subtitle ->
                                    addJsonObject {
                                        put("id", "${scraper.id}:$index")
                                        put("url", subtitle.url)
                                        put("lang", subtitle.language)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }.toString()
    }

    private fun parseItems(raw: String): List<PluginItem> {
        val root = runCatching { json.parseToJsonElement(raw) }.getOrNull() as? JsonObject ?: return emptyList()
        // Accept the Nuvio `items` contract and Stremio-compatible plugins' `metas` contract.
        val elements = (root["items"] ?: root["metas"]) as? JsonArray ?: return emptyList()
        return elements.mapNotNull { element ->
            val value = element as? JsonObject ?: return@mapNotNull null
            val externalIds = value["externalIds"] as? JsonObject
            PluginItem(
                contentId = value.string("id") ?: return@mapNotNull null,
                url = value.string("url"),
                name = value.string("name")?.decodeHtmlEntities() ?: return@mapNotNull null,
                type = value.string("type") ?: return@mapNotNull null,
                year = (value["year"] as? JsonPrimitive)?.intOrNull ?: value.string("year")?.take(4)?.toIntOrNull(),
                poster = value.string("poster"),
                background = value.string("background"),
                logo = value.string("logo"),
                description = value.string("description")?.decodeHtmlEntities(),
                genres = (value["genres"] as? JsonArray)
                    ?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.decodeHtmlEntities() }
                    .orEmpty(),
                tmdbId = externalIds?.string("tmdbId") ?: externalIds?.intString("tmdbId"),
                imdbId = (externalIds?.string("imdbId") ?: value.string("imdb_id"))?.takeIf { it.startsWith("tt") },
            )
        }
    }

    private fun customIdPrefix(scraperId: String): String =
        "${PluginAddonTransport.CONTENT_ID_PREFIX}${PluginAddonTransport.encodeSegment(scraperId)}."

    private fun encodeCustomId(scraperId: String, item: PluginItem): String {
        val payload = json.encodeToString(
            CustomContent.serializer(),
            CustomContent(
                c = item.contentId,
                u = item.url,
                n = item.name,
                t = item.type.toStremioType(),
                y = item.year,
                p = item.poster,
                b = item.background,
                d = item.description?.take(400),
            ),
        )
        return customIdPrefix(scraperId) + PluginAddonTransport.encodeSegment(payload)
    }

    private fun decodeCustomId(id: String): Pair<String, CustomContent>? {
        if (!id.startsWith(PluginAddonTransport.CONTENT_ID_PREFIX)) return null
        val parts = id.removePrefix(PluginAddonTransport.CONTENT_ID_PREFIX).substringBefore(':').split('.')
        if (parts.size != 2) return null
        val scraperId = PluginAddonTransport.decodeSegment(parts[0]) ?: return null
        val payload = PluginAddonTransport.decodeSegment(parts[1]) ?: return null
        val content = runCatching { json.decodeFromString(CustomContent.serializer(), payload) }.getOrNull() ?: return null
        return scraperId to content
    }

    private fun parseExtra(segment: String?): Map<String, String> =
        segment.orEmpty().split('&').mapNotNull { part ->
            val key = part.substringBefore('=', "").takeIf { it.isNotBlank() } ?: return@mapNotNull null
            key to part.substringAfter('=').percentDecode()
        }.toMap()

    private fun emptyCatalog(): String = """{"metas":[]}"""

    private fun String.toStremioType(): String = if (normalizePluginType(this) == "tv") "series" else lowercase()

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull?.takeIf { it.isNotBlank() }

    private fun JsonObject.intString(key: String): String? =
        (this[key] as? JsonPrimitive)?.intOrNull?.takeIf { it > 0 }?.toString()
}

private fun String.percentDecode(): String {
    if ('%' !in this && '+' !in this) return this
    val bytes = ArrayList<Byte>(length)
    var index = 0
    while (index < length) {
        val char = this[index]
        when {
            char == '%' && index + 2 <= lastIndex -> {
                val value = substring(index + 1, index + 3).toIntOrNull(16)
                if (value != null) {
                    bytes.add(value.toByte())
                    index += 3
                    continue
                }
                char.toString().encodeToByteArray().forEach(bytes::add)
            }
            char == '+' -> bytes.add(' '.code.toByte())
            else -> char.toString().encodeToByteArray().forEach(bytes::add)
        }
        index++
    }
    return bytes.toByteArray().decodeToString()
}

/** Site titles often arrive HTML-escaped (`&amp;`, `&#039;`). */
internal fun String.decodeHtmlEntities(): String {
    if ('&' !in this) return this
    return Regex("&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);").replace(this) { match ->
        val entity = match.groupValues[1]
        when {
            entity.startsWith("#x") || entity.startsWith("#X") ->
                entity.drop(2).toIntOrNull(16)?.let(::codePointToString) ?: match.value
            entity.startsWith("#") -> entity.drop(1).toIntOrNull()?.let(::codePointToString) ?: match.value
            else -> when (entity) {
                "amp" -> "&"
                "lt" -> "<"
                "gt" -> ">"
                "quot" -> "\""
                "apos" -> "'"
                "nbsp" -> " "
                else -> match.value
            }
        }
    }
}

private fun codePointToString(codePoint: Int): String =
    if (codePoint in 0..0xFFFF) {
        codePoint.toChar().toString()
    } else {
        val offset = codePoint - 0x10000
        charArrayOf(((offset shr 10) + 0xD800).toChar(), ((offset and 0x3FF) + 0xDC00).toChar()).concatToString()
    }
