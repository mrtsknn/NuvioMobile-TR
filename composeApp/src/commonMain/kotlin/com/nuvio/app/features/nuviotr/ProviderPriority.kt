package com.nuvio.app.features.nuviotr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.nuvio.app.features.plugins.PluginScraper
import com.nuvio.app.features.plugins.normalizePluginType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.nuviotr_priority_label
import nuvio.composeapp.generated.resources.nuviotr_priority_movie
import nuvio.composeapp.generated.resources.nuviotr_priority_series
import org.jetbrains.compose.resources.stringResource

/**
 * Providers the user marked as preferred, kept apart for movies and series because a site
 * that is good for films is often weak for series and the other way round. Preferred
 * providers are queued first on the streams screen and their results are listed on top.
 */
object ProviderPriorityRepository {
    private const val MOVIE_KEY = "provider_priority_movie"
    private const val SERIES_KEY = "provider_priority_series"
    private const val SEPARATOR = "\n"

    private val _movie = MutableStateFlow<List<String>>(emptyList())
    private val _series = MutableStateFlow<List<String>>(emptyList())
    val movie: StateFlow<List<String>> = _movie.asStateFlow()
    val series: StateFlow<List<String>> = _series.asStateFlow()

    private var loaded = false

    private fun ensureLoaded() {
        if (loaded) return
        loaded = true
        _movie.value = read(MOVIE_KEY)
        _series.value = read(SERIES_KEY)
    }

    private fun read(key: String): List<String> =
        runCatching { NuvioTrSetupStorage.loadValue(key) }.getOrNull()
            ?.split(SEPARATOR)?.map(String::trim)?.filter(String::isNotEmpty)?.distinct()
            .orEmpty()

    private fun isSeriesType(type: String): Boolean = normalizePluginType(type) == "tv"

    /** Preferred scraper ids for [type], in the order they were marked. */
    fun idsFor(type: String): List<String> {
        ensureLoaded()
        return if (isSeriesType(type)) _series.value else _movie.value
    }

    fun isPreferred(scraperId: String, type: String): Boolean = scraperId in idsFor(type)

    fun setPreferred(scraperId: String, type: String, preferred: Boolean) {
        ensureLoaded()
        val flow = if (isSeriesType(type)) _series else _movie
        val current = flow.value
        val updated = when {
            preferred && scraperId in current -> return
            preferred -> current + scraperId
            else -> current - scraperId
        }
        flow.value = updated
        runCatching {
            NuvioTrSetupStorage.saveValue(
                if (isSeriesType(type)) SERIES_KEY else MOVIE_KEY,
                updated.joinToString(SEPARATOR).ifEmpty { null },
            )
        }
    }

    /**
     * Reorders [scrapers] so the preferred ones for [type] come first, in the user's order;
     * the rest keep their installed order.
     */
    fun <T> prioritize(items: List<T>, type: String, idOf: (T) -> String): List<T> {
        val preferred = idsFor(type)
        if (preferred.isEmpty()) return items
        val rank = preferred.withIndex().associate { (index, id) -> id to index }
        val (first, rest) = items.partition { idOf(it) in rank }
        return first.sortedBy { rank.getValue(idOf(it)) } + rest
    }
}

/** "★ Film / ★ Dizi" toggles on a provider card in the plugins screen. */
@Composable
fun ProviderPriorityControls(scraper: PluginScraper) {
    val supportsMovie = scraper.supportsType("movie")
    val supportsSeries = scraper.supportsType("tv")
    if (!supportsMovie && !supportsSeries) return
    val movieIds by ProviderPriorityRepository.movie.collectAsStateWithLifecycle()
    val seriesIds by ProviderPriorityRepository.series.collectAsStateWithLifecycle()
    // Reading idsFor once loads the stored lists into the flows collected above.
    ProviderPriorityRepository.idsFor("movie")

    Spacer(modifier = Modifier.height(8.dp))
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = stringResource(Res.string.nuviotr_priority_label),
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (supportsMovie) {
            val selected = scraper.id in movieIds
            FilterChip(
                selected = selected,
                onClick = { ProviderPriorityRepository.setPreferred(scraper.id, "movie", !selected) },
                label = { Text(stringResource(Res.string.nuviotr_priority_movie)) },
            )
        }
        if (supportsSeries) {
            val selected = scraper.id in seriesIds
            FilterChip(
                selected = selected,
                onClick = { ProviderPriorityRepository.setPreferred(scraper.id, "tv", !selected) },
                label = { Text(stringResource(Res.string.nuviotr_priority_series)) },
            )
        }
    }
}
