# 我的私人空间 - Android App

将 [原网页版日记应用](../diary-app/) 转换为 Android 原生 App 并打包为 APK。

## 项目结构

```
diary-app-android/
├── main.py              # Kivy 主应用（WebView 包装）
├── buildozer.spec       # Buildozer 构建配置
├── DiaryApp/            # 原网页资源（HTML/CSS/JS）
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── .github/workflows/   # GitHub Actions 构建流程
│   └── build.yml
├── requirements.txt     # Python 依赖
└── README.md
```

## 技术方案

- **框架**: Kivy 2.3 + Python 4 Android (P4A)
- **包装方式**: WebView 内嵌原网页
- **数据存储**: Python 本地 JSON 文件（适配原 localStorage）
- **构建方式**: GitHub Actions 云构建（无需本地配置 Android SDK）

## 构建 APK

### 方式一：GitHub Actions（推荐，无需配置环境）

1. 将 `diary-app-android/` 目录上传到 GitHub 仓库
2. 在 GitHub 仓库页面点击 **Actions** → **Build Android APK** → **Run workflow**
3. 构建完成后，在 Artifacts 下载 `diary-app-debug-apk`

### 方式二：本地构建（Linux / WSL2）

需要 Linux 环境 + Android SDK：

```bash
# 安装依赖
sudo apt install python3-pip openjdk-17-jdk ant autoconf libtool pkg-config
pip install buildozer==1.5.0 kivy[base]==2.3.0

# 配置 Android SDK（下载 cmdline-tools）
export ANDROID_HOME=~/android-sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH
yes | sdkmanager --licenses
sdkmanager "platforms;android-33" "build-tools;33.0.2"

# 构建
buildozer android debug
# APK 输出在 bin/ 目录
```

### 方式三：Windows + Docker

```powershell
docker run --rm -v ${PWD}:/app -w /app python:3.10 bash -c "
    apt-get update && apt-get install -y openjdk-17-jdk wget unzip
    pip install buildozer==1.5.0 kivy[base]==2.3.0
    buildozer android debug
"
```

## APK 安装

构建成功后，APK 位于 `bin/mydiaryspace-*-debug.apk`

安装方式：
- 传到手机，通过文件管理器安装
- 开启手机「安装未知来源应用」权限

## 功能特性

| 功能 | 状态 |
|------|------|
| 用户登录/注册 | ✅ |
| 日记（密码锁） | ✅ |
| 随手记 | ✅ |
| 日程表/课程表 | ✅ |
| 记账 | ✅ |
| WiFi 同步 | ⚠️ 需局域网 |
| 数据导出/导入 | ✅ |
| 离线使用 | ✅ |

## 桌面开发测试

在没有 Android 设备时，可以用桌面模式测试：

```bash
pip install kivy[base]==2.3.0
python main.py
```
