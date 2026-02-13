// =============== 订单管理服务（文件存储） ===============
const fs = require('fs').promises;
const path = require('path');

const ORDERS_DIR = path.join(__dirname, '../../database/orders');

// 确保订单目录存在
async function ensureOrdersDir() {
    try {
        await fs.access(ORDERS_DIR);
    } catch {
        await fs.mkdir(ORDERS_DIR, { recursive: true });
    }
}

// 生成订单号（与支付接口保持一致）
function generateOrderNo() {
    return `PAY${Date.now()}${Math.random().toString().slice(2, 6)}`.slice(0, 32);
}

// 创建订单（增加 email 字段）
async function createOrder(orderData) {
    await ensureOrdersDir();
    const orderNo = orderData.orderNo || generateOrderNo();
    const order = {
        orderNo,
        userId: orderData.userId,
        email: orderData.email || null,  // ✅ 新增字段，存储用户邮箱
        amount: orderData.amount,        // 单位：分
        plan: orderData.plan || 'test',  // 套餐类型
        description: orderData.description || '灵云系统服务费用',
        status: 'pending',              // pending / paid / failed / expired
        createTime: new Date().toISOString(),
        codeUrl: orderData.codeUrl || '',
        qrCodeImage: orderData.qrCodeImage || '',
        // 以下字段支付成功后补充
        transactionId: null,
        payTime: null,
        apiKey: null,
        licenseExpireAt: null
    };

    const filePath = path.join(ORDERS_DIR, `${orderNo}.json`);
    await fs.writeFile(filePath, JSON.stringify(order, null, 2));
    return order;
}

// 根据订单号查询订单
async function getOrder(orderNo) {
    await ensureOrdersDir();
    const filePath = path.join(ORDERS_DIR, `${orderNo}.json`);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        return null; // 订单不存在
    }
}

// 更新订单字段
async function updateOrder(orderNo, updates) {
    const order = await getOrder(orderNo);
    if (!order) throw new Error(`订单不存在: ${orderNo}`);
    
    const updatedOrder = { ...order, ...updates, orderNo }; // 防止修改订单号
    const filePath = path.join(ORDERS_DIR, `${orderNo}.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedOrder, null, 2));
    return updatedOrder;
}

// 更新订单状态（便捷方法）
async function updateOrderStatus(orderNo, status, additionalData = {}) {
    return updateOrder(orderNo, { status, ...additionalData });
}

// 根据用户ID查询所有订单（返回按时间倒序）
async function getOrdersByUserId(userId) {
    await ensureOrdersDir();
    const files = await fs.readdir(ORDERS_DIR);
    const orders = [];
    
    for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const filePath = path.join(ORDERS_DIR, file);
        try {
            const data = await fs.readFile(filePath, 'utf8');
            const order = JSON.parse(data);
            if (order.userId === userId) {
                orders.push(order);
            }
        } catch (err) {
            console.error(`读取订单文件失败: ${file}`, err.message);
        }
    }
    
    // 按创建时间倒序
    return orders.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
}

// 获取最近一条订单（用于快速查询）
async function getLatestOrderByUserId(userId) {
    const orders = await getOrdersByUserId(userId);
    return orders.length > 0 ? orders[0] : null;
}

module.exports = {
    createOrder,
    getOrder,
    updateOrder,
    updateOrderStatus,
    getOrdersByUserId,
    getLatestOrderByUserId
};