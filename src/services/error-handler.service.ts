import { inject, injectable } from 'inversify';
import path from 'path';
import { dialog, shell } from 'electron';
import dayjs from 'dayjs';
import fs, { promises as fsAsync } from 'fs';
import { IErrorHandlerService } from './interfaces/i-error-handler.service';
import { TYPES } from '../types';
import { IConfigService } from './interfaces/i-config.service';

@injectable()
export class ErrorHandlerService implements IErrorHandlerService {

  public constructor(@inject(TYPES.IConfigService) private readonly config: IConfigService) { }

  public async handleError(e: Error) {
    const logPath = path.resolve(this.config.dataPath, 'logs', `error-${dayjs().format('YYYY-MM-DD_hh-mm-ss')}.log`);
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
