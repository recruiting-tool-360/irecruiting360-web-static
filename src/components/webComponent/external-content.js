class ExternalContent extends HTMLElement {
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });

        // 创建容器
        const container = document.createElement('div');
        container.setAttribute('id', 'content');

        // 添加样式隔离
        const style = document.createElement('style');
        style.textContent = `
      #content {
        border: 1px solid #ccc;
        padding: 10px;
        overflow: auto;
        width: 100%;
        height: 100%;
      }
    `;

        shadow.appendChild(style);
        shadow.appendChild(container);
    }

    // 当元素被插入 DOM 时加载内容
    connectedCallback() {
        const url = this.getAttribute('data-url');
        if (url) {
            this.loadContent(url);
        }
    }

    async loadContent(url) {
        const shadow = this.shadowRoot;
        const container = shadow.querySelector('#content');
        try {
            const response = await fetch(url, {
                // credentials: 'include', // 确保携带 Cookie
            });
            const html = await response.text();
            container.innerHTML = html;
        } catch (error) {
            console.error('Failed to load content:', error);
            container.textContent = 'Failed to load content.';
        }
    }
}

customElements.define('external-content', ExternalContent);
