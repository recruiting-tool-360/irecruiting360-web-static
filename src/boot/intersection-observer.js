import { boot } from 'quasar/wrappers';

export default boot(({ app }) => {
  // 创建自定义指令 v-intersection
  app.directive('intersection', {
    // 在绑定元素的父组件被挂载后调用
    mounted(el, binding) {
      console.log('v-intersection mounted on:', el);
      console.log('Element dataset:', el.dataset);
      
      // 创建一个IntersectionObserver实例
      const observer = new IntersectionObserver(
        (entries) => {
          console.log('IntersectionObserver callback with entries:', entries.length);
          // 对每个观察目标执行回调，传递entries[0]以保持与原始代码兼容
          entries.forEach(entry => {
            console.log('Processing entry:', entry.target.dataset);
            binding.value(entry);
          });
        },
        {
          // 配置选项
          threshold: [0.1], // 当目标元素10%可见时触发回调
          root: null, // 使用视口作为根元素
          rootMargin: '0px' // 根元素的边距
        }
      );
      
      // 开始观察目标元素
      observer.observe(el);
      
      // 存储observer以便于卸载时使用
      el._intersectionObserver = observer;
    },
    
    // 在绑定元素的父组件卸载后调用
    unmounted(el) {
      // 如果存在观察者，停止观察并清理
      if (el._intersectionObserver) {
        el._intersectionObserver.disconnect();
        delete el._intersectionObserver;
      }
    }
  });
}); 