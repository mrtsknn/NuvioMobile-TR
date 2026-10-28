package com.nuvio.app.features.nuviotr

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.ui.NuvioSurfaceCard
import com.nuvio.app.features.details.components.DetailSectionTitle
import com.nuvio.app.features.plugins.PluginAddonTransport
import com.nuvio.app.features.plugins.PluginComment
import com.nuvio.app.features.plugins.PluginContentRegistry
import com.nuvio.app.features.plugins.PluginRepository
import com.nuvio.app.features.plugins.PluginUserMessage
import com.nuvio.app.features.plugins.PluginUserMessageBus
import nuvio.composeapp.generated.resources.Res
import nuvio.composeapp.generated.resources.nuviotr_comments_empty
import nuvio.composeapp.generated.resources.nuviotr_comments_loading
import nuvio.composeapp.generated.resources.nuviotr_comments_title
import nuvio.composeapp.generated.resources.nuviotr_message_ok
import org.jetbrains.compose.resources.stringResource

private const val MAX_VISIBLE_SITE_COMMENTS = 20

private sealed interface SiteCommentsState {
    data object Unavailable : SiteCommentsState
    data object Loading : SiteCommentsState
    data class Loaded(val sourceName: String, val comments: List<PluginComment>) : SiteCommentsState
}

/**
 * Comments from the site a title was opened from (plugins declaring `supportsComments`).
 * Renders nothing for titles that did not come from such a plugin catalog.
 */
@Composable
fun PluginSiteCommentsSection(
    id: String,
    type: String,
    horizontalPadding: Dp,
) {
    val state by produceState<SiteCommentsState>(SiteCommentsState.Unavailable, id, type) {
        val handler = PluginAddonTransport.commentsHandler ?: return@produceState
        val origin = PluginContentRegistry.find(id, type)
        val sourceName = origin?.let { found ->
            PluginRepository.uiState.value.scrapers.firstOrNull { it.id == found.scraperId }?.name?.trimStart('!')
        }
        if (origin == null && !id.startsWith(PluginAddonTransport.CONTENT_ID_PREFIX)) return@produceState
        value = SiteCommentsState.Loading
        val comments = runCatching { handler(id, type) }.getOrNull()
        value = if (comments == null) {
            SiteCommentsState.Unavailable
        } else {
            SiteCommentsState.Loaded(sourceName.orEmpty(), comments)
        }
    }

    val current = state
    if (current == SiteCommentsState.Unavailable) return
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = horizontalPadding),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Spacer(modifier = Modifier.height(8.dp))
        DetailSectionTitle(
            title = stringResource(
                Res.string.nuviotr_comments_title,
                (current as? SiteCommentsState.Loaded)?.sourceName?.ifBlank { null } ?: "Site",
            ),
        )
        when (current) {
            SiteCommentsState.Loading -> SiteCommentText(stringResource(Res.string.nuviotr_comments_loading))
            is SiteCommentsState.Loaded -> if (current.comments.isEmpty()) {
                SiteCommentText(stringResource(Res.string.nuviotr_comments_empty))
            } else {
                current.comments.take(MAX_VISIBLE_SITE_COMMENTS).forEach { comment ->
                    NuvioSurfaceCard {
                        Text(
                            text = comment.author,
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = comment.text,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurface,
                        )
                    }
                }
            }
            SiteCommentsState.Unavailable -> Unit
        }
    }
}

@Composable
private fun SiteCommentText(text: String) {
    Text(
        text = text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

/** Shows messages plugins raise with `Nuvio.showMessage(message, title)`, one at a time. */
@Composable
fun PluginMessageDialogHost() {
    var pending by remember { mutableStateOf<List<PluginUserMessage>>(emptyList()) }
    LaunchedEffect(Unit) {
        PluginUserMessageBus.messages.collect { message -> pending = pending + message }
    }
    val message = pending.firstOrNull() ?: return
    val sourceName = remember(message.scraperId) {
        PluginRepository.uiState.value.scrapers.firstOrNull { it.id == message.scraperId }?.name?.trimStart('!')
    }
    AlertDialog(
        onDismissRequest = { pending = pending.drop(1) },
        title = { Text(message.title ?: sourceName ?: "Nuvio") },
        text = { Text(message.message) },
        confirmButton = {
            TextButton(onClick = { pending = pending.drop(1) }) {
                Text(stringResource(Res.string.nuviotr_message_ok))
            }
        },
    )
}
