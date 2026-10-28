/**
 * Unsplash 图片服务 - 关键词映射、URL 生成、降级处理
 */

import { unsplashFallback } from '../constants.js';
import { resolvePrimaryHsl } from './color-scheme.js';
import { log } from './logger.js';
import { listFiles } from './fs-extra.js';
import { ImageUnavailableError } from './errors.js';

/**
 * 本地资产（AI 生成图 / 矢量图）文件扩展名
 */
const LOCAL_IMG_EXT = ['.webp', '.jpg', '.jpeg', '.png', '.svg'];

/**
 * 列出本地资产目录下的图片，返回 { path, base }
 * 命名约定：<role>.ext 或 <role>-<n>.ext（如 home-1.webp、hero.webp、avatar.webp）
 */
async function listLocalAssets(assetsDir) {
  if (!assetsDir) return [];
  const files = await listFiles(assetsDir, { extensions: LOCAL_IMG_EXT }).catch(() => []);
  return files.map((f) => {
    const file = String(f).split(/[\\/]/).pop();
    return { path: f, file, base: file.replace(/\.[^.]+$/, '') };
  });
}

/**
 * 按 role 名挑选本地图（精确名优先，其次 -n 编号按数字升序）
 * 返回文件名（basename），由调用方拼装相对于页面的 URL 前缀
 */
function pickLocal(assets, key, count) {
  const exact = assets.filter((a) => a.base === key);
  const numbered = assets
    .filter((a) => new RegExp(`^${key}-\\d+$`).test(a.base))
    .sort((a, b) => parseInt(a.base.split('-').pop(), 10) - parseInt(b.base.split('-').pop(), 10));
  return [...exact, ...numbered].slice(0, count).map((a) => a.file);
}

/**
 * Unsplash 基础 URL
 */
const UNSPLASH_BASE = 'https://images.unsplash.com/';
const UNSPLASH_PARAMS = 'auto=format&fit=crop&q=80';

// 裁切模式轮换（仅当 count 超过稳定池长度时才会触发复用）
const IMG_CROPS = ['entropy', 'center', 'faces', 'top', 'bottom', 'left', 'right', 'edges'];

/**
 * 产品类型关键词映射
 */
const PRODUCT_KEYWORDS = {
  ecommerce: ['minimalist shop', 'product photography', 'clean background', 'ecommerce', 'online store'],
  saas: ['modern office', 'dashboard ui', 'abstract technology', 'saas', 'software'],
  tool: ['minimalist workspace', 'productivity setup', 'clean desk', 'tools', 'workflow'],
  community: ['diverse people', 'social connection', 'modern lifestyle', 'community', 'networking'],
  content: ['editorial layout', 'reading space', 'magazine spread', 'content creation', 'blog'],
  other: ['abstract gradient', 'minimalist design', 'modern aesthetic', 'technology', 'innovation'],
};

/**
 * 页面类型额外关键词
 */
const PAGE_KEYWORDS = {
  home: ['hero', 'landing', 'welcome'],
  discover: ['explore', 'browse', 'feed', 'discover'],
  list: ['grid', 'catalog', 'collection', 'listing'],
  detail: ['product', 'item', 'detail', 'single'],
  publish: ['create', 'editor', 'upload', 'write'],
  chat: ['messaging', 'conversation', 'chat', 'support'],
  orders: ['orders', 'transactions', 'history', 'receipt'],
  profile: ['profile', 'account', 'settings', 'user'],
  dashboard: ['analytics', 'metrics', 'overview', 'dashboard'],
  settings: ['settings', 'preferences', 'configuration', 'options'],
  form: ['form', 'input', 'wizard', 'survey'],
  login: ['login', 'auth', 'welcome', 'signin'],
};

/**
 * 生成 Unsplash URL
 */
function buildUrl(photoId, width = 800, height = 600, crop = 'entropy') {
  const id = String(photoId).startsWith('photo-') ? photoId : `photo-${photoId}`;
  return `${UNSPLASH_BASE}${id}?${UNSPLASH_PARAMS}&crop=${crop}&w=${width}&h=${height}`;
}

/**
 * 根据产品类型和页面获取关键词
 */
export function getKeywords(productType, pageName = 'home', customKeywords = []) {
  const base = PRODUCT_KEYWORDS[productType] || PRODUCT_KEYWORDS.other;
  const page = PAGE_KEYWORDS[pageName] || [];
  return [...new Set([...customKeywords, ...base, ...page])];
}

/**
 * 获取备用图片 ID
 */
export function getFallbackIds(productType) {
  return unsplashFallback[productType] || unsplashFallback.default;
}

/**
 * 生成图片 URL 列表
 * 说明：稳定池 ID 有限（每类型 6 个），count 超过池长时循环复用并切换裁切模式（crop）
 * 以产生不同取景。根治方案是 AI 生图产出 <page>-1..n 本地资产。
 */
export function generateUrls(productType, count = 3, options = {}) {
  const { width = 800, height = 600 } = options;
  const fallbackIds = getFallbackIds(productType);

  const urls = [];
  for (let i = 0; i < count; i++) {
    const id = fallbackIds[i % fallbackIds.length];
    const crop = IMG_CROPS[i % IMG_CROPS.length];
    urls.push(buildUrl(id, width, height, crop));
  }
  return urls;
}

/**
 * 生成 SVG 占位图
 * 底色跟随**同一个品牌色裁决点**（`resolvePrimaryHsl`）：给了主题就用主题主色，
 * 否则用 productType 预设——否则会出现「配色用了主题、降级占位图还是旧类型主色」的割裂。
 * @param {string[]} keywords
 * @param {number} width
 * @param {number} height
 * @param {string} productType
 * @param {{theme?:object|null}} [options]
 */
export function generatePlaceholder(keywords, width = 800, height = 600, productType = 'other', { theme = null } = {}) {
  const brandColor = resolvePrimaryHsl(productType, null, theme);
  const bgColor = `hsl(${brandColor.h}, ${brandColor.s}%, ${Math.min(95, brandColor.l + 40)}%)`;
  const textColor = `hsl(${brandColor.h}, ${brandColor.s}%, ${Math.max(30, brandColor.l - 20)}%)`;
  const accentColor = `hsl(${brandColor.h}, ${brandColor.s}%, ${brandColor.l}%)`;

  const keywordText = keywords.slice(0, 3).join(' · ');

  return `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="${bgColor}"/>
  <circle cx="50%" cy="40%" r="60" fill="${accentColor}" opacity="0.15"/>
  <circle cx="50%" cy="40%" r="40" fill="${accentColor}" opacity="0.25"/>
  <circle cx="50%" cy="40%" r="20" fill="${accentColor}" opacity="0.4"/>
  <text x="50%" y="65%" font-family="-apple-system,system-ui,sans-serif" font-size="18" fill="${textColor}" text-anchor="middle" opacity="0.7">${keywordText}</text>
  <text x="50%" y="72%" font-family="-apple-system,system-ui,sans-serif" font-size="12" fill="${textColor}" text-anchor="middle" opacity="0.5">图片占位</text>
</svg>
`)}`;
}

/**
 * 生成多个占位图
 */
export function generatePlaceholders(keywords, count, productType = 'other', { theme = null } = {}) {
  return Array.from({ length: count }, (_, i) =>
    generatePlaceholder(keywords, 800, 600, productType, { theme })
  );
}

/**
 * 预检图片可用性（HEAD 请求）
 */
export async function checkImageAccessibility(urls) {
  const results = await Promise.allSettled(
    urls.map(async (url) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeout);
        return { url, accessible: response.ok, status: response.status };
      } catch (error) {
        return { url, accessible: false, error: error.message };
      }
    })
  );

  return results.map((r, i) => ({
    url: urls[i],
    ...(r.status === 'fulfilled' ? r.value : { accessible: false, error: r.reason?.message }),
  }));
}

/**
 * 智能获取图片 - 优先稳定备用池，失败降级占位图
 */
export async function getImages(productType, pageName, count = 3, options = {}) {
  const { width = 800, height = 600, customKeywords = [], allowFallback = true, theme = null } = options;

  try {
    // 1. 生成主 URL（稳定池循环 + 变裁切）
    const urls = generateUrls(productType, count, { width, height });

    // 2. 可选：预检可用性
    if (options.precheck) {
      const checks = await checkImageAccessibility(urls);
      const accessible = checks.filter(c => c.accessible).map(c => c.url);
      if (accessible.length >= count) {
        return accessible.slice(0, count);
      }
      log.unsplash.warn(`${count - accessible.length} images failed precheck, using fallback`);
    }

    return urls;
  } catch (error) {
    log.unsplash.error('Failed to generate image URLs:', error.message);
    if (allowFallback) {
      return generatePlaceholders(getKeywords(productType, pageName, customKeywords), count, productType, { theme });
    }
    throw new ImageUnavailableError(getKeywords(productType, pageName, customKeywords), { originalError: error });
  }
}

/**
 * 为整个原型生成图片映射
 * options.assetsDir：本地资产目录（AI 生成图优先，缺失则降级 Unsplash）
 * options.theme：可选主题（只影响降级占位图底色；URL 池仍按 productType 取）
 */
export async function generateImageMap(prdMeta, pageList, options = {}) {
  const { assetsDir = null, theme = null } = options;
  // 本地图统一输出为「产物根目录相对」路径（assets/x）；页面相对前缀由渲染期按页深度补齐
  const toWeb = (files) => files.map((f) => `assets/${f}`);
  const imageMap = {};
  const localAssets = await listLocalAssets(assetsDir);
  let localCount = 0;
  let totalCount = 0;

  const QUOTA = { home: 6, detail: 4, discover: 6, list: 6, orders: 3, profile: 3, chat: 2, publish: 2, dashboard: 2, settings: 1, form: 1, login: 1 };
  for (const page of pageList) {
    const count = QUOTA[page] ?? 2;
    const local = toWeb(pickLocal(localAssets, page, count));
    totalCount += count;
    if (local.length) {
      localCount += local.length;
      imageMap[page] = local.length >= count ? local : [...local, ...(await getImages(prdMeta.productType, page, count - local.length, { theme }))];
    } else {
      imageMap[page] = await getImages(prdMeta.productType, page, count, { theme });
    }
  }

  // 通用图片（头像、Hero 等），本地优先
  const localAvatar = toWeb(pickLocal(localAssets, 'avatar', 1));
  const localHero = toWeb(pickLocal(localAssets, 'hero', 1));
  totalCount += 3;
  localCount += localAvatar.length + localHero.length;
  imageMap.common = {
    avatar: localAvatar.length ? localAvatar : await getImages(prdMeta.productType, 'profile', 1, { width: 100, height: 100, theme }),
    hero: localHero.length ? localHero : await getImages(prdMeta.productType, 'home', 1, { width: 1200, height: 600, theme }),
    placeholder: generatePlaceholder(['placeholder'], 400, 300, prdMeta.productType, { theme }),
  };

  if (assetsDir) {
    log.unsplash.info(`本地资产优先：${localCount}/${totalCount} 张来自 ${assetsDir}，其余降级 Unsplash`);
  }

  return imageMap;
}

/**
 * 获取单张图片（用于组件内联）
 */
export async function getSingleImage(productType, pageName, options = {}) {
  const urls = await getImages(productType, pageName, 1, options);
  return urls[0];
}

export default {
  getKeywords,
  getFallbackIds,
  generateUrls,
  generatePlaceholder,
  generatePlaceholders,
  checkImageAccessibility,
  getImages,
  generateImageMap,
  getSingleImage,
};