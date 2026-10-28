package com.nuvio.app.core.poster

import coil3.intercept.Interceptor
import coil3.network.NetworkHeaders
import coil3.network.httpHeaders
import coil3.request.ImageResult

private const val BROWSER_USER_AGENT =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

/** Image hosts that serve app clients without browser headers; everything else gets them. */
private val API_IMAGE_HOSTS = listOf(
    "image.tmdb.org",
    "images.metahub.space",
    "live.metahub.space",
    "episodes.metahub.space",
    "m.media-amazon.com",
    "walter.trakt.tv",
    "simkl.in",
)

/**
 * Plugin catalogs return posters straight from the site, and many sites refuse hot-linked
 * images without a browser user agent and a same-site referer. Adds both for such hosts.
 */
class BrowserImageHeadersInterceptor : Interceptor {
    override suspend fun intercept(chain: Interceptor.Chain): ImageResult {
        val url = chain.request.data as? String ?: return chain.proceed()
        if (!url.startsWith("http://") && !url.startsWith("https://")) return chain.proceed()
        val origin = url.substringBefore("://") + "://" + url.substringAfter("://").substringBefore('/')
        val host = origin.substringAfter("://").substringBefore(':').lowercase()
        if (API_IMAGE_HOSTS.any { host == it || host.endsWith(".$it") }) return chain.proceed()

        val existing = chain.request.httpHeaders
        if (existing["User-Agent"] != null) return chain.proceed()
        val headers = existing.newBuilder()
            .set("User-Agent", BROWSER_USER_AGENT)
            .set("Referer", "$origin/")
            .build()
        return chain.withRequest(chain.request.newBuilder().httpHeaders(headers).build()).proceed()
    }
}
