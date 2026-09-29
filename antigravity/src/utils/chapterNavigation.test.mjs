import assert from 'node:assert/strict';
import { getChapterNavigation } from './chapterNavigation.js';

const chapters = [
  { id: 'intro', file: '00_intro.txt', displayName: '序章' },
  { id: 'one', file: '01_one.txt', displayName: '第一章' },
  { id: 'two', file: '02_two.txt', displayName: '第二章' },
];

assert.deepEqual(getChapterNavigation(chapters, '/work/book.nexus/segments/01_one.txt'), {
  currentIndex: 1,
  current: chapters[1],
  previous: chapters[0],
  next: chapters[2],
});

assert.deepEqual(getChapterNavigation(chapters, { handle: 'C:\\work\\book.nexus\\segments\\00_intro.txt' }), {
  currentIndex: 0,
  current: chapters[0],
  previous: null,
  next: chapters[1],
});

assert.deepEqual(getChapterNavigation(chapters, '/work/other.txt'), {
  currentIndex: -1,
  current: null,
  previous: null,
  next: null,
});

console.log('Chapter navigation tests passed');
