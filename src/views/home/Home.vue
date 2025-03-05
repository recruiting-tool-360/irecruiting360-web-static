<template>
  <div class="home-container">
    <!-- 导航栏 -->
    <div class="nav-bar" style="background: rgba(31, 124, 255, 1);">
      <div class="nav-content">
        <div class="nav-left">
          <div class="logo-container" style="height: 30px;">
            <img src="/logo/ikuaizhaologo.jpg" alt="ikuaizhao" class="nav-logo" style="height: 100%; width: auto;" />
          </div>
          <router-link to="/" class="nav-item" style="color: #fff;">产品</router-link>
          <router-link to="/" class="nav-item" style="color: #fff;">订阅</router-link>
        </div>
        <div class="nav-right">
          <router-link to="/login" class="login-btn" style="color: #fff;">登录</router-link>
        </div>
      </div>
    </div>

    <!-- 主要内容区 -->
    <div class="main-content">
      <!-- 头部标题区域 -->
      <div class="hero-section">
        <h1 class="main-title">聚合搜索 智能招聘</h1>
        <p class="subtitle">上线在即</p>
      </div>

      <!-- 特性卡片区域 -->
      <div class="features-grid">
        <div class="feature-card">
          <h2>聚合</h2>
          <div class="feature-content">
            <h3>多渠道搜索结果聚合</h3>
            <p>一键找到您的最佳候选人</p>
            <el-button class="more-btn" text>更多</el-button>
          </div>
        </div>

        <div class="feature-card">
          <h2>全面</h2>
          <div class="feature-content">
            <h3>全渠道搜索条件过滤</h3>
            <p>全面满足您对岗位的要求</p>
            <el-button class="more-btn" text>更多</el-button>
          </div>
        </div>

        <div class="feature-card">
          <h2>精准</h2>
          <div class="feature-content">
            <h3>精准条件匹配</h3>
            <p>寻找最合适的对象</p>
            <el-button class="more-btn" text>更多</el-button>
          </div>
        </div>

        <div class="feature-card">
          <h2>智能</h2>
          <div class="feature-content">
            <h3>AI Agent人岗匹配助手</h3>
            <p>快招管家伴你左右</p>
            <el-button class="more-btn" text>更多</el-button>
          </div>
        </div>
      </div>

      <!-- 底部区域 -->
      <div class="bottom-section">
        <h2 class="coming-soon">敬请期待</h2>
        <el-button type="primary" class="subscribe-btn">订阅</el-button>
      </div>
    </div>

    <!-- 页脚 -->
    <footer class="footer">
      <div class="footer-content">
        <div class="copyright">© 上海智寻才信息科技有限公司 2025</div>
        <div class="social-links">
          <a href="mailto:service@ihire365.com" class="social-link">Email</a>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
// 组件逻辑
</script>

<style scoped>
.home-container {
  min-height: 100vh;
  background-color: #ffffff;
}

.nav-bar {
  position: fixed;
  top: 0;
  width: 100%;
  background: rgba(31, 124, 255, 1);
  z-index: 100;
  padding: 16px 0;
}

.nav-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 30px;
}

.logo-container {
  display: flex;
  align-items: center;
  gap: 8px;
  text-decoration: none;
}

.nav-logo {
  height: 32px;
  width: 32px;
}

.logo-text {
  font-size: 20px;
  font-weight: bold;
  color: #ffffff;
}

.nav-item {
  text-decoration: none;
  color: #ffffff;
  font-size: 16px;
}

.nav-item:hover {
  opacity: 0.8;
}

.login-btn {
  text-decoration: none;
  color: #ffffff;
  font-size: 16px;
}

.login-btn:hover {
  opacity: 0.8;
}

.main-content {
  padding-top: 100px;
  max-width: 1200px;
  margin: 0 auto;
  padding: 120px 20px 60px;
}

.hero-section {
  text-align: center;
  margin-bottom: 80px;
}

.main-title {
  font-size: 48px;
  font-weight: bold;
  margin-bottom: 20px;
}

.subtitle {
  font-size: 24px;
  color: #666;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 30px;
  margin-bottom: 80px;
}

.feature-card {
  padding: 30px;
  border-radius: 12px;
  background: #f8f9fa;
  transition: transform 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-5px);
}

.feature-card h2 {
  font-size: 28px;
  margin-bottom: 20px;
}

.feature-content h3 {
  font-size: 20px;
  margin-bottom: 10px;
}

.feature-content p {
  color: #666;
  margin-bottom: 20px;
}

.more-btn {
  color: rgba(31, 124, 255, 1);
}

.bottom-section {
  text-align: center;
  margin-bottom: 60px;
}

.coming-soon {
  font-size: 32px;
  margin-bottom: 30px;
}

.subscribe-btn {
  font-size: 18px;
  padding: 12px 40px;
}

.footer {
  background: #222222;
  padding: 30px 0;
}

.footer-content {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
}

.copyright {
  color: #ffffff;
  font-size: 14px;
}

.social-links {
  display: flex;
  gap: 20px;
}

.social-link {
  color: #ffffff;
  text-decoration: none;
  font-size: 14px;
}

.social-link:hover {
  color: rgba(31, 124, 255, 1);
}

@media (max-width: 768px) {
  .main-title {
    font-size: 36px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .footer-content {
    flex-direction: column;
    gap: 20px;
    text-align: center;
  }
}
</style>