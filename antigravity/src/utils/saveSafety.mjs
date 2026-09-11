import { sameFileTarget } from './readerEditSession.mjs';

export function assessSaveEligibility({ activeFileHandle, baselineFileHandle, reviewGate }) {
  if (reviewGate) return { allowed: false, reason: 'review-required' };
  if (!baselineFileHandle) return { allowed: false, reason: 'missing-baseline-target' };
  if (!sameFileTarget(activeFileHandle, baselineFileHandle)) {
    return { allowed: false, reason: 'baseline-target-mismatch' };
  }
  return { allowed: true, reason: null };
}
