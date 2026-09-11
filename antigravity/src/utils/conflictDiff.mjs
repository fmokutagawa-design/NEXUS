import { diffLines } from 'diff';

export function buildConflictDiff(nexusText, externalText) {
  return diffLines(nexusText || '', externalText || '', { newlineIsToken: true })
    .filter(part => part.value)
    .map(part => ({
      type: part.added ? 'external' : part.removed ? 'nexus' : 'unchanged',
      text: part.value,
    }));
}
