import { IMenuManagerService } from './interfaces/i-menu-manager.service';
import { inject, injectable } from 'inversify';
import { IConfigService } from './interfaces/i-config.service';
import { IMenuOptionConfig } from '../models/i-menu-option-config';
import { IIconService } from './interfaces/i-icon.service';
import { Menu, shell } from 'electron';
import { spawn } from 'child_process';
import { URL } from 'url';
import { TYPES } from '../types';
import { IErrorHandlerService } from './interfaces/i-error-handler.service';
import { IWindowsServiceManagerService } from './interfaces/i-windows-service-manager.service';
import { WindowsServiceState } from '../models/windows-service-state';
import { filter } from 'rxjs';
import { debounce } from 'lodash';

@injectable()
export class MenuManagerService implements IMenuManagerService {

  private _tray?: Electron.CrossProcessExports.Tray;
  private _menu?: Electron.Menu;
  private _isOpen = false;
  private readonly debouncedBuild = debounce(this.build, 300);

  public constructor(
    @inject(TYPES.IConfigService) private readonly config: IConfigService,
    @inject(TYPES.IIconService) private readonly iconService: IIconService,
    @inject(TYPES.IErrorHandlerService) private readonly errorHandler: IErrorHandlerService,
    @inject(TYPES.IWindowsServiceManagerService) private readonly windowsServiceManager: IWindowsServiceManagerService
  ) {
    config.menuOptions$.subscribe(async () => this.debouncedBuild());
    windowsServiceManager.services$.pipe(filter(x => !!x)).subscribe(async () => this.debouncedBuild());
  }

  private static isUrl(s: string) {
    try {
      new URL(s);
      return true;
    } catch (err) { return false; }
  }

  public async init(tray: Electron.CrossProcessExports.Tray): Promise<void> {
    this._tray = tray;
    await this.debouncedBuild();
  }

  private async build(): Promise<void> {
    if (!this._tray || this._isOpen) { return; }

    console.log('Rebuilding menu');

    const menu: (Electron.MenuItemConstructorOptions | Electron.MenuItem)[] = [];
    const options = this.config.menuOptions;

    if (options.length) {
      for (const option of options) { menu.push(await this.getMenuItem(option)); }
    }

    if (menu.length) { menu.push({ type: 'separator' }); }
    menu.push({
      label: 'Edit commands',
      click: async () => {
        try { return this.config.editMenuOptions(); } catch (e: unknown) { await this.errorHandler.handleError(e as Error); }
      }
    });
    menu.push({ label: 'Exit', click: () => process.exit(0) });

    this._menu = Menu.buildFromTemplate(menu);
    this._menu.on('menu-will-show', () => this._isOpen = true);
    this._menu.on('menu-will-close', () => this._isOpen = false);
    this._tray.setContextMenu(this._menu);
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  private clickWrap(fn: Function) {
    return () => {
      try {
        fn();
      } catch (e: unknown) {
        // noinspection JSIgnoredPromiseFromCall
        this.errorHandler.handleError(e as Error);
      }
    };
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  private clickWrapAsync<T>(fn: () => Promise<T>) {
    return async () => {
      try {
        await fn();
      } catch (e: unknown) {
        await this.errorHandler.handleError(e as Error);
      }
    };
  }

  private async getMenuItem(optionConfig: IMenuOptionConfig) {
    const menuItem: Electron.MenuItemConstructorOptions = {};

    // Label
    if (optionConfig.label === '-') { menuItem.type = 'separator'; } else { menuItem.label = optionConfig.label; }

    // Icon
    menuItem.icon = await this.iconService.getIcon(optionConfig);

    // Submenu
    if (optionConfig.children) {
      menuItem.submenu = [];
      for (const child of optionConfig.children) { menuItem.submenu.push(await this.getMenuItem(child)); }
    }

    // Command
    if (optionConfig.cmd) {
      if (MenuManagerService.isUrl(optionConfig.cmd)) {
        menuItem.click = this.clickWrapAsync(async () => shell.openExternal(optionConfig.cmd as string));
      } else {
        menuItem.click = this.clickWrap(() => spawn(optionConfig.cmd as string, optionConfig.args || [], {
          shell: true,
          detached: true,
          cwd: optionConfig.startIn,
          windowsHide: !!optionConfig.hidden,
          env: optionConfig.env || undefined,
          stdio: 'ignore'
        }));
      }
    }

    // Windows Service management
    if (optionConfig.serviceName) {
      const service = this.windowsServiceManager.services[optionConfig.serviceName];
      if (service) {
        switch (service.state) {
          case WindowsServiceState.Stopped:
            menuItem.label = `${optionConfig.label} (Stopped)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-stopped');
            break;
          case WindowsServiceState.StartPending:
            menuItem.label = `${optionConfig.label} (Starting)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            break;
          case WindowsServiceState.StopPending:
            menuItem.label = `${optionConfig.label} (Stopping)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            break;
          case WindowsServiceState.Running:
            menuItem.label = `${optionConfig.label} (Running)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-running');
            break;
          case WindowsServiceState.ContinuePending:
            menuItem.label = `${optionConfig.label} (Resuming)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            break;
          case WindowsServiceState.PausePending:
            menuItem.label = `${optionConfig.label} (Pausing)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            break;
          case WindowsServiceState.Paused:
            menuItem.label = `${service.displayName} (Paused)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-paused');
            break;
        }

        menuItem.submenu = [];
        if ([WindowsServiceState.Stopped, WindowsServiceState.Paused].includes(service.state || WindowsServiceState.Unknown)) {
          menuItem.submenu.push({ label: 'Start', click: this.clickWrapAsync(async () => this.windowsServiceManager.start(service.name)) });
        }
        if ([WindowsServiceState.Running, WindowsServiceState.Paused].includes(service.state || WindowsServiceState.Unknown)) {
          menuItem.submenu.push({ label: 'Stop', click: this.clickWrapAsync(async () => this.windowsServiceManager.stop(service.name)) });
        }
        if (service.state !== WindowsServiceState.Stopped) {
          menuItem.submenu.push({ label: 'Kill', click: this.clickWrapAsync(async () => this.windowsServiceManager.kill(service.name)) });
        }
      } else {
        console.warn(`Service not found: ${optionConfig.serviceName}`);
      }
    }

    return menuItem;
  }

}
