# 意图
一个跨平台（Win/Mac）现代、轻量、简洁、类型安全、异步的 TypeScript 音频 SDK，支持录制麦克风、系统音频。

# 主要目标
- 跨平台，支持 Windows 和 macOS
- 使用 TypeScript 开发，类型安全，全异步 API
- 支持录制麦克风、系统音频、应用音频
- 固定采样率 48khz, 16bit, PCM 音频
- 无需编码音频，返回原始音频数据
- 包含完整的测试用例，Native 侧和 TS 侧均有测试
- Windows 使用 WASAPI，macOS 使用 AVFoundation/ScreenCaptureKit
- Node.js 16.0.0 或更高版本
- macOS 13.0 (Ventura) 或更高版本（ScreenCaptureKit 要求）
- Windows 10 或更高版本

# 开发模式
- 文档先行，在 /docs 目录下编写所有必须的文档，设计好所有接口以及顶层设计架构
- 测试驱动，必须配备对应的单元测试和集成测试，native 侧和 TS 侧均有测试