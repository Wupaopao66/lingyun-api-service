// =============== 邮件发送服务（真实SMTP） ===============
const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

const smtpConfig = {
    host: process.env.SMTP_HOST || 'smtp.exmail.qq.com',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
};

let transporter = null;
async function getTransporter() {
    if (!transporter) {
        transporter = nodemailer.createTransport(smtpConfig);
        await transporter.verify();
        console.log('✅ 邮件服务连接成功，发件人:', smtpConfig.auth.user);
    }
    return transporter;
}

async function sendApiKeyEmail(to, apiKey, plan, expiryDate) {
    try {
        const transporter = await getTransporter();
        
        const subject = '【灵云智体】您的API密钥已发放';
        const html = `
        <div style="max-width:600px; margin:0 auto; padding:20px; background:#f9fafc; border-radius:12px; font-family: 'Segoe UI', sans-serif;">
            <h2 style="color:#6A5ACD; border-bottom:2px solid #6A5ACD; padding-bottom:10px;">✨ 灵云智体 · API密钥发放通知</h2>
            <p style="font-size:16px; color:#2c3e50;">尊敬的开发者：</p>
            <p style="font-size:16px; color:#2c3e50;">感谢您使用灵云智体数据服务！您的订单已完成支付，API密钥已生成。</p>
            
            <div style="background:#edf2f7; padding:20px; border-radius:8px; margin:20px 0;">
                <p style="margin:5px 0;"><strong>🔑 API密钥：</strong></p>
                <p style="background:#fff; padding:12px; border-radius:6px; font-family:monospace; word-break:break-all; border:1px solid #cbd5e0;">${apiKey}</p>
                <p style="margin:10px 0 0;"><strong>📦 套餐类型：</strong> ${plan}</p>
                <p style="margin:5px 0;"><strong>⏳ 有效期限：</strong> ${new Date(expiryDate).toLocaleString('zh-CN')}</p>
                <p style="margin:5px 0;"><strong>📊 调用限额：</strong> ${plan === 'test' ? 10 : plan === 'daily' ? 100 : 1000} 次/日</p>
            </div>
            
            <p style="font-size:15px;"><strong>📘 使用说明：</strong></p>
            <ul style="background:#fff; padding:15px 30px; border-radius:6px; border:1px solid #e2e8f0;">
                <li>在请求头中添加： <code style="background:#edf2f7; padding:2px 6px; border-radius:4px;">X-API-Key: ${apiKey}</code></li>
                <li>接口文档： <a href="https://lingyunai.cn/docs" style="color:#6A5ACD;">https://lingyunai.cn/docs</a></li>
                <li>余额查询： <a href="https://lingyunai.cn/api/quota" style="color:#6A5ACD;">https://lingyunai.cn/api/quota</a></li>
            </ul>
            
            <p style="color:#718096; font-size:14px; margin-top:25px;">若您未进行此操作，请忽略本邮件。</p>
            <p style="color:#718096; font-size:14px;">灵云智体团队 · ${new Date().toLocaleDateString('zh-CN')}</p>
        </div>
        `;

        const mailOptions = {
            from: `"灵云智体" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
            to,
            subject,
            html
        };

        const info = await transporter.sendMail(mailOptions);
        console.log(`📧 邮件发送成功: ${to} (${info.messageId})`);

        // 日志路径：项目根目录/logs/
        const logDir = path.join(__dirname, '../../logs');
        await fs.mkdir(logDir, { recursive: true });
        const logFile = path.join(logDir, `emails_${new Date().toISOString().split('T')[0]}.log`);
        await fs.appendFile(logFile, `[${new Date().toISOString()}] TO: ${to} | APIKEY: ${apiKey} | PLAN: ${plan}\n`);

        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('❌ 邮件发送失败:', error.message);
        return { success: false, error: error.message };
    }
}

module.exports = { sendApiKeyEmail };