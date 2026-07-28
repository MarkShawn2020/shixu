# 拾序

一款面向 iPhone、基于 Expo SDK 57 Development Build 运行的本地文件扫描 App。

## 已实现的产品链路

- 连续拍摄多页文件，也可一次从相册导入多张图片
- 取景时直接分析原生相机视频帧，首个高置信结果立即锁定四角
- 每页拍完立即排队处理，并显示标准化、提亮后的预览
- 自动根据画面与页面内容确定四角和安全边距，也支持手动微调
- 透视几何变换，把斜拍文件标准化为平整页面
- 局部阴影补偿、智能提亮、对比度拉伸，以及彩色 / 灰度 / 黑白三种模式
- 页面缩略图预览、删除、旋转和重新排序
- 默认添加「手工川工作室」Logo 水印，也可在导出前关闭
- 原生逐页写入 A4 PDF；图片模式可批量保存到系统相册
- 整个处理过程在手机本地完成

## 技术栈

- Expo SDK 57、React Native 0.86、TypeScript
- `expo-camera`：连续拍摄
- AVFoundation `AVCaptureVideoDataOutput`：丢弃积压帧并以 100ms 节流驱动实时四角识别
- Apple Vision `VNDetectDocumentSegmentationRequest`：结合页面内容识别纸张四角
- Apple Vision `VNDetectRectanglesRequest`：文档分割没有结果时的原生后备检测
- `expo-image-manipulator`：拍摄图预缩放与方向标准化
- iOS Core Image：原生 GPU 透视校正、A 系列纸张比例标准化、`CIDocumentEnhancer` 文档增强、灰度/黑白滤镜与高质量 JPEG 输出
- iOS Core Graphics：本地 JPEG 整页铺满 A4，单次绘制 Logo 后直接写入多页 PDF
- Vision 文字行二次校准：纸边首次拉直后，按正文行的公共边距检查并消除残余横向透视
- 纯 TypeScript：结果校验，以及 Expo Go 或原生链路异常时的完整后备处理
- `expo-print`：Expo Go 或旧构建中的后备 PDF 导出
- `expo-media-library` / `expo-sharing`：保存与分享

## iPhone Development Build

当前 App Store 版 Expo Go 只支持 SDK 54，本项目使用 SDK 57，因此 iPhone
通过 Development Build 运行。首次安装时，用数据线连接并解锁 iPhone，然后执行：

```bash
npm install
npm run ios -- --device
```

`npm run ios` 会把项目同步到纯英文临时目录后再运行 Xcode，绕开 CocoaPods
对中文工程路径的编码问题。Development Build 安装完成后，日常修改 TypeScript
和界面代码只需启动 Metro：

```bash
npm start
```

让 iPhone 与 Mac 处于同一局域网，然后打开手机上的「拾序」。需要让服务
长期驻留时可使用：

```bash
tmux new-session -d -s shixu 'npm start'
tmux attach -t shixu
```

只有新增或升级原生依赖时才需要重新执行 `npm run ios -- --device`。真机相机只在
iOS / Android 设备上工作。

## 检查

```bash
npm run typecheck
npm run test:detection
npm run doctor
npx expo export --platform ios
```

## 隐私

图片、几何校正和 PDF 生成均在设备本地完成。项目没有账号系统、分析 SDK 或远程上传接口。
