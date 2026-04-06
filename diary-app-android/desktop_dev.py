"""
桌面开发调试脚本
使用 Flask 提供本地 HTTP 服务，方便在浏览器中测试应用
无需 Android SDK，直接运行即可

使用方法：
    pip install flask
    python desktop_dev.py
"""
import http.server
import socketserver
import os
import sys
import webbrowser
import threading

PORT = 8765
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
INDEX_FILE = os.path.join(DIRECTORY, 'DiaryApp', 'index.html')


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    """静默模式 HTTP 服务器"""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def log_message(self, format, *args):
        """抑制日志输出"""
        pass

    def end_headers(self):
        # 添加 CORS 头（模拟 WebView 环境）
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()


def start_server():
    with socketserver.TCPServer(("", PORT), QuietHandler) as httpd:
        httpd.serve_forever()


if __name__ == '__main__':
    print(f"=" * 50)
    print(f"  我的私人空间 - 桌面调试模式")
    print(f"=" * 50)
    print()
    print(f"  本地服务已启动: http://localhost:{PORT}")
    print(f"  资源目录: {DIRECTORY}")
    print()
    print(f"  在浏览器中打开应用进行测试")
    print(f"  按 Ctrl+C 停止服务")
    print()

    # 启动服务器
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    # 打开浏览器
    webbrowser.open(f'http://localhost:{PORT}/DiaryApp/')

    # 保持运行
    try:
        server_thread.join()
    except KeyboardInterrupt:
        print("\n服务已停止")
        sys.exit(0)
