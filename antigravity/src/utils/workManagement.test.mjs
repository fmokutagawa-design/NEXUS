import { strict as assert } from 'node:assert';
import { folderDisplayPriority, resolveMergedWorkId, workLocationPriority } from './workManagement.mjs';

assert(workLocationPriority('/project/manuscripts/current.nexus') < workLocationPriority('/project/other.nexus'));
assert(workLocationPriority('/project/other.nexus') < workLocationPriority('/project/archive/old.nexus'));
assert(folderDisplayPriority('manuscripts') < folderDisplayPriority('materials'));
assert(folderDisplayPriority('materials') < folderDisplayPriority('archive'));
assert.equal(resolveMergedWorkId('v1', { v1: { mergedInto: 'v2' }, v2: { mergedInto: 'v3' } }), 'v3');
assert.equal(resolveMergedWorkId('v1', { v1: { mergedInto: 'v2' }, v2: { mergedInto: 'v1' } }), 'v1');

console.log('workManagement tests passed');
