import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

// NOTE:
// 之前这里做过“打字埋点”，但它无法判断 hit/miss，
// 还会把大量噪音写进 telemetry 表。
// 现在改为：只在 App 内“完成一次检索”后再上报（带 isHit）。

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
