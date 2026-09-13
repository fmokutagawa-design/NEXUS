function codePointLength(text) {
  let length = 0;
  for (const _char of text) length++;
  return length;
}

export function cleanVerticalContentWidth(text, {
  fontSize,
  contentHeight,
  horizontalPadding,
}) {
  const safeFontSize = Math.max(1, Number(fontSize) || 16);
  const usableHeight = Math.max(safeFontSize, Number(contentHeight) || safeFontSize);
  const charsPerColumn = Math.max(1, Math.floor(usableHeight / safeFontSize));
  const logicalLines = String(text ?? '').split('\n');
  const columns = logicalLines.reduce((sum, line) => (
    sum + Math.max(1, Math.ceil(codePointLength(line) / charsPerColumn))
  ), 0);
  const normalLineAdvance = safeFontSize * 1.2;
  return Math.ceil(columns * normalLineAdvance + Math.max(0, Number(horizontalPadding) || 0));
}

export function measuredCleanVerticalWidth({ scrollWidth, clientWidth }) {
  return Math.ceil(Math.max(
    0,
    Number(scrollWidth) || 0,
    Number(clientWidth) || 0,
  ));
}

export function measureDetachedCleanVerticalWidth({
  textarea,
  containerClientWidth,
  viewportWidth,
  appendTarget,
}) {
  if (!textarea || !appendTarget) return 0;

  const probe = textarea.cloneNode(false);
  const measurementWidth = Math.max(
    1,
    Number(containerClientWidth) || Number(viewportWidth) || 1,
  );
  probe.value = textarea.value;
  probe.setAttribute('aria-hidden', 'true');
  probe.setAttribute('tabindex', '-1');
  Object.assign(probe.style, {
    position: 'fixed',
    visibility: 'hidden',
    pointerEvents: 'none',
    left: '-100000px',
    top: '0',
    width: `${measurementWidth}px`,
    height: `${Math.max(1, Number(textarea.clientHeight) || 1)}px`,
    maxWidth: 'none',
  });

  appendTarget.appendChild(probe);
  try {
    return measuredCleanVerticalWidth({
      scrollWidth: probe.scrollWidth,
      clientWidth: containerClientWidth,
    });
  } finally {
    probe.remove();
  }
}

export function restoredVerticalScrollLeft({ previousScrollLeft, scrollWidth, clientWidth }) {
  const previous = Number(previousScrollLeft) || 0;
  const maxDistance = Math.max(
    0,
    (Number(scrollWidth) || 0) - (Number(clientWidth) || 0),
  );
  return Math.max(-maxDistance, Math.min(0, previous));
}
