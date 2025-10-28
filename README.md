# 产品分析工具

一个基于AI对话的产品战略分析工具，帮助用户快速生成产品画布、SWOT、分析图表等，支持产品规划和决策。

![纯前端JS](https://img.shields.io/badge/纯前端-JS-informational)
![AI驱动](https://img.shields.io/badge/AI驱动--important)

## 🌟 功能特点

### 🔄 多模式切换系统
- **产品画布模式**：生成和展示产品画布图表
- **SWOT分析模式**：生成和展示SWOT分析图表
- **ECharts图表模式**：生成数据可视化图表
- **Mermaid图表模式**：生成流程图和关系图

![](/设计/images/mermaid.jpeg)
![](/设计/images/echart.jpeg)
![](/设计/images/huabu.jpeg)
![](/设计/images/swot.jpeg)
![](/设计/images/peizhi.jpeg)

### 💬 AI对话交互系统
- **智能对话**：基于自然语言的产品分析请求
- **消息发送**：用户输入文本请求，支持Enter键快捷发送
- **对话历史**：保存并展示用户与AI的完整对话记录
- **消息操作**：支持退回、重新生成、删除消息

### 📊 图表生成与展示系统
- **SVG图表生成**：根据用户请求生成相应的SVG图表
- **图表占位符**：对话中显示可点击的图表预览块
- **图表渲染**：点击占位符在右侧面板完整展示SVG图表
- **图表存储**：本地存储生成的SVG内容，支持历史查看
- **缩放控制**：支持图表的放大、缩小和重置

### 🛠️ 图表导出功能
- **SVG下载**：将当前图表导出为SVG文件
- **图片导出**：将当前图表导出为PNG图片格式
- **剪贴板复制**：复制图表图片到剪贴板
- **代码查看**：查看当前图表的SVG源代码

## **所有数据均由浏览器本地缓存，清空后就清空了💨**

## 🚀 快速开始

### 环境要求
- 现代浏览器（支持ES6+）

#### 方法1：本地运行

下载下来用GoLive启动下；或者直接打开`index.html`

#### 方法2：使用Docker
```bash
# 构建并运行容器
docker-compose up -d

# 在浏览器中访问
open http://localhost:3000
```

docker-compose.yml

``` docker-compose.yml
version: '3.8'

services:
  product-canvas:
    image: 935732994/pmtools
    ports:
      - "3000:3000"
    restart: unless-stopped
```


### 配置API

1. 点击右上角的"API配置"按钮
2. 填写以下信息：
   - **API URL**：您的AI服务API地址
   - **API Key**：您的API密钥
   - **模型**：选择使用的AI模型（如gpt-4）
3. 点击"保存配置"完成设置
4. 点击"测试连接"验证配置，先保存再测试
> 有些API会出现 失败情况 `连接测试失败: NetworkError when attempting to fetch resource.` 这时需要找不失败的💨

## 📁 项目结构

```
产品画布/
├── index.html              # 主页面
├── css/
│   └── style.css           # 自定义样式
├── js/
│   ├── app.js              # 应用入口
│   ├── apiclient.js        # API客户端
│   ├── utils.js            # 工具函数
│   ├── core/               # 核心模块
│   │   ├── app-shell.js    # 应用外壳
│   │   ├── module-registry.js # 模块注册表
│   │   └── module-runtime.js  # 模块运行时
│   ├── modules/            # 功能模块
│   │   ├── product-canvas.js # 产品画布模块
│   │   ├── swot.js         # SWOT分析模块
│   │   ├── echarts.js      # ECharts图表模块
│   │   └── mermaid.js      # Mermaid图表模块
│   ├── services/           # 服务层
│   │   ├── conversation-service.js # 对话服务
│   │   └── storage-service.js     # 存储服务
│   └── renderers/          # 渲染器
├── libs/                   # 第三方库
│   ├── css/                # 样式库
│   ├── fonts/              # 字体文件
│   └── js/                 # JavaScript库
├── prompts/                # AI提示词
│   ├── canvas-prompt.txt   # 产品画布提示词
│   ├── swot-prompt.txt     # SWOT分析提示词
│   ├── echarts-prompt.txt  # ECharts提示词
│   └── mermaid-prompt.txt  # Mermaid提示词
├── 设计/                   # 设计文件
│   └── 原型.html           # 设计原型
├── 功能概述.md             # 功能说明文档
├── docker-compose.yml      # Docker编排文件
├── Dockerfile              # Docker镜像构建文件
└── README.md               # 项目说明文档
```

## 🎯 使用指南

### 基本使用流程

1. **选择模式**：点击顶部的模式按钮选择所需的分析类型
2. **输入需求**：在左侧对话框中描述您的产品或分析需求
3. **生成图表**：AI将根据您的需求生成相应的分析图表
4. **查看图表**：点击对话中的图表占位符在右侧查看完整图表
5. **导出结果**：使用底部工具栏导出或复制图表

### 产品画布模式

产品画布模式帮助您快速构建产品战略框架：

```
示例输入：
"请为我的社区废品回收智能终端系统生成一个产品画布"
```

生成的画布包含：
- 问题分析
- 客户群体
- 独特卖点
- 解决方案
- 渠道策略
- 收入分析
- 成本分析
- 关键指标
- 门槛优势

### SWOT分析模式

SWOT分析模式帮助您评估项目的优势、劣势、机会和威胁：

```
示例输入：
"请对我的在线教育平台进行SWOT分析"
```

生成的分析包含：
- **优势(Strengths)**：内部有利因素
- **劣势(Weaknesses)**：内部不利因素
- **机会(Opportunities)**：外部有利因素
- **威胁(Threats)**：外部不利因素

### 高级功能

#### 消息操作
- **退回**：回退到指定消息，删除该消息之后的所有对话
- **重新生成**：针对最后一条AI消息重新请求生成内容
- **删除**：删除特定消息及其关联的图表

#### 图表操作
- **缩放控制**：使用工具栏按钮调整图表大小
- **全屏查看**：在右侧面板获得更好的查看体验
- **多格式导出**：支持SVG、PNG等多种导出格式

## 🔧 开发指南

### 技术栈

- **前端框架**：原生JavaScript (ES6+)
- **样式框架**：Tailwind CSS
- **图标库**：Iconify
- **图表库**：ECharts, Mermaid
- **Markdown解析**：Marked.js
- **字体**：Inter Font

## 📝 更新日志

### v1.0.0 (2025年10月27日)
- ✨ 初始版本发布

---

⭐ 如果这个项目对您有帮助，请给我们一个星标！