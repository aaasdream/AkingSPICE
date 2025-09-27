import http from 'http';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const port = 8081;

// MIME 類型映射
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
    
    let filePath = path.join(__dirname, req.url === '/' ? 'buck-standalone.html' : req.url);
    
    // 安全檢查
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }
    
    // 檢查文件是否存在
    fs.access(filePath, fs.constants.F_OK, (err) => {
        if (err) {
            res.writeHead(404);
            res.end('File not found');
            return;
        }
        
        // 獲取文件擴展名
        const extname = path.extname(filePath).toLowerCase();
        const contentType = mimeTypes[extname] || 'application/octet-stream';
        
        // 讀取並發送文件
        fs.readFile(filePath, (err, content) => {
            if (err) {
                res.writeHead(500);
                res.end('Server error');
                return;
            }
            
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Cache-Control': 'no-cache'
            });
            res.end(content, 'utf-8');
        });
    });
});

server.listen(port, () => {
    console.log(`🚀 AkingSPICE Buck 實戰服務器已啟動`);
    console.log(`📋 網址: http://localhost:${port}`);
    console.log(`📁 服務目錄: ${__dirname}`);
    console.log(`⚡ 使用打包後的 AkingSPICE library`);
    
    // 自動打開瀏覽器 (可選)
    exec(`start http://localhost:${port}`, (err) => {
        if (err && process.platform !== 'win32') {
            console.log(`請手動打開: http://localhost:${port}`);
        }
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`端口 ${port} 已被使用`);
        process.exit(1);
    } else {
        console.error('服務器錯誤:', err);
    }
});