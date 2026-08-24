/**
 * Generic CSV download — takes a column spec ({ label, value: row => cellValue }) so
 * any table (Directory, project list, etc.) can build its own CSV without duplicating
 * the escaping/blob/download logic.
 */
export function downloadCsv(filename, columns, rows) {
  const escapeCsvCell = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`
  const lines = [
    columns.map((c) => c.label).join(','),
    ...rows.map((row) => columns.map((c) => escapeCsvCell(c.value(row))).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
