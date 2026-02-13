// =============== 微信支付配置（从环境变量读取） ===============
const path = require('path');

const wechatConfig = {
    // 微信支付商户号
    MCHID: process.env.WECHAT_MCHID,
    // 小程序/公众号 AppID
    APPID: process.env.WECHAT_APPID,
    // APIv3 密钥（32位）
    API_V3_KEY: process.env.WECHAT_API_V3_KEY,
    // 商户证书序列号
    SERIAL_NO: process.env.WECHAT_SERIAL_NO,
    // 商户私钥路径（默认指向项目根目录的 apiclient_key.pem）
    PRIVATE_KEY_PATH: process.env.WECHAT_PRIVATE_KEY_PATH || path.join(__dirname, '../apiclient_key.pem')
};

module.exports = wechatConfig;