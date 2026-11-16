// Een status exact maar hoofdletterongevoelig terugvinden in planning_entries.
//
// De dag-editor slaat de status in hoofdletters op ("VERLOF"), de preset heet
// "Verlof". Dus ilike, maar zonder dat de naam zelf een patroon wordt: een %
// of _ in een presetnaam zou anders ook andere statussen raken.
//
// Binnen een .or()-filter gaat de waarde tussen dubbele aanhalingstekens, en
// daar is \ zelf ook een escape. Een LIKE-escape (\%) moet er dus verdubbeld
// in (\\%). Gemeten tegen de echte API: "S\%" vond nog SHG en Sport Vl,
// "S\\%" niets. Komma's en haakjes zijn tussen aanhalingstekens veilig.

export function likeEscape(value: string): string {
  return value.replace(/[\\%_]/g, c => '\\' + c)
}

function orQuoted(value: string): string {
  return `"${value.replace(/["\\]/g, c => '\\' + c)}"`
}

// Eén voorwaarde voor .or(): `kolom.ilike."waarde"`.
export function orIlikeExact(column: string, value: string): string {
  return `${column}.ilike.${orQuoted(likeEscape(value))}`
}

// Een status en zijn THUIS-variant, als .or()-filter op één kolom.
export function statusFilter(column: string, names: string[]): string {
  return names.map(n => orIlikeExact(column, n)).join(',')
}
