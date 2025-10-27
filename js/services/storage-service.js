(function (global) {
  'use strict';

  /**
   * 提供按命名空间隔离的本地存储封装
   * 依赖 Utils.storage 作为底层驱动
   */
  class NamespacedStorage {
    constructor(namespace) {
      this.namespace = namespace;
    }

    _key(key) {
      return `${this.namespace}:${key}`;
    }

    get(key, defaultValue = null) {
      return Utils.storage.get(this._key(key), defaultValue);
    }

    set(key, value) {
      return Utils.storage.set(this._key(key), value);
    }

    remove(key) {
      return Utils.storage.remove(this._key(key));
    }

    clear() {
      const prefix = `${this.namespace}:`;
      const toDelete = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const storageKey = localStorage.key(i);
        if (storageKey && storageKey.startsWith(prefix)) {
          toDelete.push(storageKey);
        }
      }
      toDelete.forEach((storageKey) => localStorage.removeItem(storageKey));
    }
  }

  class StorageService {
    constructor(globalNamespace = 'tool-engine') {
      this.globalNamespace = globalNamespace;
      this.cache = new Map();
    }

    /**
     * 获取全局命名空间存储
     */
    global() {
      if (!this.cache.has(this.globalNamespace)) {
        this.cache.set(
          this.globalNamespace,
          new NamespacedStorage(this.globalNamespace)
        );
      }
      return this.cache.get(this.globalNamespace);
    }

    /**
     * 获取指定命名空间存储
     */
    namespace(namespace) {
      if (!namespace) {
        throw new Error('Storage namespace 不能为空');
      }
      if (!this.cache.has(namespace)) {
        this.cache.set(namespace, new NamespacedStorage(namespace));
      }
      return this.cache.get(namespace);
    }

    /**
     * 清除指定命名空间内容
     */
    clearNamespace(namespace) {
      const store = this.namespace(namespace);
      store.clear();
    }
  }

  global.StorageService = StorageService;
})(window);
