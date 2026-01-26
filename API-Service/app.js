const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const bodyParser = require('body-parser');
const bodyParserXml = require('body-parser-xml');

const app = express();

// 初始化XML解析
bodyParserXml(bodyParser);

// 中间件顺序：XML解析优先
app.use(bodyParser.xml({
  limit: '1MB',
  xmlParseOptions: {
    normalize: true,
    normalizeTags: false,
    explicitArray: false
  }
}));

// 然后是JSON和URL编码
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==================== 配置区域 ====================
const PORT = 3000;
const CONFIG_DIR = path.join(__dirname, 'config');
const API_KEYS_FILE = path.join(CONFIG_DIR, 'api_keys.json');

// 微信支付配置（使用你的真实信息）
const WX_MCH_ID = '1738738656';
const WX_API_KEY = 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6';

// 支付宝配置（使用你的真实信息）
const ALIPAY_APP_ID = '2088702441235637';
const ALIPAY_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCs1PG0FqOOLqfA
KUKUvjbz0fIA+seWTBgw0TVH8iS6X5lSWRinIIvX4RZRMo5TzmfBlE4dOvHwnifO
o5QSnH1vPNVHcDXasxg0dkbLXN0BfPgfIo+uh+Sifc4FUG8RE/4gtYhWZ1hqdau6
XnCSFXRmGSILwjGshhWo1ThfE+mgJsb4BUagpV4MjqjkI2nykgcuugHoRRp3uBnc
SeFhDpZQkczpp8XGbg0PM+0nhb5EAur5rmrojYH07zY7MxV2t16BBlOVP7BYhips
c+y1ZpWoHKz4Nx9TTWHr5849+9tJuwC9QsLTlYJ6VU+o9ceCMtW2xF8ofMAzQ/Qg
Zon9EAwVAgMBAAECggEAHYXmn+e6GqCXoTirGfOAOZgkacxs6ZyoCTbDjj2rznZk
H2/+yRXDLaZShJ5JN8GrcaLe0RlvmLW7gQ3qTl+TAbx3hlOBr5EmUlfd8gEz83wg
elkSCDNIeAVbewbpYhZzM60u0+ula9Ib+qMFQb8Oeh5S9YU/rQPekU+S6JLjNqsA
sK+LzWRmKwh1EZD7670VZJEAC0PE9uVvX4hSFJoLJOrPYX8zSKQnvJ06kDjyqw4j
2MYgdrTwcUbZ8N2E1PVBCsaPGm6O/PqBgPVHBO9UYkEVYWsRrjmxMpZAd3WxI0J1
vueTT/wlZ2nnHsI3x5o+zgkhsRTUqe5n18pLJT9VAQKBgQDtWVfqaenkBXMAPOvJ
JLTgQ9ON7Z8j7VOpQID+wpmGzuX4WPYE2FAH0MHpoOr3B8A/ez0pzqnntfaQaX5x
f9eUW1EsmUHudkv1bMfyp7kQufswX81Q6u6kVhK9XR7vuHY09ALC/KKvYxDqyzxn
11rFnyUcRc/Ufb776CdcZWfMwQKBgQC6abverGcymme8dK3jDqWgiL6aqiL5PyBy
9vDjmqK1qV62/Z8B5mDI1WqZxt9/RZJjQgcHr10dwE1jn+mzHU/uXlYYcN++6+lt
svrNEYjPU8P3s6NWmVIP+E/LNUkdZYKD0HIke7KDP4eQ6pc4blv5rQQW89Bk0etI
hn7pLw0QVQKBgQDoGtvPoB2a3/1TOUA3Jo8/VPTYMYzT3G1Y8Xx0Jidu3nuj/pMv
r72rtuk6qCO+ybSmH8VzUedzcc2Z8aA2LBfMu/RI0eLY6JRlgCiUUpK3Gbjb2IP2
4pfW21leF2d+c/wc0pa0ycvqCc3sXi1HOyFIatYmrNqN6R5QR/nd8EiuwQKBgErR
pVX6XHEzB+/b5O79Mfz85YOuRdtEOwHpm0W/Cw9eq2VG5ksc7DuvbNnLuGicw+SS
27954yXNyUHzLRl26l4B/wxQQX2fslEVRRSJtR+Bv2Xr8+MOJqHCSESHXpEt7PR6
9VUvULbdCMxhW9CKet/7UWjk8v+EQasaUFXHTLcBAoGATmY2JbxrnMdb0A+b32Zh
ZmMaR76J4DYzPuRsRVSekNiHxDac88Lc+vP8ZyHni9Cv8fM+F2XcSbIulQuNJsXf
OAsRQLPfla04GaBfW8ieqEfjsMF6Y9bidF15CV4a+ZUuGOjNxbUeq9iXiqA8f9JQ
INf2vj+oUnQCGwYkcw0EsSM=
-----END PRIVATE KEY-----`;

// ==================== 辅助函数 ====================
async function ensureConfigDir() {
    try {
        await fs.access(CONFIG_DIR);
    } catch {
        await fs.mkdir(CONFIG_DIR, { recursive: true });
    }
}

async function loadApiKeys() {
    try {
        const data = await fs.readFile(API_KEYS_FILE, 'utf8');
        return JSON.parse(data);
    } catch {
        return {};
    }
}

async function saveApiKey(apiKey, email, paymentId, wxTransactionId = null) {
    await ensureConfigDir();
    const keys = await loadApiKeys();
    
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
    
    await fs.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
    return keys[apiKey];
}

// ==================== 微信支付回调 ====================
app.post('/api/wxpay_callback', async (req, res) => {
    try {
        console.log('💰 收到微信支付回调:', JSON.stringify(req.body, null, 2));
        
        // XML数据在 req.body.xml 中
        const xmlData = req.body.xml || {};
        const { 
            transaction_id,    // 微信支付订单号
            out_trade_no,      // 商户订单号
            total_fee,         // 订单金额（分）
            time_end,          // 支付完成时间
            attach             // 附加数据（我们存放邮箱）
        } = xmlData;
        
        // 在实际生产中需要验证签名，这里简化处理
        // 真实场景：验证req.headers['wechatpay-signature']
        
        // 生成API密钥
        const apiKey = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const email = attach || 'unknown@yunzh.com';
        
        // 存储密钥
        await saveApiKey(apiKey, email, out_trade_no, transaction_id);
        
        console.log(`🔑 微信支付密钥已生成: ${apiKey} → ${email}`);
        
        // 必须返回XML格式的success给微信
        res.set('Content-Type', 'text/xml');
        res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
        
    } catch (error) {
        console.error('❌ 微信支付回调错误:', error);
        res.set('Content-Type', 'text/xml');
        res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[系统错误]]></return_msg></xml>');
    }
});

// ==================== 支付宝回调 ====================
app.post('/api/alipay_callback', async (req, res) => {
    try {
        console.log('💰 收到支付宝回调:', JSON.stringify(req.body, null, 2));
        
        // XML数据在 req.body.xml 中
        const xmlData = req.body.xml || {};
        const { 
            trade_no,          // 支付宝交易号
            out_trade_no,      // 商户订单号
            total_amount,      // 订单金额
            buyer_id,          // 买家支付宝用户号
            buyer_logon_id,    // 买家支付宝账号
            passback_params    // 回传参数（我们存放邮箱）
        } = xmlData;
        
        // 在实际生产中需要验证签名
        // 真实场景：使用支付宝SDK验证req.body.sign
        
        // 生成API密钥
        const apiKey = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const email = passback_params || buyer_logon_id || 'unknown@yunzh.com';
        
        // 存储密钥
        await saveApiKey(apiKey, email, out_trade_no, trade_no);
        
        console.log(`🔑 支付宝密钥已生成: ${apiKey} → ${email}`);
        
        // 支付宝需要返回success
        res.send('success');
        
    } catch (error) {
        console.error('❌ 支付宝回调错误:', error);
        res.send('fail');
    }
});

// ==================== 原有接口保持不变 ====================
// 1. 汇率API接口
app.get('/api/exchange', async (req, res) => {
    try {
        const { from = 'USD', to = 'CNY' } = req.query;
        
        // 检查API密钥
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ 
                success: false, 
                message: '缺少API密钥，请在请求头中添加: X-API-Key' 
            });
        }
        
        const keys = await loadApiKeys();
        const keyInfo = keys[apiKey];
        
        if (!keyInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '无效的API密钥' 
            });
        }
        
        // 检查调用次数
        if (keyInfo.calls_used >= keyInfo.call_limit) {
            return res.status(429).json({ 
                success: false, 
                message: 'API调用次数已达上限' 
            });
        }
        
        // 更新调用次数
        keyInfo.calls_used += 1;
        keyInfo.last_used = new Date().toISOString();
        keys[apiKey] = keyInfo;
        await fs.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
        
        // 获取汇率数据
        const response = await axios.get(`https://api.exchangerate-api.com/v4/latest/${from}`);
        const rate = response.data.rates[to];
        
        res.json({
            success: true,
            data: {
                from,
                to,
                rate: rate || 7.2, // 备用汇率
                updated: new Date().toISOString(),
                calls_remaining: keyInfo.call_limit - keyInfo.calls_used
            }
        });
        
    } catch (error) {
        console.error('汇率API错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取汇率数据失败',
            data: { from: req.query.from || 'USD', to: req.query.to || 'CNY', rate: 7.2 }
        });
    }
});

// 2. 天气API接口
app.get('/api/weather', async (req, res) => {
    try {
        const { city = 'Beijing' } = req.query;
        
        // API密钥检查（与汇率接口相同）
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({ 
                success: false, 
                message: '缺少API密钥' 
            });
        }
        
        const keys = await loadApiKeys();
        const keyInfo = keys[apiKey];
        
        if (!keyInfo) {
            return res.status(401).json({ 
                success: false, 
                message: '无效的API密钥' 
            });
        }
        
        if (keyInfo.calls_used >= keyInfo.call_limit) {
            return res.status(429).json({ 
                success: false, 
                message: 'API调用次数已达上限' 
            });
        }
        
        // 更新调用次数
        keyInfo.calls_used += 1;
        keyInfo.last_used = new Date().toISOString();
        keys[apiKey] = keyInfo;
        await fs.writeFile(API_KEYS_FILE, JSON.stringify(keys, null, 2));
        
        // 获取天气数据（使用免费API）
        const response = await axios.get(`http://wttr.in/${city}?format=j1`);
        
        res.json({
            success: true,
            data: {
                city,
                temperature: response.data.current_condition[0].temp_C,
                condition: response.data.current_condition[0].weatherDesc[0].value,
                humidity: response.data.current_condition[0].humidity,
                updated: new Date().toISOString(),
                calls_remaining: keyInfo.call_limit - keyInfo.calls_used
            }
        });
        
    } catch (error) {
        console.error('天气API错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '获取天气数据失败',
            data: { city: req.query.city || 'Beijing', temperature: 20, condition: '晴' }
        });
    }
});

// 3. 密钥生成接口（模拟支付验证）
app.post('/api/create_key', async (req, res) => {
    try {
        const { email, payment_id } = req.body;
        
        if (!email || !payment_id) {
            return res.status(400).json({ 
                success: false, 
                message: '缺少必要参数: email 和 payment_id' 
            });
        }
        
        console.log(`💰 模拟支付验证: 邮箱=${email}, 支付ID=${payment_id}`);
        
        // 生成API密钥
        const apiKey = `key_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        // 存储密钥
        const keyInfo = await saveApiKey(apiKey, email, payment_id);
        
        console.log(`🔑 密钥已存储: ${apiKey} → ${email}`);
        
        res.json({
            success: true,
            data: {
                api_key: apiKey,
                expires_at: keyInfo.expires_at,
                call_limit: keyInfo.call_limit,
                api_endpoint: `http://localhost:${PORT}/api/exchange`,
                usage_hint: `在请求头中添加: X-API-Key: ${apiKey}`
            },
            message: '密钥已生成，请妥善保存。'
        });
        
    } catch (error) {
        console.error('生成密钥错误:', error);
        res.status(500).json({ 
            success: false, 
            message: '生成密钥失败' 
        });
    }
});

// 4. 健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        service: '灵云数据API服务',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        status: 'running'
    });
});

// ==================== 启动服务 ====================
async function startServer() {
    await ensureConfigDir();
    
    app.listen(PORT, () => {
        console.log(`\n✨ 灵云数据API服务已启动，端口：${PORT}`);
        console.log(`💰 支付回调地址：https://eb939855dffb46.lhr.life`);
        console.log(`🔗 本地测试：http://localhost:${PORT}/api/exchange?from=USD&to=CNY`);
        console.log(`🔗 健康检查：http://localhost:${PORT}/api/health`);
        console.log(`\n💝 支付闭环已配置：`);
        console.log(`   - 微信支付回调：/api/wxpay_callback`);
        console.log(`   - 支付宝回调：/api/alipay_callback`);
        console.log(`   - 模拟支付：/api/create_key`);
    });
}

startServer().catch(console.error);