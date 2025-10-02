#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AkingSPICE 網頁測試結果接收器
自動接收並分析來自瀏覽器的測試執行結果
"""

import json
import time
import threading
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import webbrowser
import os
import sys

class TestResultReceiver(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        """處理CORS預檢請求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        """處理GET請求 - 提供測試頁面或狀態查詢"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/status':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            status = {
                'server_running': True,
                'tests_received': len(self.server.test_logs),
                'last_update': self.server.last_update.isoformat() if self.server.last_update else None
            }
            
            self.wfile.write(json.dumps(status, ensure_ascii=False).encode('utf-8'))
            
        elif parsed_path.path == '/results':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            self.wfile.write(json.dumps(self.server.test_results, ensure_ascii=False, indent=2).encode('utf-8'))
            
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        """處理POST請求 - 接收測試結果"""
        parsed_path = urlparse(self.path)
        
        if parsed_path.path == '/log':
            self.handle_log()
        elif parsed_path.path == '/test-result':
            self.handle_test_result()
        elif parsed_path.path == '/test-complete':
            self.handle_test_complete()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_log(self):
        """處理日誌訊息"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            timestamp = datetime.now().strftime('%H:%M:%S.%f')[:-3]
            log_entry = {
                'timestamp': timestamp,
                'level': data.get('level', 'info'),
                'message': data.get('message', ''),
                'category': data.get('category', 'general')
            }
            
            self.server.test_logs.append(log_entry)
            self.server.last_update = datetime.now()
            
            # 即時輸出到控制台
            level_colors = {
                'info': '\033[36m',     # 青色
                'success': '\033[32m',  # 綠色
                'error': '\033[31m',    # 紅色
                'warning': '\033[33m',  # 黃色
                'debug': '\033[37m'     # 白色
            }
            
            color = level_colors.get(data.get('level', 'info'), '\033[37m')
            reset = '\033[0m'
            
            print(f"{color}[{timestamp}] {data.get('message', '')}{reset}")
            
            # 發送回應
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
            
        except Exception as e:
            print(f"處理日誌時發生錯誤: {e}")
            self.send_response(500)
            self.end_headers()

    def handle_test_result(self):
        """處理單個測試結果"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            test_result = {
                'timestamp': datetime.now().isoformat(),
                'name': data.get('name'),
                'category': data.get('category'),
                'status': data.get('status'),
                'duration': data.get('duration'),
                'error': data.get('error'),
                'note': data.get('note')
            }
            
            self.server.test_results.append(test_result)
            self.server.last_update = datetime.now()
            
            # 更新統計
            status = data.get('status')
            if status == 'passed':
                self.server.stats['passed'] += 1
            elif status == 'failed':
                self.server.stats['failed'] += 1
            
            # 輸出測試結果
            status_symbols = {
                'passed': '✅',
                'failed': '❌',
                'running': '🔄'
            }
            
            symbol = status_symbols.get(status, '⚪')
            duration_str = f"({data.get('duration', 0)}ms)" if data.get('duration') else ""
            
            print(f"  {symbol} {data.get('name', 'Unknown')} {duration_str}")
            
            if data.get('error'):
                print(f"    錯誤: {data.get('error')}")
            
            if data.get('note'):
                print(f"    備註: {data.get('note')}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
            
        except Exception as e:
            print(f"處理測試結果時發生錯誤: {e}")
            self.send_response(500)
            self.end_headers()

    def handle_test_complete(self):
        """處理測試完成通知"""
        try:
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            self.server.test_summary = data
            self.server.test_completed = True
            
            # 輸出最終統計
            print(f"\n🎉 測試執行完成!")
            print(f"📊 總結果:")
            print(f"   總測試數: {data.get('total', 0)}")
            print(f"   通過: {data.get('passed', 0)}")
            print(f"   失敗: {data.get('failed', 0)}")
            print(f"   成功率: {(data.get('passed', 0) / max(data.get('total', 1), 1) * 100):.1f}%")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
            
        except Exception as e:
            print(f"處理測試完成通知時發生錯誤: {e}")
            self.send_response(500)
            self.end_headers()

class TestMonitorServer:
    def __init__(self, port=8081):
        self.port = port
        self.server = None
        self.server_thread = None
        self.test_logs = []
        self.test_results = []
        self.test_summary = {}
        self.test_completed = False
        self.last_update = None
        self.stats = {'passed': 0, 'failed': 0}

    def start(self):
        """啟動服務器"""
        try:
            self.server = HTTPServer(('localhost', self.port), TestResultReceiver)
            
            # 將資料綁定到服務器
            self.server.test_logs = self.test_logs
            self.server.test_results = self.test_results
            self.server.test_summary = self.test_summary
            self.server.test_completed = self.test_completed
            self.server.last_update = self.last_update
            self.server.stats = self.stats
            
            print(f"🚀 AkingSPICE測試監控服務器啟動於 http://localhost:{self.port}")
            print(f"📡 等待瀏覽器測試結果...")
            print(f"🌐 測試頁面: http://localhost:8080/simple-test.html")
            print("-" * 60)
            
            # 在新線程中運行服務器
            self.server_thread = threading.Thread(target=self.server.serve_forever)
            self.server_thread.daemon = True
            self.server_thread.start()
            
        except Exception as e:
            print(f"❌ 服務器啟動失敗: {e}")
            return False
        
        return True

    def stop(self):
        """停止服務器"""
        if self.server:
            self.server.shutdown()
            print("\n🛑 測試監控服務器已停止")

    def wait_for_tests(self, timeout=300):
        """等待測試完成"""
        start_time = time.time()
        
        while not self.test_completed and (time.time() - start_time) < timeout:
            time.sleep(1)
        
        if self.test_completed:
            return True
        else:
            print(f"\n⏰ 等待測試超時 ({timeout}秒)")
            return False

    def generate_report(self):
        """生成測試報告"""
        if not self.test_results:
            return "沒有收到任何測試結果"
        
        report = []
        report.append("=" * 60)
        report.append("🔬 AkingSPICE 網頁測試報告")
        report.append("=" * 60)
        
        # 統計摘要
        total = len(self.test_results)
        passed = sum(1 for t in self.test_results if t['status'] == 'passed')
        failed = total - passed
        success_rate = (passed / total * 100) if total > 0 else 0
        
        report.append(f"\n📊 測試統計:")
        report.append(f"   總測試數: {total}")
        report.append(f"   通過數量: {passed}")
        report.append(f"   失敗數量: {failed}")
        report.append(f"   成功率: {success_rate:.1f}%")
        
        # 按分類統計
        categories = {}
        for result in self.test_results:
            cat = result.get('category', 'unknown')
            if cat not in categories:
                categories[cat] = {'passed': 0, 'failed': 0}
            
            if result['status'] == 'passed':
                categories[cat]['passed'] += 1
            else:
                categories[cat]['failed'] += 1
        
        report.append(f"\n📋 分類統計:")
        for cat, stats in categories.items():
            total_cat = stats['passed'] + stats['failed']
            rate = (stats['passed'] / total_cat * 100) if total_cat > 0 else 0
            report.append(f"   {cat}: {stats['passed']}/{total_cat} ({rate:.1f}%)")
        
        # 失敗的測試詳情
        failed_tests = [t for t in self.test_results if t['status'] == 'failed']
        if failed_tests:
            report.append(f"\n❌ 失敗的測試:")
            for test in failed_tests:
                report.append(f"   • {test['name']}")
                if test.get('error'):
                    report.append(f"     錯誤: {test['error']}")
        
        # 性能統計
        durations = [t.get('duration', 0) for t in self.test_results if t.get('duration')]
        if durations:
            avg_duration = sum(durations) / len(durations)
            max_duration = max(durations)
            report.append(f"\n⏱️ 性能統計:")
            report.append(f"   平均執行時間: {avg_duration:.2f}ms")
            report.append(f"   最長執行時間: {max_duration:.2f}ms")
        
        report.append("\n" + "=" * 60)
        
        return "\n".join(report)

    def save_report(self, filename=None):
        """儲存報告到檔案"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"akingspice_test_report_{timestamp}.txt"
        
        report = self.generate_report()
        
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(report)
            print(f"📄 測試報告已儲存到: {filename}")
        except Exception as e:
            print(f"❌ 儲存報告失敗: {e}")

def main():
    """主程式"""
    print("🔬 AkingSPICE 自動化測試系統")
    print("=" * 50)
    
    # 啟動監控服務器
    monitor = TestMonitorServer()
    if not monitor.start():
        return
    
    try:
        # 自動打開測試頁面
        test_url = "http://localhost:8080/simple-test.html"
        print(f"🌐 正在開啟測試頁面: {test_url}")
        
        try:
            webbrowser.open(test_url)
        except Exception as e:
            print(f"⚠️ 無法自動開啟瀏覽器: {e}")
            print(f"   請手動開啟: {test_url}")
        
        # 等待測試完成
        print(f"\n⏳ 等待測試執行完成...")
        if monitor.wait_for_tests(timeout=300):  # 5分鐘超時
            print(f"\n✅ 測試執行完成!")
            
            # 顯示報告
            print(monitor.generate_report())
            
            # 儲存報告
            monitor.save_report()
            
        else:
            print(f"\n⚠️ 測試未在預期時間內完成")
            if monitor.test_results:
                print("但已收到部分結果:")
                print(monitor.generate_report())
        
    except KeyboardInterrupt:
        print(f"\n⏹️ 用戶中斷測試")
    
    finally:
        monitor.stop()

if __name__ == "__main__":
    main()