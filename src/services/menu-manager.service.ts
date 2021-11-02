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

@injectable()
export class MenuManagerService implements IMenuManagerService {

  private _tray?: Electron.CrossProcessExports.Tray;
  private _menu?: Electron.Menu;
  private _isOpen = false;

  public constructor(
    @inject(TYPES.IConfigService) private readonly config: IConfigService,
    @inject(TYPES.IIconService) private readonly iconService: IIconService,
    @inject(TYPES.IErrorHandlerService) private readonly errorHandler: IErrorHandlerService,
    @inject(TYPES.IWindowsServiceManagerService) private readonly windowsServiceManager: IWindowsServiceManagerService
  ) {
    // noinspection JSDeprecatedSymbols
    config.menuOptions$.subscribe(async () => this.build());
    windowsServiceManager.services$.subscribe(async () => this.build());
  }

  private static isUrl(s: string) {
    try {
      new URL(s);
      return true;
    } catch (err) { return false; }
  }

  public async init(tray: Electron.CrossProcessExports.Tray): Promise<void> {
    this._tray = tray;
    await this.build();
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
  private async wrap(fn: Function) {
    try {
      fn();
    } catch (e: unknown) {
      await this.errorHandler.handleError(e as Error);
    }
  }

  // eslint-disable-next-line @typescript-eslint/ban-types
  private async wrapAsync<T>(fn: () => Promise<T>) {
    try {
      await fn();
    } catch (e: unknown) {
      await this.errorHandler.handleError(e as Error);
    }
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

    if (optionConfig.cmd) {
      if (MenuManagerService.isUrl(optionConfig.cmd)) {
        menuItem.click = async () => this.wrapAsync(async () => shell.openExternal(optionConfig.cmd as string));
      } else {
        menuItem.click = async () => this.wrap(() => spawn(optionConfig.cmd as string, optionConfig.args || [], {
          shell: true,
          detached: true,
          cwd: optionConfig.startIn,
          windowsHide: !!optionConfig.hidden,
          env: optionConfig.env || undefined,
          stdio: 'ignore'
        }));
      }
    }

    if (optionConfig.serviceName) {
      const service = this.windowsServiceManager.services[optionConfig.serviceName];
      if (service) {
        switch (service.state) {
          case WindowsServiceState.Stopped:
            menuItem.label = `${optionConfig.label} (Stopped) » Start`;
            menuItem.icon = await this.iconService.getIcon('windows-service-stopped');
            menuItem.click = async () => this.wrapAsync(async () => this.windowsServiceManager.start(service.name));
            break;
          case WindowsServiceState.StartPending:
            menuItem.label = `${optionConfig.label} (Starting)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            menuItem.enabled = false;
            break;
          case WindowsServiceState.StopPending:
            menuItem.label = `${optionConfig.label} (Stopping)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            menuItem.enabled = false;
            break;
          case WindowsServiceState.Running:
            menuItem.label = `${optionConfig.label} (Running) » Stop`;
            menuItem.icon = await this.iconService.getIcon('windows-service-running');
            menuItem.click = async () => this.wrapAsync(async () => this.windowsServiceManager.stop(service.name));
            break;
          case WindowsServiceState.ContinuePending:
            menuItem.label = `${optionConfig.label} (Resuming)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            menuItem.enabled = false;
            break;
          case WindowsServiceState.PausePending:
            menuItem.label = `${optionConfig.label} (Pausing)`;
            menuItem.icon = await this.iconService.getIcon('windows-service-pending');
            menuItem.enabled = false;
            break;
          case WindowsServiceState.Paused:
            menuItem.label = `${service.displayName} (Paused) » Resume`;
            menuItem.icon = await this.iconService.getIcon('windows-service-paused');
            menuItem.click = async () => this.wrapAsync(async () => this.windowsServiceManager.start(service.name));
            break;
        }
      }
    }

    return menuItem;
  }

}
