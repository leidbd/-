[app]

# App 标题
title = 我的私人空间

# 包名 (必须唯一，推荐格式: com.yourname.appname)
package.name = mydiaryspace

# 应用 ID (Android Play Store 用)
package.domain = com.myspace

# 源码目录
source.dir = .

# 主入口模块
mainmodule = main

# 包含的 Python 文件
source.include_exts = py,png,jpg,kv,atlas,html,css,js,json,ttf,woff,woff2,otf,svg

# 忽略的文件
version = 1.0.0

# 要求的 Android API 最低版本
android.minapi = 21

# 目标 Android API 版本
android.api = 33

# 支持的架构
android.archs = arm64-v8a, armeabi-v7a

# 全屏/沉浸模式
android.fullscreen = 0

# 状态栏透明
android.translucent_statusbar = 0

# 应用图标
icon.filename = icon.png

# 启动图
# splashscreen.filename = splash.png

# 权限
android.permissions = INTERNET, ACCESS_NETWORK_STATE, READ_EXTERNAL_STORAGE, WRITE_EXTERNAL_STORAGE

# WebView 支持（关键！）
p4a.bootstrap = webview

# 屏幕方向: portrait(竖屏) / landscape(横屏) / all
orientation = portrait

# 启动画面
android.manifest.include_sources = False

# 网络（允许 HTTP）
android.allow_backup = True

# Google Play 过滤（可选）
# android.playstore.split APKs
