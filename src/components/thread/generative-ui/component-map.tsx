import { CardUI } from "./card";

// 当前正式业务 UI 协议只保留 card。
// choice/form 文件即使还存在，也不是当前正式主链路，避免误导后端继续发旧协议。
export const clientComponents = {
  card: CardUI,
};
