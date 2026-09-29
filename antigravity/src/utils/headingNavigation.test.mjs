import assert from 'node:assert/strict';
import { buildHeadingNavigation } from './headingNavigation.js';

const chapterOne = '■第一節\n本文\n［＃中見出し］第二節［＃中見出し終わり］';
const chapterTwo = '◇第三節\n続き';
const workText = `${chapterOne}\n${chapterTwo}`;
const offsetMap = [
  { file: '01.txt', displayName: '第一章', globalStart: 0, globalEnd: chapterOne.length, length: chapterOne.length },
  { file: '02.txt', displayName: '第二章', globalStart: chapterOne.length + 1, globalEnd: workText.length, length: chapterTwo.length },
];

assert.deepEqual(buildHeadingNavigation(workText, offsetMap), [
  { file: '01.txt', chapterName: '第一章', label: '第一節', heading: 'chapter', localOffset: 0 },
  { file: '01.txt', chapterName: '第一章', label: '第二節', heading: 'medium', localOffset: 8 },
  { file: '02.txt', chapterName: '第二章', label: '第三節', heading: 'chapter', localOffset: 0 },
]);

console.log('Heading navigation tests passed');
