import React from 'react';
import ReactDOM from 'react-dom';
import './index.css'; // 引入你的 CSS 文件
import App from './App'; // 引入主组件

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById('root') // 确保这里匹配 index.html 中的 div id="root"
);
