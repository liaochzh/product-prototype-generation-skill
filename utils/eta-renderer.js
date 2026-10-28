/**
 * Eta 模板渲染器 - 语法校验、缓存、批量渲染
 */

import { Eta } from 'eta';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSafe, exists } from './fs-extra.js';
import { log } from './logger.js';
import { TemplateNotFoundError, TemplateRenderError } from './errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

// 创建 Eta 实例
const eta = new Eta({
  views: __dirname, // 默认视图目录
  cache: true,      // 生产环境开启缓存
  autoEscape: true, // 默认自动转义
  async: true,      // 支持异步模板
  rmWhitespace: false,
  varName: 'it',    // 模板变量名
});

// 模板缓存
const templateCache = new Map();
const validationCache = new Map();

/**
 * 配置视图目录
 */
export function configureViews(viewsPath) {
  eta.configure({ views: viewsPath });
}

/**
 * 读取并缓存模板
 */
async function loadTemplate(templatePath) {
  if (templateCache.has(templatePath)) {
    return templateCache.get(templatePath);
  }

  const fullPath = resolve(templatePath);
  if (!(await exists(fullPath))) {
    throw new TemplateNotFoundError(fullPath);
  }

  const content = await readFileSafe(fullPath);
  templateCache.set(templatePath, content);
  return content;
}

/**
 * 渲染单个模板
 */
export async function render(templatePath, context = {}) {
  try {
    const template = await loadTemplate(templatePath);
    const result = await eta.renderStringAsync(template, context, { filename: templatePath });
    log.render.debug(`Rendered: ${templatePath}`);
    return result;
  } catch (error) {
    if (error instanceof TemplateNotFoundError) throw error;
    throw new TemplateRenderError(templatePath, error.message, { originalError: error });
  }
}

/**
 * 批量渲染模板
 */
export async function renderAll(templates) {
  const results = new Map();

  // 并行渲染，单个失败不阻断其他
  const promises = templates.map(async ({ path, context, outputPath }) => {
    try {
      const content = await render(path, context);
      results.set(outputPath || path, { content, success: true });
    } catch (error) {
      log.render.error(`Failed to render ${path}:`, error.message);
      results.set(outputPath || path, { error, success: false });
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * 校验模板语法
 */
export async function validate(templatePath) {
  if (validationCache.has(templatePath)) {
    return validationCache.get(templatePath);
  }

  try {
    const template = await loadTemplate(templatePath);
    // 尝试编译模板
    eta.compile(template, { filename: templatePath });
    const result = { valid: true, errors: [], warnings: [] };
    validationCache.set(templatePath, result);
    return result;
  } catch (error) {
    const result = {
      valid: false,
      errors: [error.message],
      warnings: [],
    };
    validationCache.set(templatePath, result);
    return result;
  }
}

/**
 * 批量校验模板
 */
export async function validateAll(templatePaths) {
  const results = new Map();
  await Promise.all(
    templatePaths.map(async (path) => {
      const result = await validate(path);
      results.set(path, result);
    })
  );
  return results;
}

/**
 * 渲染布局 + 页面内容
 */
export async function renderWithLayout(layoutPath, pagePath, context = {}) {
  // 先渲染页面内容
  const pageContent = await render(pagePath, context);
  // 再渲染布局，注入页面内容
  return render(layoutPath, { ...context, pageContent });
}

/**
 * 预编译所有模板（构建时优化）
 */
export async function precompileAll(templateDir) {
  const { listFiles } = await import('./fs-extra.js');
  const files = await listFiles(templateDir, { extensions: ['.eta'] });

  log.template.info(`Precompiling ${files.length} templates...`);
  const results = await validateAll(files);

  let validCount = 0;
  let invalidCount = 0;
  for (const [path, result] of results) {
    if (result.valid) {
      validCount++;
    } else {
      invalidCount++;
      log.template.error(`Invalid template: ${path}`, result.errors);
    }
  }

  log.template.info(`Precompile complete: ${validCount} valid, ${invalidCount} invalid`);
  return results;
}

/**
 * 清除缓存
 */
export function clearCache() {
  templateCache.clear();
  validationCache.clear();
  eta.configure({ cache: false });
  // 重新开启缓存
  setTimeout(() => eta.configure({ cache: true }), 0);
}

/**
 * 获取模板依赖（include/extend 的文件）
 */
export async function getTemplateDependencies(templatePath) {
  const content = await loadTemplate(templatePath);
  const dependencies = [];

  // 简单的正则匹配 include/extend
  const includeRegex = /<%\s*include\s*\(\s*['"]([^'"]+)['"]/g;
  const extendRegex = /<%\s*extend\s*\(\s*['"]([^'"]+)['"]/g;

  let match;
  while ((match = includeRegex.exec(content)) !== null) {
    dependencies.push(resolve(dirname(templatePath), match[1]));
  }
  while ((match = extendRegex.exec(content)) !== null) {
    dependencies.push(resolve(dirname(templatePath), match[1]));
  }

  return [...new Set(dependencies)];
}

/**
 * 监听模板变更（开发模式）
 */
export function watchTemplates(templateDir, onChange) {
  import('chokidar').then(({ default: chokidar }) => {
    const watcher = chokidar.watch(resolve(templateDir, '**/*.eta'), {
      ignoreInitial: true,
      persistent: true,
    });

    watcher.on('change', (path) => {
      clearCache();
      log.template.info(`Template changed: ${path}`);
      onChange(path);
    });

    watcher.on('add', (path) => {
      clearCache();
      log.template.info(`Template added: ${path}`);
      onChange(path);
    });

    watcher.on('unlink', (path) => {
      clearCache();
      log.template.info(`Template removed: ${path}`);
      onChange(path);
    });

    return watcher;
  });
}

/**
 * 注册自定义过滤器（eta v3 无 filters API，改为模板内联函数 via context）
 */
const customFilters = {
  json: (obj) => JSON.stringify(obj, null, 2),
  toLower: (str) => String(str).toLowerCase(),
  toUpper: (str) => String(str).toUpperCase(),
  truncate: (str, len = 100) => (String(str).length > len ? String(str).slice(0, len) + '...' : String(str)),
  currency: (num) => `¥${Number(num).toFixed(2)}`,
};
export function registerFilter(name, fn) { customFilters[name] = fn; }
export function registerGlobal(name, value) { /* 预留：通过 context 传递 */ }
export function getFilters() { return customFilters; }

export default {
  render,
  renderAll,
  renderWithLayout,
  validate,
  validateAll,
  precompileAll,
  clearCache,
  getTemplateDependencies,
  watchTemplates,
  registerFilter,
  registerGlobal,
  configureViews,
};