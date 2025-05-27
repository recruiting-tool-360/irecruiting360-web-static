class SvgBase64Manager {
  constructor() {
      this.base64Cache = new Map();
  }

  async getSvgBase64(svgPath) {
      try {
          if (this.base64Cache.has(svgPath)) {
              return this.base64Cache.get(svgPath);
          }

          const response = await fetch(svgPath);
          const svgText = await response.text();
          const base64Url = `data:image/svg+xml;base64,${btoa(svgText)}`;
          this.base64Cache.set(svgPath, base64Url);
          return base64Url;
      } catch (error) {
          console.error('加载 SVG 失败:', error);
          throw error;
      }
  }

  cleanup(svgPath) {
      if (this.base64Cache.has(svgPath)) {
          URL.revokeObjectURL(this.base64Cache.get(svgPath));
          this.base64Cache.delete(svgPath);
      }
  }

  cleanupAll() {
      for (const [path, url] of this.base64Cache.entries()) {
          URL.revokeObjectURL(url);
      }
      this.base64Cache.clear();
  }
}

export default SvgBase64Manager;