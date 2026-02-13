// =============== API密钥生成服务 ===============
const crypto = require('crypto');

/**
 * 生成唯一API密钥
 * @param {string} userId - 用户ID（邮箱或匿名ID）
 * @param {string} plan - 套餐类型（test/daily/monthly）
 * @returns {string} 格式: ly_套餐_用户ID_时间戳_随机串
 */
function generateApiKey(userId, plan = 'test') {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex'); // 8位随机十六进制
    return `ly_${plan}_${userId}_${timestamp}_${random}`;
}

/**
 * 根据套餐计算过期时间
 * @param {string} plan - 套餐类型
 * @returns {string} ISO格式过期时间
 */
function calculateExpiry(plan) {
    const now = new Date();
    switch (plan) {
        case 'test':
            return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7天
        case 'daily':
            return new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString(); // 1天
        case 'monthly':
            return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30天
        default:
            return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }
}

/**
 * 根据套餐获取每日调用限额
 * @param {string} plan 
 * @returns {number}
 */
function getCallLimit(plan) {
    switch (plan) {
        case 'test': return 10;
        case 'daily': return 100;
        case 'monthly': return 1000;
        default: return 100;
    }
}

module.exports = {
    generateApiKey,
    calculateExpiry,
    getCallLimit
};