import { injectable } from 'inversify';
import path from 'path';
import { app, dialog, shell } from 'electron';
import dayjs from 'dayjs';
import fs, { promises as fsAsync } from 'fs';
import { IErrorHandlerService } from './interfaces/i-error-handler.service';

@injectable()
export class ErrorHandlerService implements IErrorHandlerService {

  public async handleError(e: Error) {
    const logPath = path.resolve(app.getPath('appData'), 'TrayCommander', 'logs', `Error_${dayjs().format('YYYY-MM-DD_hh-mm-ss')}.log`);
    const logDir = path.dirname(logPath);
    if (!fs.existsSync(logDir)) { fs.mkdirSync(logDir, { recursive: true }); }
    await fsAsync.writeFile(logPath, `${e.message}\r\n\r\n${e.stack}`);
    const result = await dialog.showMessageBox({
      type: 'error',
      title: 'Tray Commander has encountered an error',
      message: e.message,
      detail: `The full detail has been written to ${logPath}`,
      buttons: ['Open Log File', 'Quit'],
      defaultId: 0,
      cancelId: 1
    });
    if (result.response === 0) { await shell.openPath(logPath); }
    process.exit(-1);
  }

}
