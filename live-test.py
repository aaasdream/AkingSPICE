#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AkingSPICE 即時測試驗證
直接在終端中顯示網頁測試結果
"""

import subprocess
import time
import threading
import sys
import json
import signal
import webbrowser
from pathlib import Path

def signal_handler(sig, frame):
    """處理Ctrl+C中斷"""
    print('\n⏹️ 測試被用戶中斷')
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)

class LiveTestMonitor:
    def __init__(self):
        self.test_results = []
        self.test_logs = []
        self.test_completed = False
        self.last_update = None
        self.stats = {'passed': 0, 'failed': 0, 'total': 0}
        
    def log_message(self, message, level='info'):
        """處理日誌訊息"""
        timestamp = time.strftime('%H:%M:%S')
        
        level_colors = {
            'info': '\033[36m',     # 青色
            'success': '\033[32m',  # 綠色
            'error': '\033[31m',    # 紅色
            'warning': '\033[33m',  # 黃色
        }
        
        color = level_colors.get(level, '\033[37m')
        reset = '\033[0m'
        
        print(f"{color}[{timestamp}] {message}{reset}")
        
    def test_result(self, name, category, status, duration, error, note):
        """處理測試結果"""
        self.test_results.append({
            'name': name,
            'category': category,
            'status': status,
            'duration': duration,
            'error': error,
            'note': note
        })
        
        if status == 'passed':
            self.stats['passed'] += 1
        elif status == 'failed':
            self.stats['failed'] += 1
        
        # 顯示測試結果
        status_symbols = {
            'passed': '✅',
            'failed': '❌',
            'running': '🔄'
        }
        
        symbol = status_symbols.get(status, '⚪')
        duration_str = f"({duration}ms)" if duration else ""
        
        print(f"  {symbol} {name} {duration_str}")
        
        if error:
            print(f"    \033[31m錯誤: {error}\033[0m")
        
        if note:
            print(f"    \033[33m備註: {note}\033[0m")
    
    def test_complete(self, summary):
        """處理測試完成"""
        self.test_completed = True
        self.stats.update(summary)
        
        print(f"\n🎉 測試執行完成!")
        print(f"📊 總結果:")
        print(f"   總測試數: {summary.get('total', 0)}")
        print(f"   通過: {summary.get('passed', 0)}")
        print(f"   失敗: {summary.get('failed', 0)}")
        print(f"   成功率: {summary.get('success_rate', 0)}%")

def run_live_test():
    """執行即時測試監控"""
    
    print("🔬 AkingSPICE 即時測試監控")
    print("=" * 50)
    
    monitor = LiveTestMonitor()
    
    # 啟動HTTP服務器
    print("🌐 啟動HTTP服務器...")
    try:
        http_process = subprocess.Popen(
            [sys.executable, '-m', 'http.server', '8080'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=Path.cwd()
        )
        time.sleep(2)
        
        if http_process.poll() is None:
            print("✅ HTTP服務器已啟動 (port 8080)")
        else:
            print("❌ HTTP服務器啟動失敗")
            return False
            
    except Exception as e:
        print(f"❌ HTTP服務器錯誤: {e}")
        return False
    
    # 啟動簡化版監控服務器
    print("📡 啟動測試監控...")
    
    from http.server import HTTPServer, BaseHTTPRequestHandler
    from urllib.parse import urlparse
    import json as json_module
    
    class SimpleTestReceiver(BaseHTTPRequestHandler):
        def do_OPTIONS(self):
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.end_headers()

        def do_POST(self):
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                data = json_module.loads(post_data.decode('utf-8'))
                
                if self.path == '/log':
                    monitor.log_message(data.get('message', ''), data.get('level', 'info'))
                elif self.path == '/test-result':
                    monitor.test_result(
                        data.get('name'),
                        data.get('category'),
                        data.get('status'),
                        data.get('duration'),
                        data.get('error'),
                        data.get('note')
                    )
                elif self.path == '/test-complete':
                    monitor.test_complete(data)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b'{"status": "ok"}')
                
            except Exception as e:
                print(f"處理請求錯誤: {e}")
                self.send_response(500)
                self.end_headers()

        def log_message(self, format, *args):
            # 抑制HTTP服務器日誌
            pass
    
    monitor_server = HTTPServer(('localhost', 8081), SimpleTestReceiver)
    
    def run_monitor_server():
        monitor_server.serve_forever()
    
    monitor_thread = threading.Thread(target=run_monitor_server)
    monitor_thread.daemon = True
    monitor_thread.start()
    
    print("✅ 測試監控已啟動 (port 8081)")
    
    # 開啟測試頁面
    test_url = "http://localhost:8080/automated-test.html?autorun=true"
    
    print(f"\n🚀 開啟測試頁面...")
    print(f"🌐 測試URL: {test_url}")
    
    try:
        webbrowser.open(test_url)
        print("✅ 瀏覽器已開啟")
    except Exception as e:
        print(f"⚠️ 無法開啟瀏覽器: {e}")
        print(f"請手動開啟: {test_url}")
    
    print("\n📋 等待測試執行...")
    print("💡 測試會自動執行，結果將即時顯示")
    print("-" * 50)
    
    # 等待測試完成
    start_time = time.time()
    timeout = 180  # 3分鐘
    
    while not monitor.test_completed and (time.time() - start_time) < timeout:
        time.sleep(1)
        
        # 每10秒顯示一次進度
        if int(time.time() - start_time) % 10 == 0 and len(monitor.test_results) > 0:
            total = len(monitor.test_results)
            passed = monitor.stats['passed']
            failed = monitor.stats['failed']
            print(f"\n📊 當前進度: {total}個測試 | ✅{passed} ❌{failed}")
    
    # 清理
    try:
        http_process.terminate()
        monitor_server.shutdown()
    except:
        pass
    
    if monitor.test_completed:
        print("\n" + "=" * 60)
        print("🎊 AkingSPICE 測試驗證完成!")
        
        # 按分類顯示結果
        categories = {}
        for result in monitor.test_results:
            cat = result['category']
            if cat not in categories:
                categories[cat] = {'passed': 0, 'failed': 0, 'tests': []}
            
            categories[cat]['tests'].append(result)
            if result['status'] == 'passed':
                categories[cat]['passed'] += 1
            else:
                categories[cat]['failed'] += 1
        
        print(f"\n📋 詳細結果:")
        for cat, stats in categories.items():
            total_cat = stats['passed'] + stats['failed']
            rate = (stats['passed'] / total_cat * 100) if total_cat > 0 else 0
            print(f"\n🔸 {cat.upper()}: {stats['passed']}/{total_cat} ({rate:.0f}%)")
            
            # 只顯示失敗的測試
            failed_tests = [t for t in stats['tests'] if t['status'] == 'failed']
            if failed_tests:
                for test in failed_tests:
                    print(f"   ❌ {test['name']}: {test.get('error', 'Unknown error')}")
        
        # 最終評估
        success_rate = (monitor.stats['passed'] / len(monitor.test_results) * 100) if monitor.test_results else 0
        
        print(f"\n🎯 最終評估:")
        if success_rate >= 90:
            print("🌟 優秀! AkingSPICE所有功能運作正常")
        elif success_rate >= 80:
            print("✅ 良好! 大部分功能正常，少數問題")
        elif success_rate >= 60:
            print("⚠️ 中等! 存在一些需要注意的問題")
        else:
            print("🔴 較差! 發現多個問題，需要檢查")
        
        return success_rate >= 70
        
    else:
        print(f"\n⏰ 測試執行超時 (等待了{timeout}秒)")
        if monitor.test_results:
            print(f"已收到 {len(monitor.test_results)} 個測試結果")
        else:
            print("沒有收到任何測試結果，可能瀏覽器無法載入頁面")
        
        return False

if __name__ == "__main__":
    print("⚡ 按 Ctrl+C 可隨時中斷測試")
    print()
    
    success = run_live_test()
    
    if success:
        print(f"\n✅ AkingSPICE 功能驗證通過!")
    else:
        print(f"\n❌ AkingSPICE 功能驗證未完全通過")
    
    sys.exit(0 if success else 1)