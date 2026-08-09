export function getStoredDateKey(deliveredAt: string): string {
  const m = deliveredAt.match(/^\d{4}-\d{2}-\d{2}/)
  if (m) return m[0]
  const d = new Date(deliveredAt)
  if (!Number.isFinite(d.getTime())) return ''
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function isStoredDateInMonth(deliveredAt: string, year: number, month: number): boolean {
  return getStoredDateKey(deliveredAt).slice(0, 7) === `${year}-${String(month + 1).padStart(2, '0')}`
}

export function formatStoredDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number)
  if (!y || !m || !d) return dateKey
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
