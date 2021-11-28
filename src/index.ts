import * as electron from 'electron';
import { app, Tray } from 'electron';
import { menubar } from 'menubar';
import * as path from 'path';
import commandLineArgs from 'command-line-args';
import 'reflect-metadata';
import { container } from './inversify.config';
import { IConfigService } from './services/interfaces/i-config.service';
import { IMenuManagerService } from './services/interfaces/i-menu-manager.service';
import { TYPES } from './types';
import { IOptions } from './models/i-options';
import 'source-map-support/register';
import { IErrorHandlerService } from './services/interfaces/i-error-handler.service';
import { IIconService } from './services/interfaces/i-icon.service';

// Quit if there is already an instance of the app running
if (!app.requestSingleInstanceLock()) { app.quit(); }

app.on('ready', async () => {
  try {
    container.bind<IOptions>(TYPES.IOptions).toConstantValue(commandLineArgs([{ name: 'config', alias: 'c', type: String, defaultOption: true }]) as IOptions);
    container.bind<Electron.App>(TYPES.App).toConstantValue(app);
    const config = container.get<IConfigService>(TYPES.IConfigService);
    await config.init();
    electron.app.setLoginItemSettings({ // Configure run on startup
      openAtLogin: config.settings.openAtLogin && !electron.app.getPath('exe').includes('electron.exe'),
      path: electron.app.getPath('exe')
    });
    const tray = new Tray(path.resolve(config.assetsPath, 'icon.png'));
    await container.get<IIconService>(TYPES.IIconService).init();
    await container.get<IMenuManagerService>(TYPES.IMenuManagerService).init(tray);
    menubar({
      tray,
      preloadWindow: true,
      showOnRightClick: true,
      showOnAllWorkspaces: true,
      index: config.indexPath,
      browserWindow: {
        resizable: false,
        roundedCorners: true,
        darkTheme: true,
        width: 280,
        height: 280
      }
    });
  } catch (e: unknown) {
    await container.get<IErrorHandlerService>(TYPES.IErrorHandlerService).handleError(e as Error);
  }
});
