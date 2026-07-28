# 更新日志

## 1.0.0 - 2026-07-28

### 新增

- 接入 EAS production 构建、远程 build number 递增与 App Store 提交流程。
- 补齐简体中文商店文案、年龄分级、隐私申报和审核说明。
- 在 App 内加入隐私政策、技术支持与开源代码入口。

### 调整

- 首个商店版本聚焦 iPhone，最低支持 iOS 16.4。
- 合并应用与原生依赖使用的 Apple required-reason API 隐私声明。

## 0.1.0 - 2026-07-28

### 新增

- 支持连续拍摄、相册导入、多页预览、页面重排与本地扫描历史。
- 加入自动文档边缘识别、透视校正、智能提亮，以及彩色、灰度、黑白处理。
- 加入明确的扫描完成态，完成后可导出当前文档或开始拍摄新的一份。
- 支持在设备本地生成 A4 PDF、批量保存图片与分享导出结果。

### 修复

- 固定 Development Build 的 `shixu` URL Scheme，确保真机能稳定连接 Metro。
- 将 iOS Bundle Identifier 统一为 `ai.lovstudio.shixu`，移除旧版 `com.*` 标识。
