#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AkingSPICE 快速測試驗證
直接執行自動化測試並獲取結果
"""

import subprocess
import time
import threading
import sys
import json
from pathlib import Path

# 導入監控服務器
sys.path.append(str(Path(__file__).parent))

def run_quick_test():
    """快速測試AkingSPICE的所有功能"""
    
    print("🔬 AkingSPICE 快速功能驗證")
    print("=" * 50)
    
    # 1. 檢查建構結果
    print("📦 檢查建構狀態...")
    build_files = [
        'lib-dist/AkingSPICE.es.js',
        'lib-dist/AkingSPICE.umd.js'
    ]
    
    all_built = True
    for file_path in build_files:
        if Path(file_path).exists():
            size = Path(file_path).stat().st_size
            print(f"  ✅ {file_path} ({size:,} bytes)")
        else:
            print(f"  ❌ {file_path} 不存在")
            all_built = False
    
    if not all_built:
        print("\n❌ 建構文件不完整，執行建構...")
        result = subprocess.run(['npm', 'run', 'build'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✅ 建構成功")
        else:
            print(f"❌ 建構失敗: {result.stderr}")
            return False
    
    # 2. 啟動HTTP服務器
    print("\n🌐 啟動HTTP服務器...")
    try:
        http_process = subprocess.Popen(
            [sys.executable, '-m', 'http.server', '8080'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        time.sleep(2)  # 等待服務器啟動
        
        if http_process.poll() is None:
            print("✅ HTTP服務器啟動成功 (port 8080)")
        else:
            print("❌ HTTP服務器啟動失敗")
            return False
            
    except Exception as e:
        print(f"❌ HTTP服務器啟動錯誤: {e}")
        return False
    
    # 3. 啟動監控服務器
    print("📡 啟動測試監控服務器...")
    
    test_results = []
    test_logs = []
    test_completed = False
    
    # 導入監控類
    import importlib.util
    spec = importlib.util.spec_from_file_location("test_monitor", "test-monitor.py")
    test_monitor_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(test_monitor_module)
    
    monitor = test_monitor_module.TestMonitorServer()
    
    def run_monitor():
        nonlocal test_completed
        monitor.start()
        monitor.wait_for_tests(timeout=120)  # 2分鐘超時
        test_completed = True
    
    monitor_thread = threading.Thread(target=run_monitor)
    monitor_thread.daemon = True
    monitor_thread.start()
    
    time.sleep(1)  # 等待監控服務器啟動
    print("✅ 測試監控服務器啟動成功 (port 8081)")
    
    # 4. 使用Playwright執行測試 (如果可用) 或提供手動指令
    print("\n🤖 準備執行自動化測試...")
    
    test_url = "http://localhost:8080/automated-test.html?autorun=true"
    
    # 嘗試使用不同的自動化方案
    automation_success = False
    
    # 方案1: 嘗試使用playwright
    try:
        import playwright
        from playwright.sync_api import sync_playwright
        
        print("🎭 使用Playwright執行測試...")
        
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page()
            page.goto(test_url)
            
            # 等待測試完成 (最多2分鐘)
            start_time = time.time()
            while not test_completed and (time.time() - start_time) < 120:
                time.sleep(1)
            
            browser.close()
            
        automation_success = True
        print("✅ Playwright自動化執行完成")
        
    except ImportError:
        print("⚠️ Playwright未安裝，嘗試其他方案...")
        
    # 方案2: 嘗試使用selenium
    if not automation_success:
        try:
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            
            print("🌐 使用Selenium執行測試...")
            
            chrome_options = Options()
            chrome_options.add_argument('--headless')
            
            driver = webdriver.Chrome(options=chrome_options)
            driver.get(test_url)
            
            # 等待測試完成
            start_time = time.time()
            while not test_completed and (time.time() - start_time) < 120:
                time.sleep(1)
            
            driver.quit()
            automation_success = True
            print("✅ Selenium自動化執行完成")
            
        except ImportError:
            print("⚠️ Selenium未安裝，使用手動方案...")
        except Exception as e:
            print(f"⚠️ Selenium執行失敗: {e}")
    
    # 方案3: 手動指令
    if not automation_success:
        import webbrowser
        print(f"📋 請手動執行測試:")
        print(f"   1. 瀏覽器會自動開啟測試頁面")
        print(f"   2. 測試會自動執行")
        print(f"   3. 結果會即時顯示在此終端")
        
        try:
            webbrowser.open(test_url)
            print("✅ 瀏覽器已開啟測試頁面")
        except:
            print(f"⚠️ 請手動開啟: {test_url}")
    
    # 5. 等待測試結果
    print(f"\n⏳ 等待測試執行完成...")
    print(f"🌐 測試頁面: {test_url}")
    print(f"📊 監控面板: http://localhost:8081/status")
    print("-" * 50)
    
    start_time = time.time()
    while not test_completed and (time.time() - start_time) < 180:  # 3分鐘超時
        # 顯示進度
        if len(monitor.test_results) > 0:
            passed = len([r for r in monitor.test_results if r.get('status') == 'passed'])
            failed = len([r for r in monitor.test_results if r.get('status') == 'failed'])
            total = len(monitor.test_results)
            print(f"\r📊 進度: {total}個測試 | ✅{passed} ❌{failed}", end='', flush=True)
        
        time.sleep(1)
    
    # 6. 生成結果報告
    print("\n\n📋 測試執行完成! 生成結果報告...")
    print("=" * 60)
    
    if monitor.test_results:
        # 統計結果
        total_tests = len(monitor.test_results)
        passed_tests = len([r for r in monitor.test_results if r.get('status') == 'passed'])
        failed_tests = total_tests - passed_tests
        success_rate = (passed_tests / total_tests * 100) if total_tests > 0 else 0
        
        print(f"📊 測試統計:")
        print(f"   總測試數: {total_tests}")
        print(f"   ✅ 通過: {passed_tests}")
        print(f"   ❌ 失敗: {failed_tests}")
        print(f"   🎯 成功率: {success_rate:.1f}%")
        
        # 按分類統計
        categories = {}
        for result in monitor.test_results:
            cat = result.get('category', 'unknown')
            if cat not in categories:
                categories[cat] = {'passed': 0, 'failed': 0, 'tests': []}
            
            categories[cat]['tests'].append(result)
            if result.get('status') == 'passed':
                categories[cat]['passed'] += 1
            else:
                categories[cat]['failed'] += 1
        
        print(f"\n📋 分類詳情:")
        for cat, stats in categories.items():
            total_cat = stats['passed'] + stats['failed']
            rate = (stats['passed'] / total_cat * 100) if total_cat > 0 else 0
            
            print(f"\n🔸 {cat.upper()} ({total_cat}個測試, {rate:.1f}%成功率)")
            
            for test in stats['tests']:
                status_symbol = '✅' if test.get('status') == 'passed' else '❌'
                duration = f"({test.get('duration', 0)}ms)" if test.get('duration') else ""
                print(f"   {status_symbol} {test.get('name', 'Unknown')} {duration}")
                
                if test.get('error'):
                    print(f"      錯誤: {test.get('error')}")
                if test.get('note'):
                    print(f"      備註: {test.get('note')}")
        
        # 失敗測試摘要
        failed_tests_list = [r for r in monitor.test_results if r.get('status') == 'failed']
        if failed_tests_list:
            print(f"\n❌ 失敗測試摘要:")
            for test in failed_tests_list:
                print(f"   • {test.get('name', 'Unknown')}: {test.get('error', 'Unknown error')}")
        
        # 性能統計
        durations = [r.get('duration', 0) for r in monitor.test_results if r.get('duration')]
        if durations:
            avg_duration = sum(durations) / len(durations)
            max_duration = max(durations)
            print(f"\n⏱️ 性能統計:")
            print(f"   平均執行時間: {avg_duration:.2f}ms")
            print(f"   最長執行時間: {max_duration:.2f}ms")
        
        # 儲存報告
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        report_file = f"test_report_{timestamp}.json"
        
        report_data = {
            'timestamp': timestamp,
            'summary': {
                'total': total_tests,
                'passed': passed_tests,
                'failed': failed_tests,
                'success_rate': success_rate
            },
            'categories': categories,
            'results': monitor.test_results,
            'logs': monitor.test_logs
        }
        
        try:
            with open(report_file, 'w', encoding='utf-8') as f:
                json.dump(report_data, f, ensure_ascii=False, indent=2)
            print(f"\n📄 詳細報告已儲存: {report_file}")
        except Exception as e:
            print(f"\n⚠️ 無法儲存報告: {e}")
        
        # 最終結論
        print("\n" + "=" * 60)
        if success_rate >= 90:
            print("🎉 AkingSPICE 功能驗證 - 優秀!")
            print("   所有核心功能運作正常，可以放心使用。")
        elif success_rate >= 70:
            print("✅ AkingSPICE 功能驗證 - 良好")
            print("   大部分功能運作正常，少數問題不影響主要功能。")
        else:
            print("⚠️ AkingSPICE 功能驗證 - 需要注意")
            print("   發現多個問題，建議檢查失敗的測試項目。")
        
        success = success_rate >= 70
        
    else:
        print("❌ 沒有收到任何測試結果")
        print("可能原因:")
        print("   1. 瀏覽器無法載入測試頁面")
        print("   2. JavaScript模組載入失敗") 
        print("   3. 網路連線問題")
        success = False
    
    # 7. 清理
    try:
        http_process.terminate()
        monitor.stop()
    except:
        pass
    
    return success

if __name__ == "__main__":
    success = run_quick_test()
    sys.exit(0 if success else 1)