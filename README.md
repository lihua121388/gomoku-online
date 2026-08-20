# 落子 · 联机五子棋

一个两人联机的 15×15 五子棋网页游戏。服务端使用 Node.js、Express 和 Socket.IO，服务端保存并校验所有棋局状态。

## 运行

```bash
npm install
npm start
```

打开 <http://localhost:3000>。一人创建房间，把 4 位房间码发给另一人；另一人输入房间码加入。

## 项目结构

```text
server.js       # Express 静态服务、Socket.IO、房间和落子规则
public/
  index.html    # 页面结构
  styles.css    # 响应式视觉样式
  app.js        # 棋盘渲染和客户端交互
```

服务端保证房间最多两人、黑棋先行、严格轮流、空位校验、横竖斜四方向五连判胜和重新开局。玩家断开时，房间内仍在线的一方会收到连接提示；空房间在 30 秒后清理。
