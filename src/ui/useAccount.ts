import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Account, grantLegacyUnlocks, newAccount, validateAccount } from '../game/arsenal.ts';
import type { Progress } from '../game/heroes.ts';

/**
 * Account persistence (brief 05). One localStorage envelope, a backup of the last valid state, write-then-readback
 * verification, and a browser lock so only one tab spends. The rules live in arsenal.ts; this file only moves bytes.
 */
export const ACCOUNT_KEY = 'orbwalk-rogue-account';
export const ACCOUNT_BACKUP_KEY = 'orbwalk-rogue-account.backup';
export const ACCOUNT_CORRUPT_KEY = 'orbwalk-rogue-account.corrupt';
const LOCK_NAME = 'orbwalk-rogue-account';

export type LockState = 'held' | 'readonly' | 'unsupported' | 'pending';

export type AccountStore = {
  account: Account;
  /** Another tab holds the account, or this browser cannot lock: reading is fine, spending is blocked. */
  readOnly: boolean;
  lockState: LockState;
  /** Storage could not be verified; spending stays blocked until a retry reconciles it. */
  fault: string | null;
  /** Non-fatal findings from loading (retired items, clamped numbers). */
  issues: string[];
  /** Commit a new envelope. Returns false (and leaves memory unchanged) when the write cannot be verified. */
  commit: (next: Account) => boolean;
  /** Convenience: commit(fn(account)). */
  update: (fn: (a: Account) => Account) => boolean;
  exportJson: () => string;
  /** Import an exported envelope. Returns an error message or null. */
  importJson: (text: string) => string | null;
  retry: () => void;
  canSpend: boolean;
};

function readRaw(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Load the envelope, falling back to the backup; a malformed primary is kept aside, never overwritten silently. */
function load(progress: Progress): { account: Account; issues: string[]; fault: string | null } {
  const raw = readRaw(ACCOUNT_KEY);
  if (raw === null) {
    // First visit: write the fresh envelope once so the saveId is stable across reloads before any purchase.
    const fresh = grantLegacyUnlocks(newAccount(), progress);
    try { localStorage.setItem(ACCOUNT_KEY, JSON.stringify(fresh)); } catch { /* storage unavailable: memory only */ }
    return { account: fresh, issues: [], fault: null };
  }
  let parsed: unknown = null;
  try { parsed = JSON.parse(raw); } catch { parsed = null; }
  const v = validateAccount(parsed);
  if (v.ok && v.account) return { account: grantLegacyUnlocks(v.account, progress), issues: v.issues, fault: null };
  // Primary is unusable. Keep it for export, try the backup.
  try { localStorage.setItem(ACCOUNT_CORRUPT_KEY, raw); } catch { /* storage unavailable */ }
  const backupRaw = readRaw(ACCOUNT_BACKUP_KEY);
  if (backupRaw) {
    try {
      const b = validateAccount(JSON.parse(backupRaw));
      if (b.ok && b.account) return { account: grantLegacyUnlocks(b.account, progress), issues: [...b.issues, 'restored from backup'], fault: `Primary account save was unreadable (${v.issues.join('; ')}); restored the last valid backup.` };
    } catch { /* fall through */ }
  }
  return { account: newAccount(), issues: v.issues, fault: `Account save unreadable (${v.issues.join('; ')}) and no valid backup. Spending is blocked; export the raw save from the Armoury or import a backup.` };
}

/**
 * The page-level writer lock. Acquired once per page (not per component mount, so StrictMode's double effects and
 * remounts cannot race themselves) and held until the page unloads. A tab that finds it taken is read-only; `retryLock`
 * lets it try again after the other tab closes.
 */
let lockAttempt: Promise<LockState> | null = null;
function acquireLock(): Promise<LockState> {
  if (lockAttempt) return lockAttempt;
  lockAttempt = new Promise<LockState>(resolve => {
    const locks = (navigator as Navigator & { locks?: LockManager }).locks;
    if (!locks?.request) { resolve('unsupported'); return; }
    locks.request(LOCK_NAME, { ifAvailable: true }, lock => {
      if (!lock) { resolve('readonly'); return Promise.resolve(); }
      resolve('held');
      return new Promise<void>(() => { /* held for the life of the page */ });
    }).catch(() => resolve('unsupported'));
  });
  return lockAttempt;
}
function retryLock(): Promise<LockState> {
  lockAttempt = null;
  return acquireLock();
}

export function useAccount(progress: Progress): AccountStore {
  const [state, setState] = useState(() => load(progress));
  const [lockState, setLockState] = useState<LockState>('pending');
  const lastGood = useRef<string | null>(readRaw(ACCOUNT_KEY));

  // One writer per browser. The lock is held for the life of the page; a second tab sees it taken and goes read-only.
  useEffect(() => {
    let alive = true;
    void acquireLock().then(s => { if (alive) setLockState(s); });
    // Read-only tabs follow the writer's saves.
    const onStorage = (e: StorageEvent) => { if (e.key === ACCOUNT_KEY) setState(load(progress)); };
    window.addEventListener('storage', onStorage);
    return () => { alive = false; window.removeEventListener('storage', onStorage); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Legacy unlocks can arrive after progress loads.
  useEffect(() => {
    setState(s => {
      const granted = grantLegacyUnlocks(s.account, progress);
      if (granted === s.account) return s;
      persist(granted, lastGood);
      return { ...s, account: granted };
    });
  }, [progress]);

  const readOnly = lockState !== 'held';

  const commit = useCallback((next: Account): boolean => {
    if (readOnly) { setState(s => ({ ...s, fault: 'Another tab holds the account. Close it or reload here to spend.' })); return false; }
    const result = persist(next, lastGood);
    if (result !== null) { setState(s => ({ ...s, fault: result })); return false; }
    setState(s => ({ ...s, account: next, fault: null }));
    return true;
  }, [readOnly]);

  const update = useCallback((fn: (a: Account) => Account) => commit(fn(state.account)), [commit, state.account]);

  const exportJson = useCallback(() => {
    const corrupt = readRaw(ACCOUNT_CORRUPT_KEY);
    return JSON.stringify({ account: state.account, corruptPrimary: corrupt ? corrupt : undefined }, null, 2);
  }, [state.account]);

  const importJson = useCallback((text: string): string | null => {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return 'Not valid JSON.'; }
    const env = parsed && typeof parsed === 'object' && 'account' in (parsed as Record<string, unknown>) ? (parsed as { account: unknown }).account : parsed;
    const v = validateAccount(env);
    if (!v.ok || !v.account) return `Rejected: ${v.issues.join('; ')}`;
    if (readOnly) return 'Another tab holds the account.';
    const err = persist(v.account, lastGood);
    if (err) return err;
    setState({ account: v.account, issues: v.issues, fault: null });
    return null;
  }, [readOnly]);

  const retry = useCallback(() => {
    // Re-read storage and reconcile: whatever is verifiably there wins over memory. A read-only tab also retries the lock.
    const fresh = load(progress);
    lastGood.current = readRaw(ACCOUNT_KEY);
    setState(fresh);
    if (lockState !== 'held') void retryLock().then(setLockState);
  }, [progress, lockState]);

  return useMemo(() => ({
    account: state.account, readOnly, lockState, fault: state.fault, issues: state.issues, commit, update, exportJson, importJson, retry,
    canSpend: !readOnly && state.fault === null,
  }), [state, readOnly, lockState, commit, update, exportJson, importJson, retry]);
}

/**
 * Write the envelope, then read it back and check the revision and saveId. Returns an error string on any doubt so
 * the caller keeps its old in-memory state and blocks further spending. The previous verified JSON becomes the backup.
 */
function persist(next: Account, lastGood: { current: string | null }): string | null {
  const json = JSON.stringify(next);
  try {
    localStorage.setItem(ACCOUNT_KEY, json);
  } catch (e) {
    return `Could not write the account save (${(e as Error).message}). Nothing was spent.`;
  }
  const back = readRaw(ACCOUNT_KEY);
  if (back === null) return 'Storage write could not be read back. Spending is blocked until it can be verified.';
  try {
    const parsed = JSON.parse(back) as { revision?: number; saveId?: string };
    if (parsed.revision !== next.revision || parsed.saveId !== next.saveId) return 'Storage readback did not match the committed account. Spending is blocked until it reconciles.';
  } catch {
    return 'Storage readback was not valid JSON. Spending is blocked until it reconciles.';
  }
  if (lastGood.current && lastGood.current !== json) {
    try { localStorage.setItem(ACCOUNT_BACKUP_KEY, lastGood.current); } catch { /* backup is best effort */ }
  }
  lastGood.current = json;
  return null;
}
