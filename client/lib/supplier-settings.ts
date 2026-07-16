// Supplier-specific UI preferences stored locally on the device.
// These are per-browser preferences (not synced to server) and control
// how the supplier delivery entry UI behaves.

const EVALUATE_BY_AMOUNT_KEY = 'dairy-vyapar-supplier-evaluate-by-amount'

export function getEvaluateByAmount(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(EVALUATE_BY_AMOUNT_KEY) === 'true'
  } catch {
    return false
  }
}

export function setEvaluateByAmount(value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(EVALUATE_BY_AMOUNT_KEY, value ? 'true' : 'false')
  } catch {
    // ignore storage failures
  }
}
