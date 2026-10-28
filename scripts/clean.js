#!/usr/bin/env node
/** 清理：node scripts/clean.js */
import { resolve } from 'path';
import { removeRecursive, exists } from '../utils/fs-extra.js';
import { log } from '../utils/logger.js';
const WORKSPACE = process.env.WORKSPACE || process.cwd();
const outDir = resolve(WORKSPACE, 'prototype');
if (await exists(outDir)) { await removeRecursive(outDir); log.main.info(`已清理 ${outDir}`); }
else log.main.info('无需清理');
