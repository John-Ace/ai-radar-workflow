import fs from 'node:fs';
import path from 'node:path';

export function markdownArchivePath(root, dirName, date, suffix) {
  const archiveDir = path.isAbsolute(dirName) ? dirName : path.join(root, dirName);
  return path.join(archiveDir, `${date}-${suffix}.md`);
}

export function writeMarkdownArchive(root, dirName, date, suffix, markdown) {
  const outPath = markdownArchivePath(root, dirName, date, suffix);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');
  return outPath;
}
