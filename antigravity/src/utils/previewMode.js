export function resolvePreviewMode(settings = {}) {
  return settings.paperStyle === 'grid' || settings.paperStyle === 'manuscript'
    ? 'manuscript'
    : 'plain';
}
