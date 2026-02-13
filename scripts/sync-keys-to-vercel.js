#!/usr/bin/env node
// =============== 密钥同步脚本（兼容对象/数组格式）===============
const fs = require('fs');
const path = require('path');

const apiKeysPath = path.join(__dirname, '../config/api_keys.json');
let rawData;

try {
    rawData = fs.readFileSync(apiKeysPath, 'utf8');
} catch (err) {
    console.error('❌ 读取 api_keys.json 失败:', err.message);
    process.exit(1);
}

// 解析 JSON，兼容对象和数组格式
let keysArray = [];
let keysObject = {};

try {
    const parsed = JSON.parse(rawData);
    if (Array.isArray(parsed)) {
        // 数组格式：转换为对象格式（以 key 为键）
        keysArray = parsed;
        parsed.forEach(item => {
            if (item.key) keysObject[item.key] = { ...item };
        });
    } else if (parsed && typeof parsed === 'object') {
        // 对象格式：直接使用
        keysObject = parsed;
        // 同时构建数组（便于过滤）
        keysArray = Object.entries(parsed).map(([key, value]) => ({ key, ...value }));
    } else {
        throw new Error('JSON 既不是数组也不是对象');
    }
} catch (err) {
    console.error('❌ 解析 api_keys.json 失败:', err.message);
    process.exit(1);
}

// 过滤未过期密钥
const now = new Date();
const validKeys = {};

keysArray.forEach(item => {
    const expireStr = item.expires_at || item.expiresAt;
    if (!expireStr) return;
    const expire = new Date(expireStr);
    if (expire > now) {
        // 使用 item.key 或从对象中推断键
        const key = item.key || (() => {
            // 如果是对象格式，键已在 keysObject 中，但我们遍历的是数组，所以此处不会执行
            return null;
        })();
        if (key) {
            validKeys[key] = {
                expires_at: expire.toISOString(),
                email: item.email || '',
                plan: item.plan || 'unknown'
            };
        }
    }
});

// 如果上面没取到 key（可能是对象格式遍历时没构建 key 字段），则从 keysObject 直接取
if (Object.keys(validKeys).length === 0 && Object.keys(keysObject).length > 0) {
    Object.entries(keysObject).forEach(([key, info]) => {
        const expireStr = info.expires_at || info.expiresAt;
        if (!expireStr) return;
        const expire = new Date(expireStr);
        if (expire > now) {
            validKeys[key] = {
                expires_at: expire.toISOString(),
                email: info.email || '',
                plan: info.plan || 'unknown'
            };
        }
    });
}

const output = JSON.stringify(validKeys);
console.log('\n' + '='.repeat(60));
console.log('✅ 以下为当前有效的密钥列表（压缩纯文本格式）');
console.log('='.repeat(60));
console.log(output);
console.log('='.repeat(60));
console.log('\n📋 请完整复制上方大括号 {} 内的所有内容（包含外层花括号）');
console.log('🔗 然后粘贴到 Vercel 环境变量 VALID_API_KEYS 中');
console.log('⚠️  注意：必须是一行纯文本，不要手动格式化\n');