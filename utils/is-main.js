import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * 「当前模块是否作为入口被执行」的**健壮**判定。
 *
 * WHY 不用 `import.meta.url === pathToFileURL(process.argv[1]).href`：
 * 该写法在**符号链接路径**下恒为 false ——
 *   - macOS 上 `/tmp` → `/private/tmp`、`/var` → `/private/var`（`os.tmpdir()` 返回 `/var/...`，
 *     而 `import.meta.url` 已解析成 `/private/var/...`）；
 *   - 项目目录本身是软链时同理。
 * 后果不是报错而是**静默 no-op**：脚本 exit 0、什么都没做、无任何输出——极难排查
 * （本轮由 selfcheck 场景 33 的临时副本首次命中：副本落在 `/var/folders/...`，子进程 exit 0 空输出）。
 *
 * 故两侧都先 `realpathSync` 归一（同时兼容相对路径 argv[1]）。
 *
 * @param {string} metaUrl 调用方的 `import.meta.url`（必须由调用方传入：本模块自身的 metaUrl 是它自己）
 */
export function isMain(metaUrl) {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(metaUrl));
  } catch {
    return false;   // 路径不存在（深层异常）时按「非入口」处理，避免误执行
  }
}