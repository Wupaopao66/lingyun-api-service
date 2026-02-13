#!/usr/bin/env node
// =============== 密钥同步脚本（适配数组格式 api_keys.json）===============
// 作用：读取 config/api_keys.json（数组），过滤未过期密钥，输出压缩JSON供Vercel环境变量
// 输出格式：{"真实密钥1":{"expires_at":"...","email":"...","plan":"..."}, ...}
// 使用：node sync-keys-to-vercel.js，复制整行输出，粘贴到 Vercel VALID_API_KEYS

const fs = require('fs');
const path = require('path');

// 1. 读取 config/api_keys.json（数组格式）
const apiKeysPath = path.join(__dirname, '../config/api_keys.json');
let keysArray = [];

try {
    const data = fs.readFileSync(apiKeysPath, 'utf8');
    keysArray = JSON.parse(data);
    if (!Array.isArray(keysArray)) {
        console.error('❌ 错误：api_keys.json 不是数组格式，请检查文件结构');
        process.exit(1);
    }
} catch (err) {
    console.error('❌ 读取 api_keys.json 失败:', err.message);
    console.error('   请确认文件存在且格式正确');
    process.exit(1);
}

// 2. 过滤未过期的密钥，转换为 Vercel 需要的键值对对象
const now = new Date();
const validKeys = {};

keysArray.forEach(item => {
    // 兼容两种可能的字段名：expiresAt 或 expires_at
    const expireStr = item.expiresAt || item.expires_at;
    if (!expireStr) {
        console.warn(`⚠️ 密钥 ${item.key || '未知'} 缺少过期时间字段，跳过`);
        return;
    }

    const expire = new Date(expireStr);
    if (expire > now) {
        // ✅ 核心：以真实密钥字符串作为键
        validKeys[item.key] = {
            expires_at: expire.toISOString(),   // 统一 ISO 字符串
            email: item.email || '',
            plan: item.plan || 'unknown',       // 暂填 unknown，后续可补充
            // 可在此处添加更多字段（如 call_limit），Vercel 网关需要时可读取
        };
    }
});

// 3. 输出压缩纯文本 JSON（无换行缩进）
const output = JSON.stringify(validKeys);

console.log('\n' + '='.repeat(60));
console.log('✅ 以下为当前有效的密钥列表（压缩纯文本格式）');
console.log('='.repeat(60));
console.log(output);
console.log('='.repeat(60));
console.log('\n📋 请完整复制上方大括号 {} 内的所有内容（包含外层花括号）');
console.log('🔗 然后粘贴到 Vercel 环境变量 VALID_API_KEYS 中');
console.log('⚠️  注意：必须是一行纯文本，不要手动格式化\n');