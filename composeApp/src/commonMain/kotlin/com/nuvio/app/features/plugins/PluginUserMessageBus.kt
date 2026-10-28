package com.nuvio.app.features.plugins

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

data class PluginUserMessage(
    val scraperId: String,
    val title: String?,
    val message: String,
)

/** Messages plugins raise with `Nuvio.showMessage(message, title)`; shown by the app's dialog host. */
object PluginUserMessageBus {
    private val _messages = MutableSharedFlow<PluginUserMessage>(
        extraBufferCapacity = 8,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val messages: SharedFlow<PluginUserMessage> = _messages.asSharedFlow()

    // The same plugin often runs several times per screen; repeat its message only once a session.
    private val lock = SynchronizedObject()
    private val shown = mutableSetOf<String>()

    fun show(scraperId: String, message: String, title: String?) {
        if (message.isBlank()) return
        if (!synchronized(lock) { shown.add("$scraperId|$title|$message") }) return
        _messages.tryEmit(PluginUserMessage(scraperId = scraperId, title = title?.takeIf { it.isNotBlank() }, message = message))
    }
}
