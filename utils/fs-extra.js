/**
 * 文件系统增强工具 - 原子写入、临时目录、安全操作
 */

import { promises as fs } from 'fs';
import { resolve, dirname, basename, extname } from 'path';
import { randomBytes } from 'crypto';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { log } from './logger.js';
import { FSWriteError, FSReadError, FSPermissionError, FSDiskSpaceError, PrototypeError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

/**
 * 确保目录存在
 */
export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code === 'EACCES') {
      throw new FSPermissionError(dirPath, { originalError: error });
    }
    throw new FSWriteError(dirPath, error.message, { originalError: error });
  }
}

/**
 * 原子写入文件 - 先写临时文件再重命名
 */
export async function writeFileAtomic(filePath, content, options = {}) {
  const { encoding = 'utf-8', mode = 0o644, backup = false } = options;
  const dir = dirname(filePath);
  const base = basename(filePath);
  const tempName = `.${base}.tmp.${randomBytes(6).toString('hex')}`;
  const tempPath = resolve(dir, tempName);

  try {
    await ensureDir(dir);
    await fs.writeFile(tempPath, content, { encoding, mode });
    await fs.rename(tempPath, filePath);

    // 可选：创建备份
    if (backup && await exists(filePath)) {
      const backupPath = `${filePath}.bak.${Date.now()}`;
      await fs.copyFile(filePath, backupPath);
    }

    log.main.debug(`Written: ${filePath} (${Buffer.byteLength(content, encoding)} bytes)`);
    return true;
  } catch (error) {
    // 清理临时文件
    try { await fs.unlink(tempPath); } catch {}
    if (error.code === 'ENOSPC') {
      throw new FSDiskSpaceError(filePath, { originalError: error });
    }
    if (error.code === 'EACCES') {
      throw new FSPermissionError(filePath, { originalError: error });
    }
    throw new FSWriteError(filePath, error.message, { originalError: error });
  }
}

/**
 * 读取文件
 */
export async function readFileSafe(filePath, encoding = 'utf-8') {
  try {
    const content = await fs.readFile(filePath, encoding);
    log.main.debug(`Read: ${filePath} (${Buffer.byteLength(content, encoding)} bytes)`);
    return content;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new FSReadError(filePath, 'File not found', { originalError: error });
    }
    if (error.code === 'EACCES') {
      throw new FSPermissionError(filePath, { originalError: error });
    }
    throw new FSReadError(filePath, error.message, { originalError: error });
  }
}

/**
 * 检查文件/目录是否存在
 */
export async function exists(path) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取文件统计信息
 */
export async function statSafe(path) {
  try {
    return await fs.stat(path);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

/**
 * 复制文件或目录
 */
export async function copyRecursive(src, dest, options = {}) {
  const { overwrite = true, filter } = options;

  const stat = await statSafe(src);
  if (!stat) {
    throw new FSReadError(src, 'Source not found');
  }

  if (stat.isDirectory()) {
    await ensureDir(dest);
    const entries = await fs.readdir(src);
    for (const entry of entries) {
      if (filter && !filter(entry)) continue;
      await copyRecursive(resolve(src, entry), resolve(dest, entry), options);
    }
  } else {
    await ensureDir(dirname(dest));
    if (overwrite || !(await exists(dest))) {
      await fs.copyFile(src, dest);
    }
  }
}

/**
 * 删除文件或目录
 */
export async function removeRecursive(path) {
  const stat = await statSafe(path);
  if (!stat) return;

  if (stat.isDirectory()) {
    const entries = await fs.readdir(path);
    for (const entry of entries) {
      await removeRecursive(resolve(path, entry));
    }
    await fs.rmdir(path);
  } else {
    await fs.unlink(path);
  }
}

/**
 * 创建临时目录
 */
export async function createTempDir(prefix = 'prototype-') {
  const tempDir = resolve(tmpdir(), `${prefix}${randomBytes(8).toString('hex')}`);
  await ensureDir(tempDir);
  return tempDir;
}

/**
 * 清理临时目录
 */
export async function cleanupTempDir(tempDir) {
  try {
    await removeRecursive(tempDir);
  } catch (error) {
    log.main.warn(`Failed to cleanup temp dir ${tempDir}:`, error.message);
  }
}

/**
 * 列出目录文件
 */
export async function listFiles(dir, options = {}) {
  const { recursive = true, filter, extensions } = options;
  const results = [];

  async function scan(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (recursive) {
          await scan(fullPath);
        }
      } else {
        if (extensions && !extensions.includes(extname(entry.name).toLowerCase())) {
          continue;
        }
        if (filter && !filter(entry.name, fullPath)) {
          continue;
        }
        results.push(fullPath);
      }
    }
  }

  await scan(dir);
  return results;
}

/**
 * 获取目录大小
 */
export async function getDirSize(dir) {
  let size = 0;
  const files = await listFiles(dir);
  for (const file of files) {
    const stat = await statSafe(file);
    if (stat) size += stat.size;
  }
  return size;
}

/**
 * 检查磁盘空间
 */
export async function checkDiskSpace(path, requiredBytes = 100 * 1024 * 1024) {
  try {
    // 使用 df 命令检查可用空间
    const { execFile } = await import('child_process');
    const { promisify } = await import('util');
    const execFileAsync = promisify(execFile);

    const { stdout } = await execFileAsync('df', ['-k', path]);
    const lines = stdout.trim().split('\n');
    if (lines.length >= 2) {
      const parts = lines[1].split(/\s+/);
      const availableKB = parseInt(parts[3], 10);
      const availableBytes = availableKB * 1024;
      return {
        available: availableBytes,
        required: requiredBytes,
        sufficient: availableBytes >= requiredBytes,
      };
    }
  } catch {
    // 忽略错误，假设空间足够
  }
  return { available: Infinity, required: requiredBytes, sufficient: true };
}

/**
 * 格式化字节大小
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * 读取 JSON 文件
 */
export async function readJSON(filePath) {
  const content = await readFileSafe(filePath);
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new FSReadError(filePath, `Invalid JSON: ${error.message}`, { originalError: error });
  }
}

/**
 * 写入 JSON 文件
 */
export async function writeJSON(filePath, data, options = {}) {
  const { spaces = 2, ...writeOptions } = options;
  const content = JSON.stringify(data, null, spaces);
  return writeFileAtomic(filePath, content, writeOptions);
}

/**
 * 追加内容到文件
 */
export async function appendFile(filePath, content, encoding = 'utf-8') {
  try {
    await ensureDir(dirname(filePath));
    await fs.appendFile(filePath, content, encoding);
  } catch (error) {
    if (error.code === 'ENOSPC') {
      throw new FSDiskSpaceError(filePath, { originalError: error });
    }
    if (error.code === 'EACCES') {
      throw new FSPermissionError(filePath, { originalError: error });
    }
    throw new FSWriteError(filePath, error.message, { originalError: error });
  }
}

/**
 * 读取目录结构树
 */
export async function readDirTree(dir, options = {}) {
  const { maxDepth = Infinity, filter } = options;
  const tree = { name: basename(dir), path: dir, type: 'directory', children: [] };

  async function scan(currentDir, currentTree, depth) {
    if (depth > maxDepth) return;
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (filter && !filter(entry.name)) continue;
      const fullPath = resolve(currentDir, entry.name);
      if (entry.isDirectory()) {
        const childTree = { name: entry.name, path: fullPath, type: 'directory', children: [] };
        currentTree.children.push(childTree);
        await scan(fullPath, childTree, depth + 1);
      } else {
        const stat = await statSafe(fullPath);
        currentTree.children.push({
          name: entry.name,
          path: fullPath,
          type: 'file',
          size: stat?.size || 0,
          ext: extname(entry.name),
        });
      }
    }
  }

  await scan(dir, tree, 0);
  return tree;
}