import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { createLinter, loadTextlintrc } from 'textlint';
import { TextlintLintableRuleDescriptor } from '@textlint/kernel';
import { mergeProofreadingResults } from '../src/utils/proofreadingHub.mjs';

const require = createRequire(import.meta.url);
const root = path.resolve('..');
const corpus = JSON.parse(fs.readFileSync('tests/proofreading_corpus.json', 'utf8'));
const descriptor = await loadTextlintrc({ configFilePath: path.resolve('.textlintrc.js') });
descriptor.rule.ruleDescriptorList.push(new TextlintLintableRuleDescriptor({
    ruleId: 'nexus-integrated-rules',
    rule: require('../textlint/rules/nexus-integrated-rules.js'),
    options: true
}));
const linter = createLinter({ descriptor });

const profileAllows = (message, profile, text) => {
    const techniques = profile.techniques || {};
    if (techniques.allow_nominal_endings && message.message.includes('体言止め')) return false;
    if (techniques.allow_repetition && (message.message.includes('同じ語') || message.ruleId.includes('doubled'))) return false;
    const target = message.message.match(/【対象:([^】]+)】/)?.[1] || text.slice(message.index || 0, (message.index || 0) + 1);
    return !(profile.whitelist || []).some(word => target.includes(word));
};

let tp = 0, fp = 0, fn = 0;
for (const testCase of corpus) {
    const profile = testCase.profile || {};
    const lint = await linter.lintText(testCase.text, 'document.txt');
    const textlintResults = lint.messages.filter(message => profileAllows(message, profile, testCase.text));
    const python = spawnSync('python3', [path.join(root, 'nexus_backend', 'proofreading_cli.py')], {
        input: JSON.stringify({ text: testCase.text, profile }), encoding: 'utf8'
    });
    if (python.status !== 0) throw new Error(python.stderr);
    const issues = mergeProofreadingResults(testCase.text, textlintResults, JSON.parse(python.stdout));
    const used = new Set();
    for (const expected of testCase.expected) {
        const index = issues.findIndex((issue, issueIndex) => !used.has(issueIndex)
            && issue.original.includes(expected.contains)
            && (!expected.suggested || issue.suggested === expected.suggested)
            && (!expected.engine || issue.engines.includes(expected.engine)));
        if (index >= 0) { tp += 1; used.add(index); } else fn += 1;
    }
    fp += issues.filter((_, index) => !used.has(index)).length;
    console.log(`${testCase.name}: ${issues.length} findings`, issues.map(issue => ({
        original: issue.original, suggested: issue.suggested, engines: issue.engines
    })));
}
const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;
console.log(JSON.stringify({ true_positive: tp, false_positive: fp, false_negative: fn, precision, recall }, null, 2));
if (precision < 0.8 || recall < 0.8) process.exitCode = 1;
