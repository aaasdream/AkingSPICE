/**
 * 本地網頁伺服器啟動器
 * 運行一個簡單的 HTTP 伺服器來提供網頁模擬器
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const port = 8080;
const __dirname = process.cwd();

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    
    let filePath = '';
    if (req.url === '/' || req.url === '') {
        filePath = path.join(__dirname, 'buck-simulator-real.html');
    } else if (req.url === '/demo') {
        filePath = path.join(__dirname, 'buck-simulator-web.html');
    } else {
        filePath = path.join(__dirname, req.url);
    }
    
    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';
    
    fs.readFile(filePath, (error, content) => {
        if (error) {
            if(error.code == 'ENOENT') {
                // 檔案不存在，返回首頁
                fs.readFile(path.join(__dirname, 'buck-simulator-real.html'), (err, content) => {
                    if (err) {
                        res.writeHead(500);
                        res.end('Server Error');
                        return;
                    }
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(content, 'utf-8');
                });
            } else {
                res.writeHead(500);
                res.end(`Server Error: ${error.code}`);
            }
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(port, () => {
    console.log('🌟 JSSolver-PE 網頁模擬器已啟動!');
    console.log(`📱 請在瀏覽器中訪問:`);
    console.log(`   🔗 主要模擬器: http://localhost:${port}`);
    console.log(`   🔗 演示版本: http://localhost:${port}/demo`);
    console.log(`⚡ 伺服器運行在埠口 ${port}`);
    console.log('按 Ctrl+C 停止伺服器');
    
    // 自動打開瀏覽器
    exec(`start http://localhost:${port}`);
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`❌ 埠口 ${port} 已被占用，請嘗試其他埠口。`);
    } else {
        console.error('❌ 伺服器錯誤:', err);
    }
});