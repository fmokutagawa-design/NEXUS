import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const defaultLockPath = fileURLToPath(
  new URL('../native/tomarigi-native-lock.json', import.meta.url),
);

function loadDefaultLock() {
  return JSON.parse(readFileSync(defaultLockPath, 'utf8'));
}

function isValidLock(lock) {
  if (
    !lock
    || typeof lock !== 'object'
    || Array.isArray(lock)
    || lock.schemaVersion !== 1
    || !lock.archives
    || typeof lock.archives !== 'object'
    || Array.isArray(lock.archives)
    || Object.keys(lock.archives).length === 0
  ) {
    return false;
  }

  return Object.entries(lock.archives).every(([name, sha256]) => (
    name.length > 0
    && path.posix.basename(name) === name
    && path.win32.basename(name) === name
    && typeof sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(sha256)
  ));
}

export function verifyArchives(directory, suppliedLock) {
  const files = [];
  const errors = [];

  if (!directory) {
    return { ok: false, files, errors: ['Source directory is required.'] };
  }

  let lock = suppliedLock;
  if (arguments.length < 2) {
    try {
      lock = loadDefaultLock();
    } catch (error) {
      return {
        ok: false,
        files,
        errors: [`Unable to load Tomarigi native source lock (${error.message})`],
      };
    }
  }

  if (!isValidLock(lock)) {
    return { ok: false, files, errors: ['Invalid Tomarigi native source lock.'] };
  }

  for (const [name, expectedSha256] of Object.entries(lock.archives)) {
    const archivePath = path.join(directory, name);
    let contents;
    try {
      if (!statSync(archivePath).isFile()) {
        throw new Error('not a regular file');
      }
      const sourcePath = realpathSync(directory);
      const resolvedArchivePath = realpathSync(archivePath);
      const relativeArchivePath = path.relative(sourcePath, resolvedArchivePath);
      if (relativeArchivePath.startsWith(`..${path.sep}`) || path.isAbsolute(relativeArchivePath)) {
        throw new Error('archive resolves outside source directory');
      }
      contents = readFileSync(archivePath);
    } catch (error) {
      files.push({ name, path: archivePath, verified: false });
      errors.push(`${name}: missing or unreadable archive (${error.message})`);
      continue;
    }

    const actualSha256 = createHash('sha256').update(contents).digest('hex');
    const verified = actualSha256 === expectedSha256;
    files.push({ name, path: archivePath, sha256: actualSha256, verified });
    if (!verified) {
      errors.push(
        `${name}: SHA-256 mismatch (expected ${expectedSha256}, got ${actualSha256})`,
      );
    }
  }

  return { ok: errors.length === 0, files, errors };
}

function runCli() {
  const directory = process.argv[2];
  const result = verifyArchives(directory);

  for (const file of result.files) {
    if (file.verified) console.log(`verified ${file.name} SHA-256 ${file.sha256}`);
  }
  if (!result.ok) {
    for (const error of result.errors) console.error(`error: ${error}`);
    process.exitCode = 1;
  }
}

function invokedFileUrl(argvPath) {
  if (!argvPath) return '';
  try {
    return pathToFileURL(realpathSync(path.resolve(argvPath))).href;
  } catch {
    return pathToFileURL(path.resolve(argvPath)).href;
  }
}

const invokedPath = invokedFileUrl(process.argv[1]);
if (import.meta.url === invokedPath) runCli();
