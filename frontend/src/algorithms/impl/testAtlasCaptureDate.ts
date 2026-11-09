// Test Atlas: capture date of an evidence photo, read in the browser from its
// EXIF / XMP metadata (JPEG, PNG, WebP, TIFF). Port of the original app.js.

const DATE_TAGS = [0x9003, 0x9004, 0x0132]

/** Parse EXIF/XMP date text into YYYY-MM-DDTHH:MM:SS, or null. */
export const exifDate = (raw: string | null | undefined): string | null => {
    const match = /(19\d{2}|20\d{2})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(raw ?? ''))
    if (!match) return null
    const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`
    const date = new Date(`${iso}Z`)
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 19) !== iso) return null
    return iso
}

/** Read TIFF image directories recursively, preferring DateTimeOriginal. */
export const parseTiff = (bytes: Uint8Array, start = 0): string | null => {
    try {
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        const order = String.fromCharCode(bytes[start], bytes[start + 1])
        if (order !== 'II' && order !== 'MM') return null
        const littleEndian = order === 'II'
        const readUint16 = (offset: number) => view.getUint16(offset, littleEndian)
        const readUint32 = (offset: number) => view.getUint32(offset, littleEndian)
        if (readUint16(start + 2) !== 42) return null
        const seen = new Set<number>()

        const readIfd = (offset: number, depth = 0): string | null => {
            const position = start + offset
            if (depth > 4 || seen.has(position) || position + 2 > bytes.length) return null
            seen.add(position)
            const count = readUint16(position)
            if (count > 1000 || position + 2 + count * 12 > bytes.length) return null
            let fallback: string | null = null
            let subdirectory: number | null = null
            for (let index = 0; index < count; index++) {
                const itemPosition = position + 2 + index * 12
                const tag = readUint16(itemPosition)
                const type = readUint16(itemPosition + 2)
                const length = readUint32(itemPosition + 4)
                const value = readUint32(itemPosition + 8)
                if (tag === 0x8769) subdirectory = value
                if (DATE_TAGS.includes(tag) && type === 2 && length > 0 && length < 100) {
                    const begin = length <= 4 ? itemPosition + 8 : start + value
                    if (begin + length <= bytes.length) {
                        const found = exifDate(new TextDecoder('latin1').decode(bytes.subarray(begin, begin + length)))
                        if (found && tag === 0x9003) return found
                        fallback ||= found
                    }
                }
            }
            const nested = subdirectory !== null ? readIfd(subdirectory, depth + 1) : null
            return nested || fallback
        }
        return readIfd(readUint32(start + 4))
    } catch {
        return null
    }
}

/** Read the image capture date from supported metadata containers, or null. */
export const captureDate = async (file: Blob): Promise<string | null> => {
    const buffer = await file.slice(0, Math.min(file.size, 8 * 1024 * 1024)).arrayBuffer()
    const bytes = new Uint8Array(buffer)
    const decoder = new TextDecoder('latin1')
    const text = (from: number, to: number) => decoder.decode(bytes.subarray(from, to))
    let found: string | null = null

    if (bytes[0] === 0xff && bytes[1] === 0xd8) {
        // JPEG: walk the APP segments until the Exif APP1.
        for (let position = 2; position + 4 < bytes.length;) {
            if (bytes[position] !== 0xff) break
            const marker = bytes[position + 1]
            const length = (bytes[position + 2] << 8) | bytes[position + 3]
            if (length < 2 || position + 2 + length > bytes.length) break
            if (marker === 0xe1 && text(position + 4, position + 10) === 'Exif\0\0') {
                found = parseTiff(bytes, position + 10)
            }
            if (found) break
            position += length + 2
        }
    } else if (text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP') {
        // WebP: RIFF chunks, EXIF chunk.
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        for (let position = 12; position + 8 < bytes.length;) {
            const type = text(position, position + 4)
            const size = view.getUint32(position + 4, true)
            if (type === 'EXIF') {
                const tiffStart = position + 8 + (text(position + 8, position + 14) === 'Exif\0\0' ? 6 : 0)
                found = parseTiff(bytes, tiffStart)
            }
            if (found) break
            position += 8 + size + (size % 2)
        }
    } else if (bytes[0] === 0x89 && text(1, 4) === 'PNG') {
        // PNG: eXIf chunk, else date text in tEXt / iTXt chunks.
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
        for (let position = 8; position + 12 < bytes.length;) {
            const size = view.getUint32(position, false)
            const type = text(position + 4, position + 8)
            if (position + 12 + size > bytes.length) break
            if (type === 'eXIf') found = parseTiff(bytes, position + 8)
            if (!found && (type === 'tEXt' || type === 'iTXt')) found = exifDate(text(position + 8, position + 8 + size))
            if (found) break
            position += 12 + size
        }
    } else {
        // Standalone TIFF.
        const startMarker = text(0, 2)
        if (startMarker === 'II' || startMarker === 'MM') found = parseTiff(bytes)
    }

    // Bounded fallback search: embedded Exif block or XMP date properties.
    if (!found) {
        const raw = decoder.decode(bytes)
        const exifPosition = raw.indexOf('Exif\0\0')
        if (exifPosition >= 0) found = parseTiff(bytes, exifPosition + 6)
        const xmp = /(?:DateTimeOriginal|DateCreated|CreateDate)[^\d]{0,100}([12]\d{3}[-:]\d\d[-:]\d\d[T ]\d\d:\d\d:\d\d)/i.exec(raw)
        found ||= exifDate(xmp?.[1])
    }
    return found
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** Local date and time of a timestamp, in the format used for capture dates. */
export const localIso = (milliseconds: number): string | null => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return null
    const date = new Date(milliseconds)
    const year = date.getFullYear()
    if (year < 1900 || year > 2099) return null
    return `${year}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
        + `T${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/**
 * Capture date of a new photo with its source: photo metadata, else the file's
 * modified date, else the test date (captureDate null).
 */
export const resolvePhotoDate = async (file: File): Promise<{ captureDate: string | null; dateSource: 'metadata' | 'modified' | 'test' }> => {
    const fromMetadata = await captureDate(file).catch(() => null)
    if (fromMetadata) return { captureDate: fromMetadata, dateSource: 'metadata' }
    const fromModified = localIso(file.lastModified)
    if (fromModified) return { captureDate: fromModified, dateSource: 'modified' }
    return { captureDate: null, dateSource: 'test' }
}
