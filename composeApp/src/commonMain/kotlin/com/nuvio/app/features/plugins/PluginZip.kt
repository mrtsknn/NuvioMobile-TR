package com.nuvio.app.features.plugins

/** Inflates a raw DEFLATE stream (no zlib/gzip header), as stored in zip entries. */
internal expect fun inflateRawDeflate(bytes: ByteArray, maxOutputBytes: Int): ByteArray

/**
 * Reads the files of a zip archive through its central directory. Supports the two methods
 * plugin packages use: stored (0) and deflate (8).
 */
internal fun readZipEntries(archive: ByteArray, maxEntryBytes: Int): Map<String, ByteArray> {
    fun u16(offset: Int): Int =
        (archive[offset].toInt() and 0xFF) or ((archive[offset + 1].toInt() and 0xFF) shl 8)
    fun u32(offset: Int): Long =
        u16(offset).toLong() or (u16(offset + 2).toLong() shl 16)

    var end = archive.size - 22
    while (end >= 0 && u32(end) != 0x06054B50L) end--
    require(end >= 0) { "Not a zip archive" }
    val entryCount = u16(end + 10)
    var offset = u32(end + 16).toInt()

    val entries = linkedMapOf<String, ByteArray>()
    repeat(entryCount) {
        require(u32(offset) == 0x02014B50L) { "Corrupt zip directory" }
        val method = u16(offset + 10)
        val compressedSize = u32(offset + 20).toInt()
        val size = u32(offset + 24).toInt()
        val nameLength = u16(offset + 28)
        val extraLength = u16(offset + 30)
        val commentLength = u16(offset + 32)
        val localOffset = u32(offset + 42).toInt()
        val name = archive.copyOfRange(offset + 46, offset + 46 + nameLength).decodeToString()
        offset += 46 + nameLength + extraLength + commentLength

        if (name.endsWith('/')) return@repeat
        require(size <= maxEntryBytes) { "Zip entry $name is too large" }
        require(u32(localOffset) == 0x04034B50L) { "Corrupt zip entry $name" }
        val dataStart = localOffset + 30 + u16(localOffset + 26) + u16(localOffset + 28)
        val data = archive.copyOfRange(dataStart, dataStart + compressedSize)
        entries[name] = when (method) {
            0 -> data
            8 -> inflateRawDeflate(data, maxEntryBytes)
            else -> throw IllegalArgumentException("Unsupported zip compression $method in $name")
        }
    }
    return entries
}
