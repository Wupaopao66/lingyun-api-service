const AlipaySdk = require('alipay-sdk').default;
const AlipayFormData = require('alipay-sdk/lib/form').default;

// 初始化支付宝SDK
const alipaySdk = new AlipaySdk({
  appId: process.env.ALIPAY_APP_ID || '9021000159658018',
  privateKey: process.env.ALIPAY_PRIVATE_KEY || '',
  signType: 'RSA2',
  gateway: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
});

// 发起电脑网站支付
async function createWebPayment(orderData) {
  const formData = new AlipayFormData();
  
  // 关键配置：notify_url在这里设置
  formData.setMethod('get');
  formData.addField('notifyUrl', 'https://你的Vercel应用名.vercel.app/api/alipay_callback');
  formData.addField('bizContent', {
    outTradeNo: orderData.out_trade_no,
    totalAmount: orderData.total_amount,
    subject: orderData.subject,
    productCode: 'FAST_INSTANT_TRADE_PAY',
  });

  const result = await alipaySdk.exec(
    'alipay.trade.page.pay',
    {},
    { formData: formData }
  );

  return result;
}

module.exports = { createWebPayment };