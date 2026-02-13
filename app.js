// =============== 灵云系统 - 主程序（路由模块化版） ===============
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// 路由模块
const wechatRoutes = require('./routes/wechat');
const orderRoutes = require('./routes/order');

const app = express();
const HTTP_PORT = 80;
const HTTPS_PORT = 443;
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'lingyunai.cn';

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

// ===================== SSL 证书配置（ssl目录）=====================
const SSL_CONFIG = {
    key: fs.readFileSync(path.join(__dirname, 'ssl/lingyunai.cn.key'), 'utf8'),
    cert: fs.readFileSync(path.join(__dirname, 'ssl/lingyunai.cn_bundle.crt'), 'utf8')
};

console.log('🔐 SSL证书加载状态:');
console.log('  密钥文件:', fs.existsSync(path.join(__dirname, 'ssl/lingyunai.cn.key')) ? '✅ 存在' : '❌ 缺失');
console.log('  证书文件:', fs.existsSync(path.join(__dirname, 'ssl/lingyunai.cn_bundle.crt')) ? '✅ 存在' : '❌ 缺失');

// ===================== 挂载路由 =====================
app.use('/api', wechatRoutes);      // 微信支付相关接口
app.use('/api', orderRoutes);      // 订单相关接口

// ===================== 健康检查 =====================
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        time: new Date().toISOString(),
        version: '4.0',
        service: 'lingyun-pay'
    });
});

// 本地IP检测
function isLocalIp(ip) {
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

// 调试：最近10条回调记录（仅本地）
app.get('/debug/callbacks', (req, res) => {
    if (!isLocalIp(req.ip)) {
        return res.status(403).json({ code: 403, message: '仅本地访问' });
    }
    const callbackDir = path.join(__dirname, 'database/callbacks');
    if (!fs.existsSync(callbackDir)) {
        return res.json({ code: 200, data: [] });
    }
    const files = fs.readdirSync(callbackDir).sort().reverse().slice(0, 10);
    const callbacks = files.map(file => {
        try {
            const content = fs.readFileSync(path.join(callbackDir, file), 'utf8');
            return JSON.parse(content);
        } catch {
            return null;
        }
    }).filter(Boolean);
    res.json({ code: 200, data: callbacks });
});

// ===================== 根路由 =====================
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// ===================== 启动服务器 =====================
const httpsServer = https.createServer(SSL_CONFIG, app);
const httpServer = http.createServer((req, res) => {
    res.writeHead(301, { Location: `https://${req.headers.host}${req.url}` });
    res.end();
});

httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
    console.log('\n' + '🚀'.repeat(60));
    console.log('🎉 灵云支付服务启动成功 - 路径修正版');
    console.log('🚀'.repeat(60));
    console.log(`🔐 HTTPS服务器: https://${PUBLIC_DOMAIN}`);
    console.log(`🔐 监听端口: ${HTTPS_PORT}`);
    console.log('🚀'.repeat(60));
    console.log('\n✅ 微信支付路由 → routes/wechat.js');
    console.log('✅ 订单管理路由 → routes/order.js');
    console.log('✅ 静态服务 /public');
    console.log('✅ 健康检查 /health');
    console.log('✅ 调试接口 /debug/callbacks, /debug/orders');
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