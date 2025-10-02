#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AkingSPICE 一鍵測試啟動器
自動啟動HTTP服務器、測試監控器，並執行完整的網頁測試
"""

import subprocess
import threading
import time
import sys
import os
import webbrowser
from pathlib import Path

class AkingSPICETestRunner:
    def __init__(self):
        self.http_server_process = None
        self.monitor_thread = None
        self.project_dir = Path(__file__).parent
        
    def start_http_server(self):
        """啟動HTTP服務器 (port 8080)"""
        try:
            print("🌐 啟動HTTP文件服務器...")
            self.http_server_process = subprocess.Popen(
                [sys.executable, '-m', 'http.server', '8080'],
                cwd=self.project_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            
            # 等待服務器啟動
            time.sleep(2)
            
            if self.http_server_process.poll() is None:
                print("✅ HTTP服務器已啟動於 http://localhost:8080")
                return True
            else:
                print("❌ HTTP服務器啟動失敗")
                return False
                
        except Exception as e:
            print(f"❌ 啟動HTTP服務器時發生錯誤: {e}")
            return False
    
    def start_monitor_server(self):
        """在新線程中啟動監控服務器"""
        # 使用exec載入TestMonitorServer (避免import問題)
        import importlib.util
        spec = importlib.util.spec_from_file_location("test_monitor", self.project_dir / "test-monitor.py")
        test_monitor_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(test_monitor_module)
        TestMonitorServer = test_monitor_module.TestMonitorServer
        
        def run_monitor():
            self.monitor = TestMonitorServer()
            self.monitor.start()
            
            # 等待測試完成
            if self.monitor.wait_for_tests(timeout=180):  # 3分鐘超時
                print("\n" + "=" * 60)
                print("📊 測試執行完成! 生成最終報告...")
                print("=" * 60)
                
                # 顯示並儲存報告
                report = self.monitor.generate_report()
                print(report)
                self.monitor.save_report()
            else:
                print("\n⏰ 測試執行超時或被中斷")
                if self.monitor.test_results:
                    print("但已收到部分結果:")
                    print(self.monitor.generate_report())
        
        self.monitor_thread = threading.Thread(target=run_monitor)
        self.monitor_thread.daemon = True
        self.monitor_thread.start()
        
        # 給監控服務器一點時間啟動
        time.sleep(1)
    
    def open_test_page(self, auto_run=True):
        """開啟測試頁面"""
        test_url = f"http://localhost:8080/automated-test.html"
        if auto_run:
            test_url += "?autorun=true"
        
        print(f"🚀 開啟自動化測試頁面...")
        print(f"   URL: {test_url}")
        
        try:
            webbrowser.open(test_url)
            print("✅ 瀏覽器已開啟測試頁面")
        except Exception as e:
            print(f"⚠️ 無法自動開啟瀏覽器: {e}")
            print(f"   請手動開啟: {test_url}")
    
    def cleanup(self):
        """清理資源"""
        if self.http_server_process:
            self.http_server_process.terminate()
            print("🛑 HTTP服務器已停止")
    
    def run_full_test(self):
        """執行完整的自動化測試流程"""
        print("🔬 AkingSPICE 自動化測試系統")
        print("=" * 50)
        print("這個系統將:")
        print("1. 啟動HTTP服務器 (port 8080)")
        print("2. 啟動Python監控服務器 (port 8081)")
        print("3. 自動開啟瀏覽器執行測試")
        print("4. 即時顯示測試進度和結果")
        print("5. 生成詳細的測試報告")
        print("=" * 50)
        
        try:
            # 1. 啟動HTTP服務器
            if not self.start_http_server():
                return False
            
            # 2. 啟動監控服務器
            self.start_monitor_server()
            
            # 3. 開啟測試頁面
            self.open_test_page(auto_run=True)
            
            # 4. 等待用戶或測試完成
            print("\n⏳ 測試正在執行中...")
            print("💡 提示:")
            print("   - 測試會自動執行並將結果傳送回Python")
            print("   - 按 Ctrl+C 可以隨時中斷")
            print("   - 瀏覽器中可以看到即時測試進度")
            print("-" * 50)
            
            # 等待監控線程完成
            if self.monitor_thread:
                self.monitor_thread.join()
            
        except KeyboardInterrupt:
            print("\n⏹️ 測試被用戶中斷")
        except Exception as e:
            print(f"\n❌ 測試執行過程中發生錯誤: {e}")
        finally:
            self.cleanup()
    
    def run_interactive_test(self):
        """執行互動式測試 (不自動運行)"""
        print("🔬 AkingSPICE 互動式測試系統")
        print("=" * 50)
        
        try:
            # 啟動服務器
            if not self.start_http_server():
                return False
            
            self.start_monitor_server()
            
            # 開啟測試頁面（不自動執行）
            self.open_test_page(auto_run=False)
            
            print("\n📋 測試頁面已開啟，請在瀏覽器中手動執行測試")
            print("⏳ Python監控服務器正在等待測試結果...")
            print("💡 在瀏覽器中點擊 '🚀 執行所有測試' 開始測試")
            print("-" * 50)
            
            # 等待用戶操作
            input("\n按 Enter 鍵結束監控...")
            
        except KeyboardInterrupt:
            print("\n⏹️ 測試監控被用戶中斷")
        except Exception as e:
            print(f"\n❌ 測試執行過程中發生錯誤: {e}")
        finally:
            self.cleanup()

def main():
    """主程式入口"""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="AkingSPICE 自動化測試系統",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
使用範例:
  python run-automated-test.py                 # 完全自動化測試
  python run-automated-test.py --interactive   # 互動式測試
  python run-automated-test.py --help          # 顯示說明
        """
    )
    
    parser.add_argument(
        '--interactive', '-i',
        action='store_true',
        help='互動式模式 (不自動執行測試)'
    )
    
    args = parser.parse_args()
    
    runner = AkingSPICETestRunner()
    
    if args.interactive:
        runner.run_interactive_test()
    else:
        runner.run_full_test()

if __name__ == "__main__":
    main()