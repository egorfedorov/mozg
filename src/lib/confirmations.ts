/**
 * Has a transfer matured enough to be money?
 *
 * A transfer counts once `required` blocks (or slots) sit on top of the one
 * carrying it: `txHeight + required <= tipHeight`. The tip is whatever the
 * chain treats as settled ground — latest block for EVM and BTC, finalized
 * slot for Solana, solidified block for Tron. Anything short of that stays
 * pending and is re-checked on the watcher's next tick; it is never rejected
 * for being young.
 */
export function confirmedAt(txHeight: number, tipHeight: number, required: number): boolean {
  return Number.isFinite(txHeight) && Number.isFinite(tipHeight) && txHeight + required <= tipHeight;
}
