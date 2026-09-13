import assert from 'node:assert/strict';
import {
  cleanVerticalContentWidth,
  measureDetachedCleanVerticalWidth,
  measuredCleanVerticalWidth,
  restoredVerticalScrollLeft,
} from './cleanEditorGeometry.mjs';

const shortText = '窓の外で雪が強くなった。\n　栢原は色の違う四群を見た。\n「急ぐぞ。ただし、まだ結ぶな」';

// クリーン表示は原稿用紙の cell/charSpacing を使わず、実際のフォント寸法で
// 必要な段数だけ確保する。短文に固定 5000px の空白を付けない。
assert.equal(cleanVerticalContentWidth(shortText, {
  fontSize: 31,
  contentHeight: 820,
  horizontalPadding: 64,
}), 176);

// 明示改行だけでなく、表示高を超えた折り返しも縦の一段として数える。
assert.equal(cleanVerticalContentWidth('あ'.repeat(53), {
  fontSize: 20,
  contentHeight: 200,
  horizontalPadding: 64,
}), 208);

// 概算よりブラウザの実測 scrollWidth が大きい場合は、本文を切らさない実測値を採用する。
assert.equal(measuredCleanVerticalWidth({ scrollWidth: 12480, clientWidth: 1600 }), 12480);
assert.equal(measuredCleanVerticalWidth({ scrollWidth: 900, clientWidth: 1600 }), 1600);

// 幅計測のため一時的に textarea を縮めても、編集中の横位置は維持する。
assert.equal(restoredVerticalScrollLeft({
  previousScrollLeft: -6400,
  scrollWidth: 12480,
  clientWidth: 1600,
}), -6400);

// 文字削除で本文幅が縮んだ場合だけ、新しい左端までクランプする。
assert.equal(restoredVerticalScrollLeft({
  previousScrollLeft: -12000,
  scrollWidth: 9000,
  clientWidth: 1600,
}), -7400);

// 実測のために編集中の textarea を縮めると、Chromium が横スクロールを
// 文頭へクランプする。複製した非表示要素だけを変更して計測する。
const source = {
  value: '編集中の本文',
  style: { width: '12480px', position: 'relative' },
  clientHeight: 820,
  cloneNode() {
    return {
      value: '',
      style: {},
      scrollWidth: 12640,
      setAttribute() {},
      remove() { this.removed = true; },
    };
  },
};
let appendedProbe = null;
const measured = measureDetachedCleanVerticalWidth({
  textarea: source,
  containerClientWidth: 1600,
  viewportWidth: 2048,
  appendTarget: {
    appendChild(probe) { appendedProbe = probe; },
  },
});
assert.equal(measured, 12640);
assert.deepEqual(source.style, { width: '12480px', position: 'relative' });
assert.equal(source.value, '編集中の本文');
assert.equal(appendedProbe.value, '編集中の本文');
assert.equal(appendedProbe.style.width, '1600px');
assert.equal(appendedProbe.removed, true);

console.log('cleanEditorGeometry: 13 passed');
