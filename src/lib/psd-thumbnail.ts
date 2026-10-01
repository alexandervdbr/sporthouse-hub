// Photoshop writes a small flattened JPEG preview into every PSD/PSB, in the
// Image Resources block near the START of the file. That matters because
// Drive refuses to render a preview at all above roughly 40-90 MB (measured:
// a 37 MB PSD gets one, a 96 MB one gets nothing) — and those big files are
// exactly the ones you can't judge by name alone.
//
// Reading it costs a few hundred KB whatever the file weighs, so this works
// on a 235 MB PSD as cheaply as on a 7 MB one. The catch is resolution:
// Photoshop caps this preview at 160px on the long edge, so it's plenty for a
// list tile and only ever a rough impression full-screen. Callers are
// expected to say so rather than pass it off as the real thing.

// Resource 1036 is the modern (RGB) thumbnail. 1033 holds the same image in
// BGR order — showing that one without swapping channels gets the colours
// wrong, and it only appears in files from Photoshop 4.0, so it's skipped.
const THUMBNAIL_RESOURCE_ID = 1036
const JPEG_FORMAT = 1
// Everything before the JPEG in a thumbnail resource: format, width, height,
// widthbytes, totalsize, compressedsize (4 bytes each), bitspixel, planes.
const THUMBNAIL_HEADER_BYTES = 28

// How much of the file to read. Image resources sat within the first 64 KB of
// every PSD tested; 256 KB is headroom for files with more metadata.
export const PSD_HEAD_BYTES = 256 * 1024

export interface PsdThumbnail {
  jpeg: Buffer
  width: number
  height: number
}

export function isPsdFilename(name: string): boolean {
  const lower = name.toLowerCase()
  return lower.endsWith('.psd') || lower.endsWith('.psb')
}

// Returns null for anything unexpected — a truncated read, a file that isn't
// a PSD, a resource block that runs past what we fetched — so a missing
// preview is never worse than no preview.
export function extractPsdThumbnail(head: Buffer): PsdThumbnail | null {
  // Header: '8BPS', version, 6 reserved bytes, channels, height, width,
  // depth, colour mode — 26 bytes, then the colour mode data section.
  if (head.length < 30 || head.toString('ascii', 0, 4) !== '8BPS') return null

  let p = 26
  const colourModeLength = head.readUInt32BE(p)
  p += 4 + colourModeLength
  if (p + 4 > head.length) return null

  const resourcesLength = head.readUInt32BE(p)
  p += 4
  const resourcesEnd = Math.min(p + resourcesLength, head.length)

  // Each block: '8BIM', id, a Pascal-string name padded to an even length,
  // then the data length and the data itself, also padded to even.
  while (p + 12 <= resourcesEnd) {
    if (head.toString('ascii', p, p + 4) !== '8BIM') return null
    const id = head.readUInt16BE(p + 4)

    let q = p + 6
    const nameLength = head[q]
    q += 1 + nameLength
    if (q % 2) q += 1
    if (q + 4 > resourcesEnd) return null

    const dataLength = head.readUInt32BE(q)
    q += 4

    if (id === THUMBNAIL_RESOURCE_ID) {
      if (dataLength <= THUMBNAIL_HEADER_BYTES) return null
      if (q + dataLength > head.length) return null
      if (head.readUInt32BE(q) !== JPEG_FORMAT) return null

      const jpeg = head.subarray(q + THUMBNAIL_HEADER_BYTES, q + dataLength)
      // Guard against a resource that claims to be a JPEG but isn't.
      if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return null

      return {
        jpeg: Buffer.from(jpeg),
        width: head.readUInt32BE(q + 4),
        height: head.readUInt32BE(q + 8),
      }
    }

    p = q + dataLength + (dataLength % 2)
  }

  return null
}
