import http from 'http';
import fs from 'fs';
import path from 'path';

const PORT = 3003;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let filePath = '.' + req.url;
    
    if (filePath === './') {
        filePath = './LLC800to48Control.html';
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code == 'ENOENT') {
                res.writeHead(404);
                res.end('File not found: ' + filePath);
            } else {
                res.writeHead(500);
                res.end('Server error: ' + error.code);
            }
        } else {
            res.writeHead(200, { 'Content-Type': mimeType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`🔌 LLC 800V→48V 控制器演示服務器啟動`);
    console.log(`📱 請開啟瀏覽器訪問: http://localhost:${PORT}`);
    console.log(`⚡ 特色功能:`);
    console.log(`   • 800V±100V 輸入電壓波動模擬`);
    console.log(`   • 48V 精密電壓調節`);
    console.log(`   • PFM 頻率控制 (80-200kHz)`);
    console.log(`   • 實時波形顯示`);
    console.log(`   • Monaco 編輯器整合`);
    console.log(`🚀 準備展示 AkingSPICE LLC 控制技術!`);
});