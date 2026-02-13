// =============== 套餐定价配置（单位：分） ===============
// 1元 = 100分，所有价格均为微信支付最小单位

module.exports = {
    // ---------- 全能套餐（汇率+天气）----------
    /** 日卡：1.9元 */
    dual_daily: 190,
    /** 月卡：29.9元 */
    dual_monthly: 2990,
    /** 年卡：288元 */
    dual_yearly: 28800,

    // ---------- 短链接独立套餐 ----------
    /** 月卡：9.9元 */
    shorten_monthly: 990,
    /** 年卡：88元 */
    shorten_yearly: 8800,

    // ---------- 拼多多按次（过渡）----------
    /** 单次：未开放 */
    pdd_per_request: 2,

    /**
     * 根据套餐标识获取金额（分）
     * @param {string} plan - 套餐标识
     * @returns {number} 金额（分）
     */
    getAmountByPlan(plan) {
        const planMap = {
            // 全能套餐
            'dual_daily': this.dual_daily,
            'dual_monthly': this.dual_monthly,
            'dual_yearly': this.dual_yearly,
            // 短链接套餐
            'shorten_monthly': this.shorten_monthly,
            'shorten_yearly': this.shorten_yearly,
            // 拼多多
            'pdd_per_request': this.pdd_per_request,
            // 兼容旧版plan值（过渡期）
            'test': this.dual_daily,
            'daily': this.dual_daily,
            'monthly': this.dual_monthly,
            'yearly': this.dual_yearly,
            'rate': this.dual_daily,
            'weather': this.dual_daily,
            'pdd': this.pdd_per_request
        };

        const amount = planMap[plan];
        if (amount === undefined) {
            console.warn(`⚠️ 未知套餐标识: ${plan}，使用默认日卡价格`);
            return this.dual_daily;
        }
        return amount;
    },

    /**
     * 获取套餐显示名称
     * @param {string} plan - 套餐标识
     * @returns {string} 显示名称
     */
    getPlanDisplayName(plan) {
        const names = {
            'dual_daily': '全能日卡',
            'dual_monthly': '全能月卡',
            'dual_yearly': '全能年卡',
            'shorten_monthly': '短链接月卡',
            'shorten_yearly': '短链接年卡',
            'pdd_per_request': '拼多多单次',
            'daily': '全能日卡（旧）',
            'monthly': '全能月卡（旧）',
            'yearly': '全能年卡（旧）',
            'test': '测试日卡',
            'rate': '汇率单次',
            'weather': '天气单次',
            'pdd': '拼多多单次'
        };
        return names[plan] || plan;
    }
};