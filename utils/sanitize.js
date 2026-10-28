/**
 * 内容清洗 - 敏感词过滤、XSS 转义
 */
const SENSITIVE = ['密码', '身份证', '银行卡', '手机号138', 'token=', 'secret'];
export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function sanitizePRD(content = '') {
  let out = content;
  for (const w of SENSITIVE) out = out.split(w).join('***');
  return out;
}
export function hasSensitive(content = '') {
  return SENSITIVE.filter((w) => content.includes(w));
}
export default { escapeHtml, sanitizePRD, hasSensitive };
