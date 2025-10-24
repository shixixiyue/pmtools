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
    this.prompts = {
      canvas: '',
      swot: ''
    };
    this.loadConfig();
    this.loadPrompts();
  }

  // 加载API配置
  loadConfig() {
    const savedConfig = Utils.storage.get('apiConfig');
    if (savedConfig) {
      this.config = { ...this.config, ...savedConfig };
    }
  }

  // 加载系统提示词
  async loadPrompts() {
    try {
      // 加载产品画布提示词
      const canvasResponse = await fetch('prompts/canvas-prompt.txt');
      this.prompts.canvas = await canvasResponse.text();
      
      // 加载SWOT分析提示词
      const swotResponse = await fetch('prompts/swot-prompt.txt');
      this.prompts.swot = await swotResponse.text();
    } catch (error) {
      console.error('加载提示词失败:', error);
      // 使用默认提示词
      this.prompts.canvas = '你是一个专业的产品战略分析师，擅长创建产品画布。';
      this.prompts.swot = '你是一个专业的商业战略分析师，擅长进行SWOT分析。';
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
    const messages = [
      { role: 'system', content: this.prompts.canvas },
      ...context,
      { role: 'user', content: userRequest }
    ];

    return await this.sendChatMessage(messages, { maxTokens: 3000 });
  }

  // 生成SWOT分析的专用方法
  async generateSWOTAnalysis(userRequest, context = []) {
    const messages = [
      { role: 'system', content: this.prompts.swot },
      ...context,
      { role: 'user', content: userRequest }
    ];

    return await this.sendChatMessage(messages, { maxTokens: 3000 });
  }

  // 流式生成产品画布
  async generateProductCanvasStream(userRequest, context = [], onChunk, onComplete) {
    const messages = [
      { role: 'system', content: this.prompts.canvas },
      ...context,
      { role: 'user', content: userRequest }
    ];

    return await this.sendChatMessageStream(messages, { maxTokens: 3000 }, onChunk, onComplete);
  }

  // 流式生成SWOT分析
  async generateSWOTAnalysisStream(userRequest, context = [], onChunk, onComplete) {
    const messages = [
      { role: 'system', content: this.prompts.swot },
      ...context,
      { role: 'user', content: userRequest }
    ];

    return await this.sendChatMessageStream(messages, { maxTokens: 3000 }, onChunk, onComplete);
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
      await Utils.createStreamRequest(
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
        content: msg.content
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

    const mode = Utils.storage.get('currentMode', 'canvas');
    
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