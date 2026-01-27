/**
 * API客户端 - 处理与AI服务的交互
 */

class APIClient {
  constructor() {
    this.config = {
      url: '',
      key: '',
      model: ''
    };
    this.promptMap = {};
    this.promptFiles = {
      canvas: 'prompts/canvas-prompt.txt',
      swot: 'prompts/swot-prompt.txt',
      thinksvg: 'prompts/thinksvg-prompt.txt',
      echarts: 'prompts/echarts-prompt.txt',
      mermaid: 'prompts/mermaid-prompt.txt',
      onepage: 'prompts/onepage-prompt.txt'
    };
    this.promptFallbacks = {
      canvas: '你是一个专业的产品战略分析师，擅长创建产品画布。',
      swot: '你是一个专业的商业战略分析师，擅长进行SWOT分析。',
      thinksvg: '你是一名思维导图专家，擅长使用 SVG 生成清晰的思维导图。',
      echarts:
        '你是一个资深的数据可视化专家，精通将自然语言需求转化为 ECharts 配置对象，请输出结构化 JSON option。',
      mermaid:
        '你是一个资深的可视化工程师，擅长用 Mermaid 语法创建清晰的图示，请只输出一个 ```mermaid 代码块。',
      onepage:
        '你是一名资深的落地页架构师，请基于需求生成完整的单文件 HTML（含 Tailwind 样式与必要的原生脚本），并使用 ```html 代码块封装输出。',
      default:
        '你是一个可靠的智能助手，请直接回答用户的问题并提供结构化输出。'
    };
    this.loadConfig();
    this.preloadPrompts(Object.keys(this.promptFiles));
  }

  // 加载API配置
  loadConfig() {
    const savedConfig = Utils.storage.get('apiConfig');
    if (savedConfig) {
      this.config = { ...this.config, ...savedConfig };
    }
  }

  preloadPrompts(keys = []) {
    keys.forEach((key) => {
      this.ensurePrompt(key).catch((error) =>
        console.warn(`预加载提示词 ${key} 失败:`, error)
      );
    });
  }

  async ensurePrompt(promptKey) {
    if (!promptKey) return '';
    if (this.promptMap[promptKey]) {
      return this.promptMap[promptKey];
    }
    const prompt = await this.fetchPrompt(promptKey);
    this.promptMap[promptKey] = prompt;
    return prompt;
  }

  async fetchPrompt(promptKey) {
    const filePath = this.promptFiles[promptKey];
    const fallback =
      this.promptFallbacks[promptKey] ||
      '你是一个可靠的智能助手，请直接回答用户问题。';

    if (!filePath) {
      console.warn(`未找到提示词 ${promptKey} 对应的文件配置`);
      return fallback;
    }

    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      return text.trim() || fallback;
    } catch (error) {
      console.warn(`加载提示词 ${promptKey} 失败:`, error);
      return fallback;
    }
  }

  // 保存API配置
  saveConfig(config) {
    this.config = { ...this.config, ...config };
    return Utils.storage.set('apiConfig', this.config);
  }

  // 获取当前配置
  getConfig() {
    return { ...this.config };
  }

  // 验证配置是否完整
  isConfigValid() {
    return this.config.url && this.config.key && this.config.model;
  }

  // 测试API连接
  async testConnection() {
    if (!this.isConfigValid()) {
      throw new Error('API配置不完整，请填写所有字段');
    }

    try {
      const response = await this.makeRequest([
        { role: 'user', content: '测试连接' }
      ], 5);

      return { success: true, data: response };
    } catch (error) {
      throw new Error(`连接测试失败: ${error.message}`);
    }
  }

  async buildMessagesForModule(manifest, userMessage, contextMessages = []) {
    const prompt =
      (manifest && manifest.promptKey
        ? await this.ensurePrompt(manifest.promptKey)
        : null) || this.promptFallbacks.default;

    return [
      { role: 'system', content: prompt },
      ...contextMessages,
      { role: 'user', content: userMessage }
    ];
  }

  async generateModuleCompletion(
    manifest,
    userMessage,
    contextMessages = [],
    options = {}
  ) {
    const messages = await this.buildMessagesForModule(
      manifest,
      userMessage,
      contextMessages
    );
    return this.sendChatMessage(messages, options);
  }

  async generateModuleStream(
    manifest,
    userMessage,
    contextMessages = [],
    onChunk,
    onComplete,
    options = {}
  ) {
    const messages = await this.buildMessagesForModule(
      manifest,
      userMessage,
      contextMessages
    );
    return this.sendChatMessageStream(messages, options, onChunk, onComplete);
  }

  // 发送聊天请求
  async sendChatMessage(messages, options = {}) {
    if (!this.isConfigValid()) {
      throw new Error('API配置不完整，请先配置API设置');
    }

    const maxTokens = options.maxTokens || 2000;
    const temperature = options.temperature || 0.7;

    try {
      const response = await this.makeRequest(messages, maxTokens, temperature);
      return response;
    } catch (error) {
      throw new Error(`API请求失败: ${error.message}`);
    }
  }

  // 核心请求方法
  async makeRequest(messages, maxTokens, temperature = 0.7) {
    const requestBody = {
      model: this.config.model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature
    };

    const response = await fetch(this.config.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      throw new Error('API返回数据格式异常');
    }

    return data.choices[0].message.content;
  }

  // 生成产品画布的专用方法
  async generateProductCanvas(userRequest, context = []) {
    return this.generateModuleCompletion(
      { promptKey: 'canvas' },
      userRequest,
      context,
      { maxTokens: 18000 }
    );
  }

  // 生成SWOT分析的专用方法
  async generateSWOTAnalysis(userRequest, context = []) {
    return this.generateModuleCompletion(
      { promptKey: 'swot' },
      userRequest,
      context,
      { maxTokens: 18000 }
    );
  }

  // 流式生成产品画布
  async generateProductCanvasStream(userRequest, context = [], onChunk, onComplete) {
    return this.generateModuleStream(
      { promptKey: 'canvas' },
      userRequest,
      context,
      onChunk,
      onComplete,
      { maxTokens: 13000 }
    );
  }

  // 流式生成SWOT分析
  async generateSWOTAnalysisStream(userRequest, context = [], onChunk, onComplete) {
    return this.generateModuleStream(
      { promptKey: 'swot' },
      userRequest,
      context,
      onChunk,
      onComplete,
      { maxTokens: 13000 }
    );
  }

  // 流式发送聊天请求
  async sendChatMessageStream(messages, options = {}, onChunk, onComplete) {
    if (!this.isConfigValid()) {
      throw new Error('API配置不完整，请先配置API设置');
    }

    const maxTokens = options.maxTokens || 2000;
    const temperature = options.temperature || 0.7;
    const stream = true;

    const requestBody = {
      model: this.config.model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
      stream: stream
    };

    const url = this.config.url.replace('/chat/completions', '/chat/completions');
    
    try {
      return Utils.createStreamRequest(
        url,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.key}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        },
        onChunk,
        onComplete
      );
    } catch (error) {
      throw new Error(`流式API请求失败: ${error.message}`);
    }
  }

  // 重新生成响应
  async regenerateResponse(messageId, conversationHistory) {
    // 找到指定消息ID之前的所有对话历史
    const contextMessages = conversationHistory
      .filter(msg => msg.id <= messageId)
      .map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        // 优先使用原始内容，保证上下文完整性
        content: msg.rawContent || msg.content || ''
      }));

    if (contextMessages.length === 0) {
      throw new Error('没有找到有效的对话上下文');
    }

    // 移除最后一条消息（需要重新生成的消息）
    if (contextMessages.length > 0 && contextMessages[contextMessages.length - 1].role === 'assistant') {
      contextMessages.pop();
    }

    // 根据当前模式选择相应的生成方法
    const lastUserMessage = contextMessages.filter(msg => msg.role === 'user').pop();
    if (!lastUserMessage) {
      throw new Error('没有找到用户消息');
    }

    const activeModuleId = Utils.storage.get('tool-engine:activeModuleId', 'product-canvas');
    const mode = activeModuleId === 'swot' ? 'swot' : 'canvas';
    
    if (mode === 'canvas') {
      return await this.generateProductCanvas(lastUserMessage.content, contextMessages.slice(0, -1));
    } else {
      return await this.generateSWOTAnalysis(lastUserMessage.content, contextMessages.slice(0, -1));
    }
  }

  // 模拟API响应（用于测试）
  simulateAPIResponse(userMessage, mode = 'canvas') {
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockResponses = [
          `好的！我为您生成了一个${mode === 'canvas' ? '产品画布' : 'SWOT分析'}
\`\`\`svg
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#f8f9fa"/>
  <rect x="50" y="50" width="500" height="300" fill="url(#grad1)" rx="10"/>
  <text x="300" y="200" text-anchor="middle" font-size="24" fill="white" font-weight="bold">
    这是${mode === 'canvas' ? '产品画布' : 'SWOT分析'}示例SVG
  </text>
  <circle cx="150" cy="150" r="40" fill="#ffffff" opacity="0.3"/>
  <circle cx="450" cy="250" r="30" fill="#ffffff" opacity="0.3"/>
</svg>
\`\`\`
包含了关键要素和模块。点击上方标签可在右侧查看详细图表。`,

          `已经为您调整完成！
\`\`\`svg
<svg width="600" height="400" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="grad2" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#f59e0b;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#ef4444;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="#fff"/>
  <rect x="75" y="75" width="450" height="250" fill="url(#grad2)" rx="15"/>
  <text x="300" y="200" text-anchor="middle" font-size="28" fill="white" font-weight="bold">
    ${mode === 'canvas' ? '优化后的产品画布' : '优化后的SWOT分析'}
  </text>
  <rect x="100" y="120" width="80" height="60" fill="#ffffff" opacity="0.2" rx="5"/>
  <rect x="420" y="220" width="80" height="60" fill="#ffffff" opacity="0.2" rx="5"/>
</svg>
\`\`\`
采用了更加鲜明的色彩组合，希望您满意！`
        ];
        
        const response = mockResponses[Math.floor(Math.random() * mockResponses.length)];
        resolve(response);
      }, 1000 + Math.random() * 1000); // 1-2秒的随机延迟
    });
  }
}

// 创建全局API客户端实例
window.apiClient = new APIClient();
