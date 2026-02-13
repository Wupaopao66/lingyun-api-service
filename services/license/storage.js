// =============== API密钥存储服务（带写入校验与原子操作）===============
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const os = require('os');

const LICENSES_DIR = path.join(__dirname, '../../database/licenses');
const CONFIG_DIR = path.join(__dirname, '../../config');
const API_KEYS_FILE = path.join(CONFIG_DIR, 'api_keys.json');

// 确保目录存在
async function ensureLicensesDir() {
    try { await fsPromises.access(LICENSES_DIR); } catch { await fsPromises.mkdir(LICENSES_DIR, { recursive: true }); }
}
async function ensureConfigDir() {
    try { await fsPromises.access(CONFIG_DIR); } catch { await fsPromises.mkdir(CONFIG_DIR, { recursive: true }); }
}

/**
 * 保存密钥记录到 licenses 目录（按日期分文件）
 */
async function saveLicenseRecord(licenseData) {
    await ensureLicensesDir();
    const today = new Date().toISOString().split('T')[0];
    const filePath = path.join(LICENSES_DIR, `${today}.json`);
    let records = [];
    try {
        const data = await fsPromises.readFile(filePath, 'utf8');
        records = JSON.parse(data);
    } catch { records = []; }
    records.push({ ...licenseData, savedAt: new Date().toISOString() });
    await fsPromises.writeFile(filePath, JSON.stringify(records, null, 2));
    console.log(`📁 密钥记录已追加到: ${filePath}`);
}

/**
 * 保存到 api_keys.json（兼容旧版查询）—— 同步版本 + 原子写入 + 校验
 */
async function saveApiKeyLegacy(apiKey, email, paymentId, wxTransactionId = null, expiresAt) {
    await ensureConfigDir();

    // 读取现有密钥（使用同步方法确保读取最新）
    let keys = {};
    try {
        const data = fs.readFileSync(API_KEYS_FILE, 'utf8');
        keys = JSON.parse(data);
        // 确保 keys 是对象（兼容旧版对象格式和新版数组格式）
        if (Array.isArray(keys)) {
            // 如果是数组，转换为对象格式（以 key 为键）
            const newKeys = {};
            keys.forEach(item => {
                if (item.key) newKeys[item.key] = { ...item };
            });
            keys = newKeys;
        }
    } catch (err) {
        // 文件不存在或格式错误，初始化为空对象
        keys = {};
    }

    // 防止重复交易号
    if (wxTransactionId) {
        const existing = Object.entries(keys).find(([_, info]) => info.wx_transaction_id === wxTransactionId);
        if (existing) {
            console.log(`⚠️  重复交易号: ${wxTransactionId}，跳过写入`);
            return existing[1];
        }
    }

    // 记录旧密钥数量
    const oldCount = Object.keys(keys).length;

    // 添加新密钥
    keys[apiKey] = {
        email,
        created_at: new Date().toISOString(),
        expires_at: expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        call_limit: 100,
        calls_used: 0,
        payment_id: paymentId,
        wx_transaction_id: wxTransactionId,
        last_used: null
    };

    const newCount = Object.keys(keys).length;
    console.log(`🔢 密钥数量: ${oldCount} → ${newCount} (新增: ${newCount - oldCount})`);

    // 原子写入：先写入临时文件，再重命名
    const tempFile = `${API_KEYS_FILE}.tmp.${process.pid}`;
    const content = JSON.stringify(keys, null, 2);
    fs.writeFileSync(tempFile, content, 'utf8');
    fs.renameSync(tempFile, API_KEYS_FILE);
    console.log(`✅ 密钥已兼容保存到: ${API_KEYS_FILE}`);

    // 写入后立即校验
    try {
        const verifyData = fs.readFileSync(API_KEYS_FILE, 'utf8');
        const verifyKeys = JSON.parse(verifyData);
        // 如果是数组，需转换校验
        let verifyCount;
        if (Array.isArray(verifyKeys)) {
            verifyCount = verifyKeys.length;
        } else {
            verifyCount = Object.keys(verifyKeys).length;
        }
        if (verifyCount === newCount) {
            console.log(`✅ 写入校验通过，文件包含 ${verifyCount} 个密钥`);
        } else {
            console.error(`❌ 写入校验失败！期望 ${newCount} 个密钥，实际 ${verifyCount} 个`);
            // 可尝试再次写入或记录错误
        }
    } catch (err) {
        console.error(`❌ 写入后校验异常: ${err.message}`);
    }

    return keys[apiKey];
}

/**
 * 统一保存密钥接口（保存 + Git提交 + 触发Vercel部署）
 */
async function saveLicense(licenseData) {
    // 1. 保存详细记录
    await saveLicenseRecord(licenseData);
    // 2. 保存到 api_keys.json
    await saveApiKeyLegacy(
        licenseData.apiKey,
        licenseData.userId,      // 旧版字段为 email，这里传 userId 保持兼容
        licenseData.orderNo,
        licenseData.transactionId,
        licenseData.expiresAt
    );

    // ----- 3. ✅ Git 自动提交 -----
    try {
        await new Promise((resolve, reject) => {
            exec(`
                cd ${path.join(__dirname, '../..')} && \
                git add config/api_keys.json && \
                git commit -m "auto: add key for order ${licenseData.orderNo}" && \
                git push origin main
            `, (error, stdout, stderr) => {
                if (error) {
                    console.error('❌ Git 提交失败:', error.message);
                    reject(error);
                } else {
                    console.log(`📤 Git 推送成功: ${licenseData.orderNo}`);
                    resolve();
                }
            });
        });
    } catch (e) {
        console.error('❌ Git 自动提交异常:', e.message);
    }

    // ----- 4. ✅ 触发 Vercel 部署钩子 -----
    const DEPLOY_HOOK_URL = process.env.VERCEL_DEPLOY_HOOK;
    if (DEPLOY_HOOK_URL) {
        https.get(DEPLOY_HOOK_URL, (res) => {
            console.log(`🚀 Vercel 部署钩子触发成功，状态码: ${res.statusCode}`);
            res.on('data', () => {});
        }).on('error', (err) => {
            console.error(`❌ Vercel 部署钩子触发失败: ${err.message}`);
        });
    } else {
        console.warn('⚠️ 未设置 VERCEL_DEPLOY_HOOK，跳过部署');
    }

    return licenseData;
}

module.exports = {
    saveLicense,
    saveLicenseRecord,
    saveApiKeyLegacy
};