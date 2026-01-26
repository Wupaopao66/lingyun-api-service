const express = require('express');
const bodyParser = require('body-parser');
const bodyParserXml = require('body-parser-xml');

const app = express();

// 初始化XML解析
bodyParserXml(bodyParser);

// XML解析中间件
app.use(bodyParser.xml({
  limit: '1MB',
  xmlParseOptions: {
    normalize: true,
    normalizeTags: false,
    explicitArray: false
  }
}));

// 测试路由
app.post('/test_xml', (req, res) => {
  console.log('收到XML数据:', req.body);
  console.log('数据类型:', typeof req.body);
  console.log('数据详情:', JSON.stringify(req.body, null, 2));
  
  res.json({
    success: true,
    body: req.body,
    type: typeof req.body
  });
});

app.listen(3001, () => {
  console.log('✨ XML测试服务启动，端口：3001');
  console.log('测试命令：curl -X POST http://localhost:3001/test_xml -H "Content-Type: application/xml" -d \'<xml><test>hello</test></xml>\'');
});