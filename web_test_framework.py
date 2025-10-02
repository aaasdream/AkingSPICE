#!/usr/bin/env python3
"""
AkingSPICE Web自動測試框架
============================

這是一個完整的Python-Web自動測試框架，讓開發者可以：
1. 在命令行自動獲取網頁測試執行結果
2. 無需用戶手動介入
3. 自動啟動瀏覽器、執行測試、收集結果
4. 生成詳細的測試報告

架構設計：
- TestFrameworkServer: Python HTTP服務器，接收測試結果
- BrowserController: 自動控制瀏覽器執行測試
- TestResultCollector: 收集和分析測試數據
- ReportGenerator: 生成測試報告
"""

import json
import time
import threading
import socket
from datetime import datetime
from typing import Dict, List, Optional, Any
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse
import subprocess
import sys
import os


class TestMessage:
    """測試消息標準格式"""
    
    @staticmethod
    def create_log(level: str, message: str, timestamp: float = None) -> Dict:
        """創建日誌消息"""
        return {
            'type': 'log',
            'level': level,  # info, success, error, warning, debug
            'message': message,
            'timestamp': timestamp or time.time()
        }
    
    @staticmethod
    def create_test_start(test_name: str, test_id: str = None) -> Dict:
        """創建測試開始消息"""
        return {
            'type': 'test_start',
            'test_name': test_name,
            'test_id': test_id,
            'timestamp': time.time()
        }
    
    @staticmethod
    def create_test_result(test_name: str, passed: bool, duration: float = None, 
                          error: str = None, details: Dict = None, test_id: str = None) -> Dict:
        """創建測試結果消息"""
        return {
            'type': 'test_result',
            'test_name': test_name,
            'test_id': test_id,
            'passed': passed,
            'duration': duration,
            'error': error,
            'details': details or {},
            'timestamp': time.time()
        }
    
    @staticmethod
    def create_test_summary(total: int, passed: int, failed: int, 
                           duration: float = None, details: Dict = None) -> Dict:
        """創建測試摘要消息"""
        return {
            'type': 'test_summary',
            'total_tests': total,
            'passed_tests': passed,
            'failed_tests': failed,
            'success_rate': (passed / total * 100) if total > 0 else 0,
            'total_duration': duration,
            'details': details or {},
            'timestamp': time.time()
        }
    
    @staticmethod
    def create_system_ready() -> Dict:
        """創建系統就緒消息"""
        return {
            'type': 'system_ready',
            'timestamp': time.time()
        }
    
    @staticmethod
    def create_system_shutdown() -> Dict:
        """創建系統關閉消息"""
        return {
            'type': 'system_shutdown',
            'timestamp': time.time()
        }


class TestResultCollector:
    """測試結果收集器"""
    
    def __init__(self):
        self.logs: List[Dict] = []
        self.test_results: Dict[str, Dict] = {}
        self.test_summary: Optional[Dict] = None
        self.start_time: Optional[float] = None
        self.end_time: Optional[float] = None
        self.system_ready = False
        
    def add_message(self, message: Dict):
        """添加消息"""
        msg_type = message.get('type')
        
        if msg_type == 'log':
            self.logs.append(message)
        elif msg_type == 'test_start':
            test_id = message.get('test_id', message['test_name'])
            if test_id not in self.test_results:
                self.test_results[test_id] = {
                    'name': message['test_name'],
                    'start_time': message['timestamp'],
                    'status': 'running'
                }
        elif msg_type == 'test_result':
            test_id = message.get('test_id', message['test_name'])
            if test_id in self.test_results:
                self.test_results[test_id].update({
                    'status': 'passed' if message['passed'] else 'failed',
                    'end_time': message['timestamp'],
                    'duration': message.get('duration'),
                    'error': message.get('error'),
                    'details': message.get('details', {})
                })
            else:
                # 如果沒有start消息，直接記錄結果
                self.test_results[test_id] = {
                    'name': message['test_name'],
                    'status': 'passed' if message['passed'] else 'failed',
                    'end_time': message['timestamp'],
                    'duration': message.get('duration'),
                    'error': message.get('error'),
                    'details': message.get('details', {})
                }
        elif msg_type == 'test_summary':
            self.test_summary = message
            self.end_time = message['timestamp']
        elif msg_type == 'system_ready':
            self.system_ready = True
            if not self.start_time:
                self.start_time = message['timestamp']
        elif msg_type == 'system_shutdown':
            if not self.end_time:
                self.end_time = message['timestamp']
    
    def get_statistics(self) -> Dict:
        """獲取統計信息"""
        if self.test_summary:
            return {
                'total': self.test_summary['total_tests'],
                'passed': self.test_summary['passed_tests'],
                'failed': self.test_summary['failed_tests'],
                'success_rate': self.test_summary['success_rate']
            }
        
        # 從test_results計算
        total = len(self.test_results)
        passed = sum(1 for test in self.test_results.values() if test.get('status') == 'passed')
        failed = sum(1 for test in self.test_results.values() if test.get('status') == 'failed')
        
        return {
            'total': total,
            'passed': passed,
            'failed': failed,
            'success_rate': (passed / total * 100) if total > 0 else 0
        }
    
    def is_complete(self) -> bool:
        """檢查測試是否完成"""
        return bool(self.test_summary or self.end_time)
    
    def get_failed_tests(self) -> List[Dict]:
        """獲取失敗的測試"""
        return [test for test in self.test_results.values() if test.get('status') == 'failed']


class TestFrameworkHandler(BaseHTTPRequestHandler):
    """HTTP請求處理器"""
    
    def __init__(self, collector: TestResultCollector, *args, **kwargs):
        self.collector = collector
        super().__init__(*args, **kwargs)
    
    def do_OPTIONS(self):
        """處理OPTIONS請求（CORS preflight）"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def do_POST(self):
        """處理POST請求"""
        try:
            # 設置CORS頭
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            # 讀取數據
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            data = json.loads(post_data.decode('utf-8'))
            
            # 處理消息
            self.collector.add_message(data)
            
            # 響應成功
            response = {'status': 'success', 'message': 'Message received'}
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        except Exception as e:
            print(f"處理POST請求時發生錯誤: {e}")
            self.send_error(500, f"Internal Server Error: {e}")
    
    def do_GET(self):
        """處理GET請求"""
        try:
            self.send_response(200)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            
            # 返回當前收集的數據
            response = {
                'logs': self.collector.logs,
                'test_results': self.collector.test_results,
                'test_summary': self.collector.test_summary,
                'statistics': self.collector.get_statistics(),
                'is_complete': self.collector.is_complete()
            }
            
            self.wfile.write(json.dumps(response).encode('utf-8'))
            
        except Exception as e:
            print(f"處理GET請求時發生錯誤: {e}")
            self.send_error(500, f"Internal Server Error: {e}")
    
    def log_message(self, format, *args):
        """禁用預設日誌輸出"""
        pass


class TestFrameworkServer:
    """測試框架服務器"""
    
    def __init__(self, port: int = 9999):
        self.port = port
        self.collector = TestResultCollector()
        self.server: Optional[HTTPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.running = False
    
    def _find_free_port(self) -> int:
        """尋找可用端口"""
        for port in range(self.port, self.port + 100):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('', port))
                    return port
            except OSError:
                continue
        raise RuntimeError("無法找到可用端口")
    
    def start(self) -> int:
        """啟動服務器"""
        if self.running:
            return self.port
        
        # 尋找可用端口
        self.port = self._find_free_port()
        
        # 創建服務器
        def handler(*args, **kwargs):
            return TestFrameworkHandler(self.collector, *args, **kwargs)
        
        self.server = HTTPServer(('localhost', self.port), handler)
        
        # 在獨立線程中運行服務器
        def run_server():
            self.server.serve_forever()
        
        self.server_thread = threading.Thread(target=run_server, daemon=True)
        self.server_thread.start()
        self.running = True
        
        print(f"✅ 測試框架服務器已啟動在端口 {self.port}")
        return self.port
    
    def stop(self):
        """停止服務器"""
        if self.server and self.running:
            self.server.shutdown()
            self.server.server_close()
            self.running = False
            print("🔴 測試框架服務器已停止")
    
    def wait_for_tests(self, timeout: float = 300) -> bool:
        """等待測試完成"""
        start_time = time.time()
        
        # 等待系統就緒
        while not self.collector.system_ready and (time.time() - start_time) < timeout:
            time.sleep(0.1)
        
        if not self.collector.system_ready:
            print("⚠️  超時：測試系統未就緒")
            return False
        
        print("🎯 測試系統已就緒，等待測試完成...")
        
        # 等待測試完成
        while not self.collector.is_complete() and (time.time() - start_time) < timeout:
            time.sleep(0.5)
            
            # 實時顯示進度
            stats = self.collector.get_statistics()
            if stats['total'] > 0:
                print(f"📊 進度: {stats['passed'] + stats['failed']}/{stats['total']} "
                      f"(通過: {stats['passed']}, 失敗: {stats['failed']})", end='\r')
        
        print()  # 換行
        
        if self.collector.is_complete():
            print("✅ 測試執行完成")
            return True
        else:
            print("⚠️  超時：測試未在指定時間內完成")
            return False
    
    def get_results(self) -> Dict:
        """獲取測試結果"""
        return {
            'collector': self.collector,
            'logs': self.collector.logs,
            'test_results': self.collector.test_results,
            'test_summary': self.collector.test_summary,
            'statistics': self.collector.get_statistics(),
            'failed_tests': self.collector.get_failed_tests(),
            'is_complete': self.collector.is_complete(),
            'start_time': self.collector.start_time,
            'end_time': self.collector.end_time
        }


class BrowserController:
    """瀏覽器控制器"""
    
    def __init__(self):
        self.process: Optional[subprocess.Popen] = None
    
    def open_url(self, url: str, browser: str = 'auto') -> bool:
        """打開URL"""
        try:
            if browser == 'auto':
                # 嘗試使用不同的瀏覽器
                browsers = ['chrome', 'firefox', 'edge', 'default']
                for b in browsers:
                    if self._try_open_browser(url, b):
                        return True
                return False
            else:
                return self._try_open_browser(url, browser)
        except Exception as e:
            print(f"❌ 無法打開瀏覽器: {e}")
            return False
    
    def _try_open_browser(self, url: str, browser: str) -> bool:
        """嘗試打開特定瀏覽器"""
        try:
            if browser == 'chrome':
                # 嘗試Chrome
                chrome_paths = [
                    r'C:\Program Files\Google\Chrome\Application\chrome.exe',
                    r'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe',
                    'google-chrome',
                    'chromium-browser'
                ]
                for path in chrome_paths:
                    try:
                        self.process = subprocess.Popen([
                            path, '--new-window', '--disable-web-security',
                            '--disable-features=VizDisplayCompositor', url
                        ])
                        print(f"✅ 使用Chrome打開: {url}")
                        return True
                    except (FileNotFoundError, OSError):
                        continue
                        
            elif browser == 'firefox':
                # 嘗試Firefox
                firefox_paths = [
                    r'C:\Program Files\Mozilla Firefox\firefox.exe',
                    r'C:\Program Files (x86)\Mozilla Firefox\firefox.exe',
                    'firefox'
                ]
                for path in firefox_paths:
                    try:
                        self.process = subprocess.Popen([path, '-new-window', url])
                        print(f"✅ 使用Firefox打開: {url}")
                        return True
                    except (FileNotFoundError, OSError):
                        continue
                        
            elif browser == 'edge':
                # 嘗試Edge
                try:
                    self.process = subprocess.Popen(['msedge', url])
                    print(f"✅ 使用Edge打開: {url}")
                    return True
                except (FileNotFoundError, OSError):
                    pass
                    
            elif browser == 'default':
                # 使用系統預設瀏覽器
                import webbrowser
                webbrowser.open(url)
                print(f"✅ 使用預設瀏覽器打開: {url}")
                return True
                
            return False
            
        except Exception as e:
            print(f"❌ 打開瀏覽器 {browser} 失敗: {e}")
            return False
    
    def close(self):
        """關閉瀏覽器"""
        if self.process:
            try:
                self.process.terminate()
                self.process.wait(timeout=5)
            except:
                try:
                    self.process.kill()
                except:
                    pass


class ReportGenerator:
    """報告生成器"""
    
    @staticmethod
    def generate_console_report(results: Dict) -> str:
        """生成控制台報告"""
        lines = []
        
        # 標題
        lines.append("=" * 60)
        lines.append("🧪 AkingSPICE Web自動測試報告")
        lines.append("=" * 60)
        
        # 基本信息
        stats = results['statistics']
        lines.append(f"📊 測試統計:")
        lines.append(f"   總測試數: {stats['total']}")
        lines.append(f"   通過測試: {stats['passed']} ✅")
        lines.append(f"   失敗測試: {stats['failed']} ❌")
        lines.append(f"   成功率: {stats['success_rate']:.1f}%")
        
        # 執行時間
        if results['start_time'] and results['end_time']:
            duration = results['end_time'] - results['start_time']
            lines.append(f"   執行時間: {duration:.2f}秒")
        
        lines.append("")
        
        # 測試結果詳情
        if results['test_results']:
            lines.append("📋 測試詳情:")
            lines.append("-" * 40)
            
            for test_id, test in results['test_results'].items():
                status_symbol = "✅" if test.get('status') == 'passed' else "❌"
                duration_str = f" ({test.get('duration', 0):.0f}ms)" if test.get('duration') else ""
                lines.append(f"  {status_symbol} {test['name']}{duration_str}")
                
                if test.get('error'):
                    lines.append(f"       錯誤: {test['error']}")
        
        # 失敗測試詳情
        failed_tests = results['failed_tests']
        if failed_tests:
            lines.append("")
            lines.append("❌ 失敗測試詳情:")
            lines.append("-" * 40)
            
            for test in failed_tests:
                lines.append(f"  🔴 {test['name']}")
                if test.get('error'):
                    lines.append(f"     錯誤: {test['error']}")
                if test.get('details'):
                    lines.append(f"     詳情: {test['details']}")
        
        # 日誌摘要
        if results['logs']:
            error_logs = [log for log in results['logs'] if log.get('level') == 'error']
            if error_logs:
                lines.append("")
                lines.append(f"🚨 錯誤日誌 ({len(error_logs)}條):")
                lines.append("-" * 40)
                
                for log in error_logs[-5:]:  # 只顯示最後5條錯誤
                    timestamp = datetime.fromtimestamp(log['timestamp']).strftime('%H:%M:%S')
                    lines.append(f"  [{timestamp}] {log['message']}")
        
        lines.append("")
        lines.append("=" * 60)
        
        return "\n".join(lines)
    
    @staticmethod
    def generate_json_report(results: Dict) -> str:
        """生成JSON報告"""
        report_data = {
            'summary': results['statistics'],
            'test_results': results['test_results'],
            'failed_tests': results['failed_tests'],
            'execution_info': {
                'start_time': results['start_time'],
                'end_time': results['end_time'],
                'duration': (results['end_time'] - results['start_time']) if results['start_time'] and results['end_time'] else None,
                'is_complete': results['is_complete']
            },
            'logs': results['logs'],
            'generated_at': time.time()
        }
        
        return json.dumps(report_data, indent=2, ensure_ascii=False)
    
    @staticmethod
    def save_report(content: str, filename: str):
        """保存報告到文件"""
        try:
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"📄 報告已保存: {filename}")
        except Exception as e:
            print(f"❌ 保存報告失敗: {e}")


class WebTestFramework:
    """Web自動測試框架主類"""
    
    def __init__(self, port: int = 9999):
        self.server = TestFrameworkServer(port)
        self.browser = BrowserController()
    
    def run_test(self, test_url: str, timeout: float = 300, browser: str = 'auto', 
                 generate_report: bool = True, save_json: bool = False) -> Dict:
        """
        執行Web測試
        
        Args:
            test_url: 測試頁面URL
            timeout: 超時時間（秒）
            browser: 瀏覽器類型 ('auto', 'chrome', 'firefox', 'edge', 'default')
            generate_report: 是否生成控制台報告
            save_json: 是否保存JSON報告
        
        Returns:
            測試結果字典
        """
        try:
            # 啟動服務器
            port = self.server.start()
            
            # 構建完整URL（如果需要添加參數）
            if '?' in test_url:
                full_url = f"{test_url}&testPort={port}"
            else:
                full_url = f"{test_url}?testPort={port}"
            
            print(f"🚀 開始執行Web測試:")
            print(f"   測試URL: {test_url}")
            print(f"   監聽端口: {port}")
            print(f"   瀏覽器: {browser}")
            print(f"   超時時間: {timeout}秒")
            print("-" * 50)
            
            # 打開瀏覽器
            if not self.browser.open_url(full_url, browser):
                raise RuntimeError("無法打開瀏覽器")
            
            # 等待測試完成
            success = self.server.wait_for_tests(timeout)
            
            # 獲取結果
            results = self.server.get_results()
            
            # 生成報告
            if generate_report:
                print("\n" + ReportGenerator.generate_console_report(results))
            
            # 保存JSON報告
            if save_json:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"test_report_{timestamp}.json"
                json_report = ReportGenerator.generate_json_report(results)
                ReportGenerator.save_report(json_report, filename)
            
            # 返回結果
            results['success'] = success
            return results
            
        except Exception as e:
            error_msg = f"測試執行失敗: {e}"
            print(f"❌ {error_msg}")
            return {
                'success': False,
                'error': error_msg,
                'statistics': {'total': 0, 'passed': 0, 'failed': 0, 'success_rate': 0}
            }
        finally:
            # 清理資源
            self.cleanup()
    
    def cleanup(self):
        """清理資源"""
        try:
            self.browser.close()
            self.server.stop()
        except:
            pass


# 使用示例和測試函數
def main():
    """主函數示例"""
    print("🧪 AkingSPICE Web自動測試框架")
    print("=" * 50)
    
    # 示例用法
    framework = WebTestFramework()
    
    # 測試本地文件
    test_url = "http://localhost:8080/standalone-test.html"
    
    try:
        results = framework.run_test(
            test_url=test_url,
            timeout=120,
            browser='auto',
            generate_report=True,
            save_json=True
        )
        
        # 返回退出碼
        if results['success'] and results['statistics']['success_rate'] >= 90:
            print("\n🎉 測試執行成功！")
            sys.exit(0)
        else:
            print("\n💥 測試執行失敗或成功率過低！")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️  測試被用戶中斷")
        framework.cleanup()
        sys.exit(130)
    except Exception as e:
        print(f"\n💥 發生未預期的錯誤: {e}")
        framework.cleanup()
        sys.exit(1)


if __name__ == "__main__":
    main()