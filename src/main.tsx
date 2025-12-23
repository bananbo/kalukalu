import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  // StrictModeを無効化（アニメーションループの二重実行を防ぐ）
  <App />
);
