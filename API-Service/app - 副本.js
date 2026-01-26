const express = require('express');
const app = express();
const port = 3000;

// ========== CORS中间件 ==========
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json());

// ========== 根路由 ==========
app.get('/', (req, res) => {
    res.json({
        service: '云织数据API V1.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: [
            '/api/exchange?from=USD&to=CNY'
        ]
    });
});

// ========== 汇率API ==========
app.get('/api/exchange', (req, res) => {
    const { from = 'USD', to = 'CNY' } = req.query;
    
    res.json({
        from,
        to,
        amount: 1,
        rate: 7.25,
        result: 7.25,
        updated: new Date().toISOString()
    });
});

// ==================== 密钥分发模块 ====================
const fs = require('fs');
const path = require('path');
const keysFilePath = path.join(__dirname, 'config', 'api_keys.json');

// 确保配置文件目录存在
if (!fs.existsSync(path.dirname(keysFilePath))) {
    fs.mkdirSync(path.dirname(keysFilePath), { recursive: true });
}

// 1. 密钥生成函数
function generateApiKey() {
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substr(2, 9);
    return `key_${timestamp}_${randomStr}`;
}

// 2. 密钥存储函数
function saveApiKey(email, apiKey) {
    let keysData = {};
    
    // 读取现有密钥文件
    if (fs.existsSync(keysFilePath)) {
        try {
            keysData = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
        } catch (e) {
            console.error('读取密钥文件失败，创建新文件:', e.message);
        }
    }
    
    // 存储新密钥
    keysData[apiKey] = {
        email: email,
        created: new Date().toISOString(),
        calls: 0,
        status: 'active',
        lastUsed: null
    };
    
    // 写入文件
    fs.writeFileSync(keysFilePath, JSON.stringify(keysData, null, 2), 'utf8');
    console.log(`🔑 密钥已存储: ${apiKey} → ${email}`);
}

// 3. 支付回调接口（模拟验证版）
app.post('/api/create_key', (req, res) => {
    const { email, payment_id } = req.body;
    
    // 参数验证
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: '请输入有效的邮箱地址' });
    }
    
    // 模拟支付验证
    console.log(`💰 模拟支付验证: 邮箱=${email}, 支付ID=${payment_id || '测试支付'}`);
    
    // 生成并存储密钥
    const apiKey = generateApiKey();
    saveApiKey(email, apiKey);
    
    // 返回密钥给用户
    res.json({
        success: true,
        data: {
            api_key: apiKey,
            expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            call_limit: 100,
            api_endpoint: 'http://localhost:3000/api/exchange',
            usage_hint: '在请求头中添加: X-API-Key: ' + apiKey
        },
        message: '密钥已生成，请妥善保存。'
    });
});
// ==================== 密钥模块结束 ====================

// ========== 启动服务 ==========
app.listen(port, () => {
    console.log(`云织数据API服务已启动，端口：${port}`);
    console.log(`本地测试：http://localhost:${port}/api/exchange?from=USD&to=CNY`);
});