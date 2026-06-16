boss 标签 tab webcontent 全局唯一，
启动客户端如果发现 boss 渠道启用状态就默认打开职位管理的 boss 地址，对用户不可见，不显示 tab 标签，并开启监听这个 webcontent 的地址变化，如果不包含 https://www.zhipin.com/web/chat 等同于当前登录失效，包含的就登录有效，然后通知出去刷新 boss 登录状态，每个地址都会监听这个 boss 登录状态
如果当前登录是失效的，用户点击 header boss 直聘，打开 boss 页面登录。把不可见的 boss tab 改为可见(不能新开，所有的 boss 页面都用同一个)，如果当前 boss 地址包含了 https://www.zhipin.com/web/chat 就发通知出去登录状态有效
推荐人牛任务执行的时候 把当前 boss 这个 tab 改为可见，正常进行推荐牛人任务。登录状态监听一直挂在这个 webcontent 里面。
如果当前用户把 boss 渠道禁用了就销毁这个 boss webcontent, 如果 boss 启用了，就走客户端启动流程，打开职位管理的 boss 地址(会去监听职位列表接口，更新到本地缓存，这个是已经实现了)
