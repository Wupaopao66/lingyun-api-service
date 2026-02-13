// =============== 灵云系统 - 微信支付主程序（集成主动查询） ===============
const express = require('express');
const bodyParser = require('body-parser');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');

// 引入微信支付配置（独立模块）
const wechatConfig = require('./config/wechat');
// 引入微信订单查询服务（卡片02）
const { queryOrder } = require('./services/wechat/query');

const app = express();
const HTTP_PORT = 80;
const HTTPS_PORT = 443;

// ===================== 获取原始请求体中间件 =====================
const rawBodySaver = (req, res, buf, encoding) => {
    if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8');
    }
};

app.use(bodyParser.json({ verify: rawBodySaver }));
app.use(bodyParser.urlencoded({ extended: true, verify: rawBodySaver }));

// ===================== CORS 配置 =====================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

// ===================== 静态文件服务 =====================
app.use(express.static('public'));

// ===================== SSL 证书配置 =====================
const SSL_CONFIG = {
    key: fs.readFileSync(path.join(__dirname, 'ssl/lingyunai.cn.key'), 'utf8'),
    cert: fs.readFileSync(path.join(__dirname, 'ssl/lingyunai.cn_bundle.crt'), 'utf8')
};

console.log('🔐 SSL证书加载状态:');
console.log('  密钥文件:', fs.existsSync(path.join(__dirname, 'ssl/lingyunai.cn.key')) ? '✅ 存在' : '❌ 缺失');
console.log('  证书文件:', fs.existsSync(path.join(__dirname, 'ssl/lingyunai.cn_bundle.crt')) ? '✅ 存在' : '❌ 缺失');

// ===================== 公共域名配置 =====================
const PUBLIC_DOMAIN = 'lingyunai.cn';

// ===================== 密钥存储系统 =====================
const CONFIG_DIR = path.join(__dirname, 'config');
const API_KEYS_FILE = path.join(CONFIG_DIR, 'api_keys.json');

async function ensureConfigDir() {
    try { await fs.promises.access(CONFIG_DIR); }
    catch { await fs.promises.mkdir(CONFIG_DIR, { recursive: true }); }
}

async function loadApiKeys() {
    try {
        const data = await fs.promises.readFile(API_KEYS_FILE, 'utf8');
        return JSON.parse(data);
    } catch { return {}; }
}

async function saveApiKey(apiKey, email, paymentId, wxTransactionId = null) {
    await ensureConfigDir();
    const keys = await loadApiKeys();
    
    if (wxTransactionId) {
        const existing = Object.entries(keys).find(([_, info]) => info.wx_transaction_id === wxTransactionId);
        if (existing) {
            console.log(`⚠️  重复交易号: ${wxTransactionId}`);
            return existing[1];
        }
    }
    
    keys[apiKey] = {
        email,
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        call_limit: 100,
        calls_used: 0,
        payment_id: paymentId,
        wx_transaction_id: wxTransactionId,
        last_used: null
    };
    
    await fs.promises.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    console.log(`✅ 密钥保存到: ${API_KEYS_FILE}`);
    return keys[apiKey];
}

// ===================== 证书读取 =====================
function readFileContent(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
        console.error(`❌ 读取失败: ${filePath}`, err.message);
        return null;
    }
}

const PRIVATE_KEY = readFileContent(wechatConfig.PRIVATE_KEY_PATH);
const PRIVATE_KEY_OBJ = crypto.createPrivateKey(PRIVATE_KEY);
console.log('✅ 商户私钥加载完成');

// ===================== 微信支付API请求 =====================
function generateWechatPaySignature(method, url, timestamp, nonce, body = '') {
    const signStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
    const sign = crypto.sign('sha256', Buffer.from(signStr), {
        key: PRIVATE_KEY_OBJ,
        padding: crypto.constants.RSA_PKCS1_PADDING
    });
    return sign.toString('base64');
}

function sendWechatPayRequest(url, data = {}) {
    return new Promise((resolve, reject) => {
        const method = 'POST';
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = crypto.randomBytes(16).toString('hex');
        const bodyStr = JSON.stringify(data);
        const signature = generateWechatPaySignature(method, url, timestamp, nonce, bodyStr);
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'LingyunPay/1.0.0',
            'Authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${wechatConfig.MCHID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${wechatConfig.SERIAL_NO}"`
        };
        const req = https.request({
            hostname: 'api.mch.weixin.qq.com',
            port: 443,
            path: url,
            method: method,
            headers: headers
        }, (res) => {
            let responseData = '';
            res.on('data', (chunk) => responseData += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    if (res.statusCode >= 400) {
                        reject(new Error(`微信支付API错误(${res.statusCode}): ${result.message || result.code || '未知错误'}`));
                        return;
                    }
                    resolve(result);
                } catch (err) {
                    reject(new Error(`解析响应失败: ${err.message}, 原始数据: ${responseData}`));
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

// ===================== 临时订单存储（后续迁移到文件数据库） =====================
const paymentOrders = new Map();

// ===================== API 路由 =====================

// 健康检查 / 状态查询
app.get('/api/exchange', (req, res) => {
    res.json({
        code: 200,
        message: '✅ 灵云系统-微信支付服务正常运行',
        data: {
            服务类型: '微信支付SSL直连版',
            微信商户号: wechatConfig.MCHID,
            微信AppID: wechatConfig.APPID,
            密钥状态: '已配置',
            公网地址: `https://${PUBLIC_DOMAIN}`,
            SSL模式: 'Node.js直连'
        }
    });
});

// 生成支付二维码
app.post('/api/payment/generate-link', async (req, res) => {
    try {
        const { userId, amount = 1 } = req.body;
        if (!userId) return res.status(400).json({ code: 400, message: '请输入用户ID' });
        if (amount < 1) return res.status(400).json({ code: 400, message: '金额最小为1分' });

        const outTradeNo = `PAY${Date.now()}${Math.random().toString().slice(2, 6)}`.slice(0, 32);
        // 回调URL嵌入订单号（关键）
        const notifyUrl = `https://${PUBLIC_DOMAIN}/api/wechatpay/callback/${outTradeNo}`;

        const orderData = {
            appid: wechatConfig.APPID,
            mchid: wechatConfig.MCHID,
            out_trade_no: outTradeNo,
            amount: { total: amount, currency: 'CNY' },
            description: '灵云系统服务费用',
            attach: userId,
            notify_url: notifyUrl
        };

        console.log('📤 调用微信支付统一下单API...');
        const result = await sendWechatPayRequest('/v3/pay/transactions/native', orderData);

        const orderInfo = {
            orderId: outTradeNo,
            codeUrl: result.code_url,
            amount: amount,
            createTime: new Date().toLocaleString(),
            status: '未支付',
            userId: userId
        };
        paymentOrders.set(userId, orderInfo);
        console.log(`✅ 订单创建成功: ${outTradeNo}, 用户: ${userId}`);

        let qrCodeImage = '';
        try {
            qrCodeImage = await qrcode.toDataURL(result.code_url);
        } catch (qrErr) {
            console.warn('⚠️ 二维码生成失败:', qrErr.message);
        }

        res.json({
            code: 200,
            message: '🎉 微信支付二维码生成成功',
            data: {
                userId,
                dynamicLink: result.code_url,
                qrCodeImage,
                orderId: outTradeNo,
                amount: amount,
                createTime: orderInfo.createTime,
                status: orderInfo.status
            }
        });
    } catch (err) {
        console.error('❌ 微信支付生成错误:', err.message);
        res.status(500).json({ code: 500, message: `生成失败：${err.message}` });
    }
});

// ===================== 微信支付回调接口（简化版 + 主动查询） =====================
app.post('/api/wechatpay/callback/:orderNo', async (req, res) => {
    const orderNo = req.params.orderNo;
    console.log('\n' + '='.repeat(80));
    console.log(`📞 收到微信支付回调，订单号: ${orderNo}`);
    console.log('='.repeat(80));

    try {
        // 1. 保存回调记录到 database/callbacks
        const callbackDir = path.join(__dirname, 'database/callbacks');
        if (!fs.existsSync(callbackDir)) fs.mkdirSync(callbackDir, { recursive: true });

        const callbackRecord = {
            timestamp: new Date().toISOString(),
            orderNo,
            wechatTimestamp: req.headers['wechatpay-timestamp'] || '',
            wechatNonce: req.headers['wechatpay-nonce'] || '',
            rawBodyLength: req.rawBody ? req.rawBody.length : 0
        };

        const fileName = `${callbackDir}/callback_${Date.now()}.json`;
        fs.writeFileSync(fileName, JSON.stringify(callbackRecord, null, 2));
        console.log(`📁 回调记录已保存: ${fileName}`);

        // 2. 返回微信要求的成功响应（必须立即返回）
        res.set('Content-Type', 'application/json');
        res.status(200).json({ code: 'SUCCESS', message: '成功' });

        // ========== 主动查询订单（卡片02核心） ==========
        console.log(`🔍 延迟3秒后主动查询订单: ${orderNo}`);
        setTimeout(async () => {
            try {
                const orderInfo = await queryOrder(orderNo);
                if (orderInfo.tradeState === 'SUCCESS') {
                    console.log(`✅ 订单支付成功确认: ${orderNo}`);
                    console.log(`   金额: ${orderInfo.amount} 分`);
                    console.log(`   微信交易号: ${orderInfo.transactionId}`);
                    console.log(`   支付时间: ${orderInfo.successTime}`);

                    // TODO: 卡片04 - 自动发货流程
                    // 1. 更新订单状态为已支付
                    // 2. 生成API密钥
                    // 3. 发送邮件
                    // 4. 保存密钥记录
                } else {
                    console.log(`⚠️ 订单 ${orderNo} 状态: ${orderInfo.tradeState}，暂未支付成功`);
                }
            } catch (queryErr) {
                console.error(`❌ 主动查询订单失败: ${orderNo}`, queryErr.message);
                // 可考虑重试逻辑（卡片04实现）
            }
        }, 3000); // 延迟3秒，给微信支付系统一点处理时间

    } catch (err) {
        console.error('❌ 回调处理异常:', err.message);
        // 即使出错也要返回成功
        res.set('Content-Type', 'application/json');
        res.status(200).json({ code: 'SUCCESS', message: '成功' });
    }
});

// ===================== 订单查询接口（临时，通过userId） =====================
app.get('/api/payment/query/:userId', (req, res) => {
    const userId = req.params.userId;
    const orderInfo = paymentOrders.get(userId);
    if (!orderInfo) {
        return res.json({ code: 404, message: '未找到该用户的支付订单' });
    }
    res.json({ code: 200, message: '订单查询成功', data: orderInfo });
});

// ===================== 根路由 - 自动重定向到首页 =====================
app.get("/", (req, res) => {
    res.redirect("/index.html");
});

// ===================== 启动服务器 =====================
const httpsServer = https.createServer(SSL_CONFIG, app);
const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
});

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log('\n' + '🚀'.repeat(60));
    console.log('🎉 灵云支付服务启动成功 - 主动查询版');
    console.log('🚀'.repeat(60));
    console.log(`🔐 HTTPS服务器: https://${PUBLIC_DOMAIN}`);
    console.log(`🔐 监听端口: ${HTTPS_PORT}`);
    console.log(`💳 微信商户号: ${wechatConfig.MCHID}`);
    console.log(`📱 小程序AppID: ${wechatConfig.APPID}`);
    console.log('🚀'.repeat(60));
    console.log('\n✅ 静态文件服务已启用');
    console.log('✅ 回调URL已携带订单号');
    console.log('✅ 主动订单查询已集成（卡片02完成）');
    console.log('🚀'.repeat(60));
});

httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
    console.log(`📡 HTTP重定向服务器: http://${PUBLIC_DOMAIN} -> https://${PUBLIC_DOMAIN}`);
});

process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务...');
    httpsServer.close();
    httpServer.close();
    process.exit(0);
});