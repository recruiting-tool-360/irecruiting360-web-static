class QueueManager {
    constructor() {
        this.queue = []; // 队列
        this.timer = null; // 定时器
        this.interval = 3000; // 定时器间隔，默认3秒
        this.isRunning = false; // 定时器状态
        this.fn = null;
    }

    // 停止定时器
    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
            this.isRunning = false;
        }
    }

    // 向队列添加数据
    enqueue(data) {
        if (this.queue.length > 1000){
            this.stop();
        }else{
            if(this.queue.length===0&&this.isRunning===false){
                this.start(this.interval,this.fn);
            }
            this.queue.push(data);
        }
    }

    // 从队列中取数据并处理
    dequeueAndProcess() {
        if (this.queue.length > 0) {
            const item = this.queue.shift(); // 获取队列头部数据
            if(this.fn!=null){
                this.fn(item);
            }
        }else{
            this.stop();
        }
    }

    // 开始定时器
    start(interval = 3000,fn = null) {
        if (this.isRunning) return;
        this.interval = interval;
        this.fn = fn;
        this.isRunning = true;
        this.timer = setInterval(() => this.dequeueAndProcess(this.fn), this.interval);
    }

}

// 创建单例实例
const boosQueueManager = new QueueManager();
const zhiLianQueueManager = new QueueManager();

const liePinQueueManager = new QueueManager();

const job51QueueManager = new QueueManager();
// 命名导出
export { boosQueueManager, zhiLianQueueManager, liePinQueueManager,job51QueueManager };