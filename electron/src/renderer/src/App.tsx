import electronLogo from './assets/512x512.png'

function App(): React.JSX.Element {
  return (
    <>
      <img alt="logo" className="logo" src={electronLogo} />
      <div className="creator">聚合搜索高效匹配</div>
      <div className="text">
        i快招-开启 <span className="react">AI</span>
        &nbsp;and <span className="ts">智能招聘新时代</span>
      </div>
      <div className="loader-container">
        <div className="loader"></div>
        <div className="load-text">加载中...</div>
      </div>
    </>
  )
}

export default App
