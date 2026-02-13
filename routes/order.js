// =============== 订单管理路由模块 ===============
const express = require('express');
const path = require('path');
const fs = require('fs');

const orderManager = require('../services/order/manager');

const router = express.Router();

// ----- 1. 获取用户所有订单（用户中心）-----
router.get('/orders/user/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        if (!userId) return res.status(400).json({ code: 400, message: '用户ID不能为空' });

        const orders = await orderManager.getOrdersByUserId(userId);
        const orderList = orders.map(order => ({
            orderNo: order.orderNo,
            amount: order.amount,
            plan: order.plan,
            status: order.status,
            createTime: order.createTime,
            payTime: order.payTime || null,
            apiKey: order.apiKey || null,
            licenseExpireAt: order.licenseExpireAt || null,
            qrCodeImage: order.qrCodeImage || null
        }));

        res.json({ code: 200, message: '获取订单列表成功', data: { orders: orderList } });
    } catch (err) {
        console.error('获取用户订单失败:', err);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

// ----- 2. 订单状态查询（单笔）-----
router.get('/order/status/:orderNo', async (req, res) => {
    try {
        const orderNo = req.params.orderNo;
        if (!orderNo) return res.status(400).json({ code: 400, message: '订单号不能为空' });

        const order = await orderManager.getOrder(orderNo);
        if (!order) return res.status(404).json({ code: 404, message: '订单不存在' });

        res.json({
            code: 200,
            message: '获取订单状态成功',
            data: {
                orderNo: order.orderNo,
                status: order.status,
                amount: order.amount,
                payTime: order.payTime || null,
                apiKey: order.apiKey || null,
                licenseExpireAt: order.licenseExpireAt || null
            }
        });
    } catch (err) {
        console.error('订单状态查询失败:', err);
        res.status(500).json({ code: 500, message: '服务器错误' });
    }
});

// ----- 3. 调试：最近10条订单（仅本地）-----
function isLocalIp(ip) {
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

router.get('/debug/orders', async (req, res) => {
    if (!isLocalIp(req.ip)) {
        return res.status(403).json({ code: 403, message: '仅本地访问' });
    }
    try {
        const ordersDir = path.join(__dirname, '../database/orders');
        if (!fs.existsSync(ordersDir)) {
            return res.json({ code: 200, data: [] });
        }
        const files = fs.readdirSync(ordersDir).filter(f => f.endsWith('.json')).sort().reverse().slice(0, 10);
        const orders = [];
        for (const file of files) {
            try {
                const content = fs.readFileSync(path.join(ordersDir, file), 'utf8');
                orders.push(JSON.parse(content));
            } catch {}
        }
        res.json({ code: 200, data: orders });
    } catch (err) {
        res.status(500).json({ code: 500, message: '读取失败' });
    }
});

module.exports = router;