"""
我的私人空间 - Android App
基于 Kivy + WebView，将网页版日记应用封装为 Android 原生应用
"""
import os
import sys
import json
import re
import datetime
from io import BytesIO
from urllib.parse import urljoin

import kivy
kivy.require('2.1.0')

from kivy.app import App
from kivy.lang import Builder
from kivy.uix.webview import WebView
from kivy.uix.screenmanager import ScreenManager, Screen
from kivy.uix.boxlayout import BoxLayout
from kivy.uix.button import Button
from kivy.uix.label import Label
from kivy.uix.popup import Popup
from kivy.uix.filechooser import FileChooserIconView
from kivy.uix.textinput import TextInput
from kivy.utils import platform
from kivy.properties import ObjectProperty, StringProperty, BooleanProperty
from kivy.utils import escape_markup
from kivy.logger import Logger

# Android 专用导入
if platform == 'android':
    from android.storage import primary_external_storage_path
    from android.permissions import request, Permission, check_permission
    from jnius import autoclass, cast
    from android import api_version

    PythonActivity = autoclass('org.kivy.android.PythonActivity')
    Intent = autoclass('android.content.Intent')
    Uri = autoclass('android.net.Uri')
    FileProvider = autoclass('androidx.core.content.FileProvider')
    Environment = autoclass('android.os.Environment')
    File = autoclass('java.io.File')

# ============================================================
#  数据存储适配层
# ============================================================
class LocalStorage:
    """本地存储适配器 - 模拟 localStorage/sessionStorage"""

    def __init__(self, app):
        self.app = app
        self.data = {}
        self.session = {}
        self._load()

    def _storage_file(self):
        base = self.app.user_data_dir
        return os.path.join(base, 'storage.json')

    def _load(self):
        path = self._storage_file()
        if os.path.exists(path):
            try:
                with open(path, 'r', encoding='utf-8') as f:
                    self.data = json.load(f)
            except Exception:
                self.data = {}

    def _save(self):
        path = self._storage_file()
        try:
            with open(path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            Logger.error(f'Storage: Failed to save: {e}')

    def get(self, key, default=None):
        return self.data.get(key, default)

    def set(self, key, value):
        self.data[key] = value
        self._save()

    def remove(self, key):
        if key in self.data:
            del self.data[key]
            self._save()

    def get_session(self, key, default=None):
        return self.session.get(key, default)

    def set_session(self, key, value):
        self.session[key] = value


# ============================================================
#  JavaScript 注入接口
# ============================================================
class JSBridge:
    """Kivy 与 WebView 之间通信的桥接器"""

    def __init__(self, app):
        self.app = app

    def storage_get(self, key):
        """JS 调用: localStorage.getItem(key)"""
        val = self.app.storage.get(key)
        if val is None:
            return ''
        if isinstance(val, (dict, list)):
            return json.dumps(val)
        return str(val)

    def storage_set(self, key, value):
        """JS 调用: localStorage.setItem(key, value)"""
        try:
            # 尝试解析 JSON
            parsed = json.loads(value)
            self.app.storage.set(key, parsed)
        except (json.JSONDecodeError, TypeError):
            self.app.storage.set(key, value)
        return ''

    def storage_remove(self, key):
        """JS 调用: localStorage.removeItem(key)"""
        self.app.storage.remove(key)
        return ''

    def session_get(self, key):
        val = self.app.storage.get_session(key)
        return val if val is not None else ''

    def session_set(self, key, value):
        self.app.storage.set_session(key, value)
        return ''

    def session_remove(self, key):
        if key in self.app.storage.session:
            del self.app.storage.session[key]
        return ''

    def export_all_data(self):
        """导出所有数据为 JSON 文件"""
        data = {
            'diaries': self.app.storage.get('diaries') or [],
            'notes': self.app.storage.get('notes') or [],
            'schedules': self.app.storage.get('schedules') or [],
            'finances': self.app.storage.get('finances') or [],
            'exportAt': datetime.datetime.now().isoformat(),
        }
        return json.dumps(data, ensure_ascii=False)

    def import_data(self, json_str):
        """导入数据 JSON"""
        try:
            data = json.loads(json_str)
            for key in ['diaries', 'notes', 'schedules', 'finances']:
                if key in data:
                    self.app.storage.set(key, data[key])
            return 'success'
        except Exception as e:
            return f'error: {e}'

    def get_user_data_dir(self):
        """获取应用数据目录"""
        return self.app.user_data_dir

    def log(self, msg):
        """调试日志"""
        Logger.info(f'JSBridge: {msg}')
        return ''


# ============================================================
#  WebView 屏幕
# ============================================================
class WebViewScreen(Screen):
    """显示网页内容的 WebView 屏幕"""

    def on_enter(self):
        """进入屏幕时初始化 WebView"""
        if hasattr(self, '_webview_ready'):
            return
        self._init_webview()
        self._webview_ready = True

    def _init_webview(self):
        """初始化 WebView"""
        app = App.get_running_app()

        # 获取本地 HTML 文件路径
        if platform == 'android':
            # 在 Android 上，assets 在 app 的私有目录
            html_path = os.path.join(app.app_dir, 'DiaryApp', 'index.html')
        else:
            # 开发/桌面模式
            html_path = os.path.join(os.path.dirname(__file__), 'DiaryApp', 'index.html')

        # file:// URL
        if os.path.exists(html_path):
            url = f'file://{html_path}'
        else:
            # 回退：使用应用内嵌的 HTML（从 assets 加载）
            url = 'file:///android_asset/DiaryApp/index.html'

        Logger.info(f'WebView: Loading {url}')

        # 创建 WebView
        from kivy.uix.webview import WebView as KivyWebView

        wv = KivyWebView(url=url)
        wv.id = 'main_webview'

        # 绑定 JavaScript 接口
        if platform == 'android':
            wv.bind(on_webview_ready=self._on_webview_ready)

        self.ids.webview_container.clear_widgets()
        self.ids.webview_container.add_widget(wv)
        self.webview = wv

    def _on_webview_ready(self, instance):
        """WebView 准备就绪，注入通信接口"""
        app = App.get_running_app()
        if platform == 'android':
            try:
                # 在 Android WebView 上暴露 Python 对象
                from jnius import autoclass, cast
                PythonActivity = autoclass('org.kivy.android.PythonActivity')
                WebView = autoclass('android.webkit.WebView')
                WebSettings = autoclass('android.webkit.WebSettings')

                # 获取 Activity 和 WebView
                mActivity = PythonActivity.mActivity
                webview = mActivity.findViewById(instance.webview_id)

                if webview:
                    settings = webview.getSettings()
                    settings.setJavaScriptEnabled(True)
                    settings.setDomStorageEnabled(True)
                    settings.setAllowFileAccess(True)
                    settings.setAllowContentAccess(True)

                    # 注入 JSBridge 对象
                    bridge = JSBridge(app)
                    # 通过 addJavascriptInterface 暴露 (需要 API 17+)
                    if api_version >= 17:
                        webview.addJavascriptInterface(bridge, 'AndroidBridge')
            except Exception as e:
                Logger.error(f'WebView: Bridge setup error: {e}')

    def on_pre_leave(self):
        """离开屏幕时清理"""
        pass


# ============================================================
#  主应用
# ============================================================
class DiaryApp(App):
    """我的私人空间 - Android App"""

    title = '我的私人空间'
    icon = 'icon.png'
    version = '1.0.0'

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.storage = None
        self.js_bridge = None

    def build(self):
        """构建应用"""
        # 初始化存储
        self.storage = LocalStorage(self)
        self.js_bridge = JSBridge(self)

        # 创建屏幕管理器
        sm = ScreenManager()
        sm.add_widget(WebViewScreen(name='main'))

        return sm

    def on_start(self):
        """应用启动"""
        Logger.info('DiaryApp: Application started')

        # 请求 Android 权限
        if platform == 'android':
            self._request_permissions()

    def on_pause(self):
        """应用暂停 - 保持状态"""
        return True

    def on_resume(self):
        """应用恢复"""
        pass

    def _request_permissions(self):
        """请求 Android 运行时权限"""
        if platform != 'android':
            return

        try:
            from android.permissions import request
            permissions = [
                Permission.INTERNET,
                Permission.ACCESS_NETWORK_STATE,
                Permission.READ_EXTERNAL_STORAGE,
                Permission.WRITE_EXTERNAL_STORAGE,
            ]
            for perm in permissions:
                result = check_permission(perm)
                if result != True:
                    request(perm)
        except Exception as e:
            Logger.error(f'DiaryApp: Permission error: {e}')

    def get_app_dir(self):
        """获取应用安装目录（包含 assets）"""
        if platform == 'android':
            return os.path.dirname(os.path.abspath(sys.argv[0]))
        return os.path.dirname(__file__)

    def get_user_data_dir(self):
        """获取用户数据目录"""
        if platform == 'android':
            try:
                from android.storage import primary_external_storage_path
                base = primary_external_storage_path()
                diary_dir = os.path.join(base, 'MyDiarySpace')
                os.makedirs(diary_dir, exist_ok=True)
                return diary_dir
            except Exception:
                pass
        # 回退
        return os.path.expanduser('~/MyDiarySpace')


# ============================================================
#  入口
# ============================================================
if __name__ == '__main__':
    DiaryApp().run()
