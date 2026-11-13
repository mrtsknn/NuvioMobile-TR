package com.nuvio.app.features.plugins.runtime.network

import kotlinx.atomicfu.locks.SynchronizedObject
import kotlinx.atomicfu.locks.synchronized
import kotlin.time.Duration
import kotlin.time.Duration.Companion.minutes
import kotlin.time.TimeMark
import kotlin.time.TimeSource

/**
 * Plugin sites go down or get blocked often. Without this, every provider whose site is dead
 * waits out a full connect timeout on each episode, and with many providers queued behind a
 * small worker pool that alone keeps the streams screen loading for minutes.
 *
 * A host that fails to connect is skipped for [COOLDOWN]; requests to it fail at once.
 */
internal object UnreachableHosts {
    private val COOLDOWN: Duration = 10.minutes

    private val lock = SynchronizedObject()
    private val failedAt = mutableMapOf<String, TimeMark>()

    fun hostOf(url: String): String? =
        url.substringAfter("://", "").substringBefore('/').substringBefore('?')
            .substringAfterLast('@').substringBefore(':').lowercase().ifBlank { null }

    fun isSkipped(url: String): Boolean {
        val host = hostOf(url) ?: return false
        return synchronized(lock) {
            val mark = failedAt[host] ?: return@synchronized false
            if (mark.elapsedNow() >= COOLDOWN) {
                failedAt.remove(host)
                false
            } else {
                true
            }
        }
    }

    /** Records [error] for [url] when it means the host could not be reached at all. */
    fun recordFailure(url: String, error: Throwable) {
        if (!isConnectFailure(error)) return
        val host = hostOf(url) ?: return
        synchronized(lock) { failedAt[host] = TimeSource.Monotonic.markNow() }
    }

    private fun isConnectFailure(error: Throwable): Boolean {
        var current: Throwable? = error
        var depth = 0
        while (current != null && depth < 6) {
            val text = (current::class.simpleName.orEmpty() + " " + current.message.orEmpty()).lowercase()
            if (CONNECT_FAILURE_MARKERS.any { it in text }) return true
            current = current.cause
            depth++
        }
        return false
    }

    private val CONNECT_FAILURE_MARKERS = listOf(
        "sockettimeoutexception",
        "connecttimeout",
        "connectexception",
        "unknownhostexception",
        "unresolvedaddressexception",
        "noroutetohostexception",
        "failed to connect",
        "unable to resolve host",
        "connection refused",
        // NSURLErrorDomain: -1001 timed out, -1003 cannot find host, -1004 cannot connect.
        "code=-1001",
        "code=-1003",
        "code=-1004",
        "the request timed out",
        "could not connect to the server",
        "a server with the specified hostname could not be found",
    )
}
