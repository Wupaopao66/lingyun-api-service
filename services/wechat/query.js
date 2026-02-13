const https = require('https');
const crypto = require('crypto');
const wechatConfig = require('../../config/wechat');

// 加载商户私钥
const fs = require('fs');
const PRIVATE_KEY = fs.readFileSync(wechatConfig.PRIVATE_KEY_PATH, 'utf8');
const PRIVATE_KEY_OBJ = crypto.createPrivateKey(PRIVATE_KEY);

// 生成V3签名
function generateSignature(method, url, timestamp, nonce, body = '') {
    const signStr = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
    const sign = crypto.sign('sha256', Buffer.from(signStr), {
        key: PRIVATE_KEY_OBJ,
        padding: crypto.constants.RSA_PKCS1_PADDING
    });
    return sign.toString('base64');
}

// 查询订单（V3接口）
async function queryOrder(outTradeNo) {
    const url = `/v3/pay/transactions/out-trade-no/${outTradeNo}?mchid=${wechatConfig.MCHID}`;
    const method = 'GET';
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const signature = generateSignature(method, url, timestamp, nonce);

    const options = {
        hostname: 'api.mch.weixin.qq.com',
        port: 443,
        path: url,
        method: 'GET',
        headers: {
            'Authorization': `WECHATPAY2-SHA256-RSA2048 mchid="${wechatConfig.MCHID}",nonce_str="${nonce}",signature="${signature}",timestamp="${timestamp}",serial_no="${wechatConfig.SERIAL_NO}"`,
            'Accept': 'application/json',
            'User-Agent': 'LingyunPay/1.0.0'
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (res.statusCode === 200) {
                        resolve({
                            success: true,
                            outTradeNo: result.out_trade_no,
                            transactionId: result.transaction_id,
                            tradeState: result.trade_state,
                            amount: result.amount?.total,
                            successTime: result.success_time,
                            payerOpenid: result.payer?.openid
                        });
                    } else {
                        reject(new Error(`查询失败[${res.statusCode}]: ${result.message || '未知错误'}`));
                    }
                } catch (err) {
                    reject(new Error(`解析响应失败: ${err.message}`));
                }
            });
        });
        req.on('error', reject);
        req.end();
    });
}

module.exports = { queryOrder };