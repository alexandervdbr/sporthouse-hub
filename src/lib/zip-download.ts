import type JSZip from 'jszip'

// Een zip wordt hier in het geheugen van het tabblad opgebouwd: elk bestand
// wordt eerst volledig gedownload, dan ingepakt, en het resultaat staat er
// een tweede keer naast. Dat werkt tot een bepaald punt en daarna loopt de
// tab vast — op een telefoon eerder dan op een laptop.
//
// 500 MB is waar FileManager op uitkwam, en Pré-assist zipt dezelfde soort
// inhoud (foto's en video's) op dezelfde manier. Daarom staat het getal hier
// in plaats van twee keer los.
export const MAX_ZIP_BYTES = 500 * 1024 * 1024
export const MAX_ZIP_LABEL = '500 MB'

export async function saveZip(zip: JSZip, filename: string) {
  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}

// JSZip overschrijft zonder morren een bestand dat al op dat pad staat. Bij
// mappen is dat geen probleem — daar is het pad al uniek — maar een zip die
// zijn namen zelf samenstelt kan er twee keer op uitkomen: dezelfde persoon
// die twee keer "IMG_0042.jpg" instuurt voor dezelfde klant, en er komt er
// één uit de zip. Vandaar een teller achter de naam, vóór de extensie.
export function uniqueZipPath(taken: Set<string>, path: string): string {
  if (!taken.has(path)) {
    taken.add(path)
    return path
  }

  const dot = path.lastIndexOf('.')
  const slash = path.lastIndexOf('/')
  // Een punt in een mapnaam is geen extensie.
  const hasExt = dot > slash + 1
  const base = hasExt ? path.slice(0, dot) : path
  const ext  = hasExt ? path.slice(dot) : ''

  let n = 2
  while (taken.has(`${base} (${n})${ext}`)) n++
  const next = `${base} (${n})${ext}`
  taken.add(next)
  return next
}
