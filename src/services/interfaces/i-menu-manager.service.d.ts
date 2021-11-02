export interface IMenuManagerService {
  init(tray: Electron.CrossProcessExports.Tray): Promise<void>;
}
