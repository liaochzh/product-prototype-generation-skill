/**
 * 自定义错误类 - 统一错误处理（纯 JS）
 */

export class PrototypeError extends Error {
  constructor(message, code, recoverable = false, details) {
    super(message);
    this.name = 'PrototypeError';
    this.code = code;
    this.recoverable = recoverable;
    this.details = details;
    if (Error.captureStackTrace) Error.captureStackTrace(this, this.constructor);
  }
  toJSON() {
    return { name: this.name, code: this.code, message: this.message, recoverable: this.recoverable, details: this.details, stack: this.stack };
  }
}

export class PRDError extends PrototypeError {
  constructor(message, recoverable = false, details) {
    super(message, 'PRD_ERROR', recoverable, details);
    this.name = 'PRDError';
  }
}
export class PRDParseError extends PRDError {
  constructor(message, details) { super(message, true, details); this.name = 'PRDParseError'; this.code = 'PRD_PARSE_ERROR'; }
}
export class PRDValidationError extends PRDError {
  constructor(message, details) { super(message, true, details); this.name = 'PRDValidationError'; this.code = 'PRD_VALIDATION_ERROR'; }
}
export class PRDGenerationError extends PRDError {
  constructor(message, details) { super(message, false, details); this.name = 'PRDGenerationError'; this.code = 'PRD_GENERATION_ERROR'; }
}
export class TemplateError extends PrototypeError {
  constructor(message, recoverable = false, details) { super(message, 'TEMPLATE_ERROR', recoverable, details); this.name = 'TemplateError'; }
}
export class TemplateNotFoundError extends TemplateError {
  constructor(templatePath, details) { super(`Template not found: ${templatePath}`, true, details); this.name = 'TemplateNotFoundError'; this.code = 'TEMPLATE_NOT_FOUND'; }
}
export class TemplateRenderError extends TemplateError {
  constructor(templatePath, message, details) { super(`Render error in ${templatePath}: ${message}`, false, details); this.name = 'TemplateRenderError'; this.code = 'TEMPLATE_RENDER_ERROR'; }
}
export class ImageError extends PrototypeError {
  constructor(message, recoverable = true, details) { super(message, 'IMAGE_ERROR', recoverable, details); this.name = 'ImageError'; }
}
export class ImageUnavailableError extends ImageError {
  constructor(keywords, details) { super(`No images for: ${(keywords || []).join(', ')}`, true, details); this.name = 'ImageUnavailableError'; this.code = 'IMAGE_UNAVAILABLE'; }
}
export class LLMError extends PrototypeError {
  constructor(message, recoverable = false, details) { super(message, 'LLM_ERROR', recoverable, details); this.name = 'LLMError'; }
}
export class LLMUnavailableError extends LLMError {
  constructor(message, details) { super(message, true, details); this.name = 'LLMUnavailableError'; this.code = 'LLM_UNAVAILABLE'; }
}
export class FSError extends PrototypeError {
  constructor(message, recoverable = false, details) { super(message, 'FS_ERROR', recoverable, details); this.name = 'FSError'; }
}
export class FSWriteError extends FSError {
  constructor(path, message, details) { super(`Write ${path}: ${message}`, false, details); this.name = 'FSWriteError'; this.code = 'FS_WRITE_ERROR'; }
}
export class FSReadError extends FSError {
  constructor(path, message, details) { super(`Read ${path}: ${message}`, true, details); this.name = 'FSReadError'; this.code = 'FS_READ_ERROR'; }
}
export class FSPermissionError extends FSError {
  constructor(path, details) { super(`Permission denied: ${path}`, false, details); this.name = 'FSPermissionError'; this.code = 'FS_PERMISSION_ERROR'; }
}
export class FSDiskSpaceError extends FSError {
  constructor(path, details) { super(`No space: ${path}`, false, details); this.name = 'FSDiskSpaceError'; this.code = 'FS_DISK_SPACE'; }
}
export class VerificationError extends PrototypeError {
  constructor(message, details) { super(message, 'VERIFICATION_ERROR', false, details); this.name = 'VerificationError'; }
}

export function isRecoverable(error) { return error instanceof PrototypeError && error.recoverable; }
export function formatError(error) {
  if (error instanceof PrototypeError) return `[${error.code}]${error.recoverable ? '(可恢复)' : ''} ${error.message}`;
  return error.message;
}
export async function withRetry(fn, options = {}) {
  const { retries = 3, delay = 1000, backoff = 2, shouldRetry = isRecoverable } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); } catch (error) {
      lastError = error;
      if (attempt === retries || !shouldRetry(error)) throw error;
      await new Promise((r) => setTimeout(r, delay * Math.pow(backoff, attempt)));
    }
  }
  throw lastError;
}
