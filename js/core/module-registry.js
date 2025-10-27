(function (global) {
  'use strict';

  class ModuleRegistry {
    constructor() {
      this.modules = new Map();
      this.order = [];
    }

    register(manifest) {
      if (!manifest || !manifest.id) {
        throw new Error('注册模块失败：缺少 id');
      }
      if (this.modules.has(manifest.id)) {
        console.warn(`模块 ${manifest.id} 已存在，将被覆盖`);
      } else {
        this.order.push(manifest.id);
      }
      this.modules.set(manifest.id, manifest);
    }

    get(moduleId) {
      return this.modules.get(moduleId) || null;
    }

    list() {
      return this.order.map((id) => this.modules.get(id));
    }

    has(moduleId) {
      return this.modules.has(moduleId);
    }
  }

  global.ModuleRegistry = new ModuleRegistry();
})(window);
