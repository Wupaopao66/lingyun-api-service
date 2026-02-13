// =============== 微信支付路由模块 ===============
const express = require('express');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

const wechatConfig = require('../config/wechat');
const pricing = require('../config/pricing');          // ✅ 定价配置
const { queryOrder } = require('../services/wechat/query');
const orderManager = require('../services/order/manager');
const licenseGenerator = require('../services/license/generator');
const licenseStorage = require('../services/license/storage');
const emailSender = require('../services/email/sender');

const router = express.Router();
const PUBLIC_DOMAIN = process.env.PUBLIC_DOMAIN || 'lingyunai.cn';

// ----- 商户私钥加载 -----
function readFileContent(filePath) {
    try { return fs.readFileSync(filePath, 'utf8'); } catch { return null; }
}
const PRIVATE_KEY = readFileContent(wechatConfig.PRIVATE_KEY_PATH);
const PRIVATE_KEY_OBJ = crypto.createPrivateKey(PRIVATE_KEY);

// ----- 微信支付签名 -----
function generateWechatPaySignature(method, url, timestamp, nonce, body = '') {
    const signStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
    const sign = crypto.sign('sha256', Buffer.from(signStr), {
        key: PRIVATE_KEY_OBJ,
        padding: crypto.constants.RSA_PKCS1_PADDING
    });
    return sign.toString('base64');
}

// ----- 发送微信支付请求 -----
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
            res.on('data', chunk => responseData += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(responseData);
                    if (res.statusCode >= 400) {
                        reject(new Error(`微信支付API错误(${res.statusCode}): ${result.message || '未知'}`));
                        return;
                    }
                    resolve(result);
                } catch (err) {
                    reject(new Error(`解析响应失败: ${err.message}`));
                }
            });
        });
        req.on('error', reject);
        req.write(bodyStr);
        req.end();
    });
}

// ----- 1. 生成支付二维码（金额从定价配置读取）-----
router.post('/payment/generate-link', async (req, res) => {
    try {
        const { userId, plan = 'dual_daily', email } = req.body;
        
        if (!userId) return res.status(400).json({ code: 400, message: '请输入用户ID' });
        if (!email) return res.status(400).json({ code: 400, message: '请输入邮箱，用于接收密钥' });
        
        const amount = pricing.getAmountByPlan(plan);
        
        // 防重：5分钟内是否有未支付订单
        const recentOrders = await orderManager.getOrdersByUserId(userId);
        const pendingOrder = recentOrders.find(o => 
            o.plan === plan && 
            o.amount === amount && 
            o.status === 'pending' && 
            (Date.now() - new Date(o.createTime).getTime()) < 5 * 60 * 1000
        );
        
        if (pendingOrder) {
            console.log(`🔄 复用未支付订单: ${pendingOrder.orderNo}, 用户: ${userId}, 套餐: ${plan}`);
            return res.json({
                code: 200,
                message: '您有未支付的订单，请继续支付',
                data: {
                    userId,
                    dynamicLink: pendingOrder.codeUrl,
                    qrCodeImage: pendingOrder.qrCodeImage,
                    orderId: pendingOrder.orderNo,
                    amount: pendingOrder.amount,
                    plan: pendingOrder.plan,
                    createTime: pendingOrder.createTime,
                    status: pendingOrder.status,
                    email: pendingOrder.email
                }
            });
        }

        const outTradeNo = `PAY${Date.now()}${Math.random().toString().slice(2, 6)}`.slice(0, 32);
        const notifyUrl = `https://${PUBLIC_DOMAIN}/api/wechatpay/callback/${outTradeNo}`;

        const orderData = {
            appid: wechatConfig.APPID,
            mchid: wechatConfig.MCHID,
            out_trade_no: outTradeNo,
            amount: { 
                total: amount,
                currency: 'CNY' 
            },
            description: `灵云智体-${pricing.getPlanDisplayName(plan)}`,
            attach: JSON.stringify({ userId, plan, email }),
            notify_url: notifyUrl
            // ✅ 已删除 time_expire 字段，使用微信默认2小时有效期
        };

        console.log(`📤 调用微信支付统一下单API，套餐: ${plan}, 金额: ${amount}分`);
        const result = await sendWechatPayRequest('/v3/pay/transactions/native', orderData);

        let qrCodeImage = '';
        try {
            qrCodeImage = await qrcode.toDataURL(result.code_url);
        } catch (qrErr) {
            console.warn('⚠️ 二维码生成失败:', qrErr.message);
        }

        const order = await orderManager.createOrder({
            orderNo: outTradeNo,
            userId,
            email,
            amount,
            plan,
            description: `灵云智体-${pricing.getPlanDisplayName(plan)}`,
            codeUrl: result.code_url,
            qrCodeImage
        });

        console.log(`✅ 订单创建成功: ${outTradeNo}, 用户: ${userId}, 套餐: ${plan}, 金额: ${amount}分, 邮箱: ${email}`);

        res.json({
            code: 200,
            message: '🎉 微信支付二维码生成成功',
            data: {
                userId,
                dynamicLink: result.code_url,
                qrCodeImage,
                orderId: outTradeNo,
                amount: order.amount,
                plan: order.plan,
                createTime: order.createTime,
                status: order.status,
                email: order.email
            }
        });
    } catch (err) {
        console.error('❌ 微信支付生成错误:', err.message);
        res.status(500).json({ code: 500, message: `生成失败：${err.message}` });
    }
});

// ----- 2. 微信支付回调（自动发货）-----
router.post('/wechatpay/callback/:orderNo', async (req, res) => {
    const orderNo = req.params.orderNo;
    console.log('\n' + '='.repeat(80));
    console.log(`📞 收到微信支付回调，订单号: ${orderNo}`);
    console.log('='.repeat(80));

    try {
        // 保存回调记录
        const callbackDir = path.join(__dirname, '../database/callbacks');
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

        res.set('Content-Type', 'application/json');
        res.status(200).json({ code: 'SUCCESS', message: '成功' });

        setTimeout(async () => {
            try {
                const orderInfo = await queryOrder(orderNo);
                if (orderInfo.tradeState === 'SUCCESS') {
                    console.log(`✅ 订单支付成功确认: ${orderNo}`);
                    console.log(`   金额: ${orderInfo.amount} 分`);
                    console.log(`   微信交易号: ${orderInfo.transactionId}`);
                    console.log(`   支付时间: ${orderInfo.successTime}`);

                    const order = await orderManager.getOrder(orderNo);
                    if (!order) {
                        console.error(`❌ 本地订单不存在: ${orderNo}`);
                        return;
                    }

                    const apiKey = licenseGenerator.generateApiKey(order.userId, order.plan);
                    const expiresAt = licenseGenerator.calculateExpiry(order.plan);
                    const callLimit = licenseGenerator.getCallLimit(order.plan);
                    console.log(`🔑 生成API密钥: ${apiKey}`);

                    const licenseData = {
                        apiKey,
                        userId: order.userId,
                        orderNo: order.orderNo,
                        plan: order.plan,
                        amount: order.amount,
                        transactionId: orderInfo.transactionId,
                        payTime: orderInfo.successTime,
                        expiresAt,
                        callLimit
                    };
                    await licenseStorage.saveLicense(licenseData);

                    await orderManager.updateOrder(orderNo, {
                        status: 'paid',
                        transactionId: orderInfo.transactionId,
                        payTime: orderInfo.successTime,
                        paidAmount: orderInfo.amount,
                        apiKey,
                        licenseExpireAt: expiresAt
                    });

                    if (order.email) {
                        await emailSender.sendApiKeyEmail(
                            order.email,
                            apiKey,
                            order.plan,
                            expiresAt
                        );
                        console.log(`📧 密钥邮件已发送至: ${order.email}`);
                    } else {
                        console.warn(`⚠️ 订单 ${orderNo} 无邮箱地址，邮件发送已跳过`);
                    }

                    console.log(`🎉 自动发货完成！订单: ${orderNo}, 用户: ${order.userId}`);
                } else {
                    console.log(`⚠️ 订单 ${orderNo} 状态: ${orderInfo.tradeState}，暂未支付成功`);
                }
            } catch (queryErr) {
                console.error(`❌ 主动查询/自动发货失败: ${orderNo}`, queryErr.message);
            }
        }, 3000);

    } catch (err) {
        console.error('❌ 回调处理异常:', err.message);
        res.set('Content-Type', 'application/json');
        res.status(200).json({ code: 'SUCCESS', message: '成功' });
    }
});

// ----- 3. 二维码查询接口 -----
router.get('/payment/qrcode/:orderNo', async (req, res) => {
    try {
        const orderNo = req.params.orderNo;
        const order = await orderManager.getOrder(orderNo);
        if (!order) {
            return res.status(404).json({ code: 404, message: '订单不存在' });
        }
        if (!order.qrCodeImage) {
            return res.status(404).json({ code: 404, message: '二维码不存在' });
        }
        res.json({
            code: 200,
            message: '获取二维码成功',
            data: {
                orderNo: order.orderNo,
                qrCodeImage: order.qrCodeImage
            }
        });
    } catch (err) {
        console.error('获取二维码失败:', err);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

// ----- 4. 订单查询接口（通过userId获取最新订单）-----
router.get('/payment/query/:userId', async (req, res) => {
    const userId = req.params.userId;
    try {
        const order = await orderManager.getLatestOrderByUserId(userId);
        if (!order) {
            return res.json({ code: 404, message: '未找到该用户的支付订单' });
        }
        res.json({
            code: 200,
            message: '订单查询成功',
            data: {
                orderId: order.orderNo,
                userId: order.userId,
                amount: order.amount,
                status: order.status,
                createTime: order.createTime,
                payTime: order.payTime,
                transactionId: order.transactionId,
                apiKey: order.apiKey || null,
                licenseExpireAt: order.licenseExpireAt || null
            }
        });
    } catch (err) {
        console.error('订单查询错误:', err);
        res.status(500).json({ code: 500, message: '查询失败' });
    }
});

// ----- 5. 支付验证接口 -----
router.post('/payment/verify', async (req, res) => {
    try {
        const { userId, orderId } = req.body;
        if (!userId || !orderId) {
            return res.status(400).json({ code: 400, message: '缺少参数' });
        }

        const order = await orderManager.getOrder(orderId);
        if (!order) {
            return res.json({ code: 404, message: '订单不存在', data: { verified: false } });
        }

        if (order.status === 'paid') {
            return res.json({
                code: 200,
                message: '验证成功',
                data: {
                    verified: true,
                    orderInfo: {
                        orderId: order.orderNo,
                        status: order.status,
                        apiKey: order.apiKey,
                        payTime: order.payTime
                    }
                }
            });
        }

        res.json({
            code: 200,
            message: '等待支付确认',
            data: {
                verified: false,
                needManual: false,
                orderInfo: { status: order.status }
            }
        });
    } catch (err) {
        console.error('验证接口错误:', err);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

module.exports = router;