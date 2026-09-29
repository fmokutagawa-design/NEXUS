const normalizePath = value => String(value || '').normalize('NFC').replace(/\\/g, '/').replace(/\/+$/, '');

export function selectSegmentFile(files, fileName, nexusPath = '') {
  const target = normalizePath(fileName);
  const folder = normalizePath(nexusPath);
  return files?.find(file => {
    const rawPath = typeof file.handle === 'string'
      ? file.handle
      : typeof file.handle?.handle === 'string'
        ? file.handle.handle
        : file.path;
    const path = normalizePath(rawPath);
    if (normalizePath(file.name) !== target && !path.endsWith(`/${target}`)) return false;
    if (!folder) return true;

    const belongsToFolder = relative => path === relative
      || (!folder.startsWith('/') && path.endsWith(`/${relative}`));
    return belongsToFolder(`${folder}/${target}`)
      || belongsToFolder(`${folder}/segments/${target}`);
  });
}

export function selectJumpFile(files, fileName, requestedPath = '') {
  const targetPath = normalizePath(requestedPath);
  if (targetPath) {
    return files?.find(file => [file.path, file.handle?.handle, file.handle]
      .filter(value => typeof value === 'string')
      .some(value => {
        const candidate = normalizePath(value);
        return candidate === targetPath
          || (!targetPath.startsWith('/') && candidate.endsWith(`/${targetPath}`));
      }));
  }
  const targetName = normalizePath(fileName);
  return files?.find(file => normalizePath(file.name) === targetName
    || normalizePath(file.name) === `${targetName}.txt`);
}
