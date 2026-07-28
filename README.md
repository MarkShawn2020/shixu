# 手工川扫描

一款面向 iPhone、可直接用 Expo Go 运行的本地文件扫描 App。

## 已实现的产品链路

- 连续拍摄多页文件，也可一次从相册导入多张图片
- 自动识别纸张边界，并支持拖拽四角手动微调
- 透视几何变换，把斜拍文件标准化为平整页面
- 智能提亮、对比度拉伸，以及彩色 / 灰度 / 黑白三种模式
- 页面缩略图预览、删除、旋转和重新排序
- 默认添加「手工川工作室」Logo 水印，也可在导出前关闭
- 多页导出 PDF；图片模式可批量保存到系统相册
- 整个处理过程在手机本地完成

## 技术栈

- Expo SDK 57、React Native 0.86、TypeScript
- `expo-camera`：连续拍摄
- `expo-image-manipulator`：拍摄图预缩放与方向标准化
- 纯 TypeScript：纸张边缘检测、透视变换和智能提亮
- `expo-print`：多页 PDF
- `expo-media-library` / `expo-sharing`：保存与分享

## 本地运行

```bash
npm install
npx expo start
```

在 iPhone 安装 Expo Go，扫描终端二维码即可打开。真机相机只在 iOS / Android 设备上工作。

## 检查

```bash
npm run typecheck
npm run doctor
npx expo export --platform ios
```

## 隐私

图片、几何校正和 PDF 生成均在设备本地完成。项目没有账号系统、分析 SDK 或远程上传接口。
