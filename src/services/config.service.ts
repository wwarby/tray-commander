import md5 from 'md5';
import fs, { FSWatcher, promises as fsAsync } from 'fs';
import path from 'path';
import { app, dialog, shell } from 'electron';
import { inject, injectable } from 'inversify';
import { IConfigService } from './interfaces/i-config.service';
import { IOptions } from '../models/i-options';
import { BehaviorSubject } from 'rxjs';
import { TYPES } from '../types';
import { IMenuOptionConfig } from '../models/i-menu-option-config';
import { ISettings } from '../models/i-settings';
import { IConfig } from '../models/i-config';
import { assign } from 'lodash';
import chalk from 'chalk';

@injectable()
export class ConfigService implements IConfigService {

  public readonly dataPath: string;
  private _watcher?: FSWatcher;
  private readonly _menuOptions$ = new BehaviorSubject<IMenuOptionConfig[]>([]);
  private readonly _serviceGroups$ = new BehaviorSubject<{ [groupName: string]: string[] }>({});
  private readonly _defaultSettings = {} as ISettings;
  private readonly _settings$ = new BehaviorSubject<ISettings>(this._defaultSettings);
  private readonly _assetsPath = path.resolve(app.getAppPath().replace(/[/\\][^/\\]+\.asar/, ''), 'assets');

  public constructor(@inject(TYPES.IOptions) private readonly options: IOptions, @inject(TYPES.App) app: Electron.App) {
    this.dataPath = path.resolve(app.getPath('appData'), 'tray-commander');
  }

  private _configPath!: string;

  public get configPath() { return this._configPath; }

  public get assetsPath() { return this._assetsPath; }

  public get menuOptions() { return this._menuOptions$.value; }

  public get menuOptions$() { return this._menuOptions$.asObservable(); }

  public get settings() { return this._settings$.value; }

  public get settings$() { return this._settings$.asObservable(); }

  public get serviceGroups() { return this._serviceGroups$.value; }

  public async init() {
    await this.setConfigPath(this.options.config || path.resolve(this.dataPath, '.tray-commander.json'));
  }

  public async editMenuOptions() {
    await this.writeIfMissing();
    // Open in default editor
    await shell.openPath(this.configPath);
  }

  private async setConfigPath(value: string) {
    let md5Previous: string;

    // Short-circuit if path hasn't changed
    if (this._configPath === value) { return; }
    this._configPath = value;

    // Create the default file if it doesn't already exist, and read it
    await this.writeIfMissing();
    await this.read();

    // Kill previous watcher if path has changed
    let fsWait: NodeJS.Timeout | null;
    if (this._watcher) { this._watcher.close(); }

    // Watch the file for changes
    this._watcher = fs.watch(value, async (event, filename) => {
      if (filename) {
        // Debounce
        if (fsWait) { return; }
        fsWait = setTimeout(() => fsWait = null, 100);
        // Check file has actually changed by hashing it's content
        const md5Current = md5(fs.readFileSync(value));
        if (md5Current === md5Previous) { return; }
        md5Previous = md5Current;
        // Parse the file
        console.log('Reading updated config file');
        await this.read();
      }
    });
  }

  private async read() {
    try {
      const config = JSON.parse(await fsAsync.readFile(this.configPath, 'utf-8')) || {} as IConfig;
      this._settings$.next(assign(this._defaultSettings, config.settings || {}));
      this._serviceGroups$.next(config.serviceGroups || {});
      this._menuOptions$.next(config.menu || []);
    } catch (e: unknown) {
      const result = await dialog.showMessageBox({
        title: 'Error Reading Menu Config JSON',
        type: 'error',
        message: (e as Error).message,
        detail: (e as Error).stack,
        buttons: ['Edit Config', 'Quit'],
        defaultId: 0,
        cancelId: 1
      });
      if (result.response === 1) { process.exit(0); }
      await this.editMenuOptions();
    }
  }

  private async writeIfMissing() {
    // Ensure directory exists
    const configDir = path.dirname(this.configPath);
    if (!fs.existsSync(configDir)) { fs.mkdirSync(configDir, { recursive: true }); }
    // Create default file if it doesn't exist
    if (!fs.existsSync(this.configPath)) {
      console.log(`Writing default config file to ${chalk.yellow(this.configPath)}`);
      await fsAsync.writeFile(this.configPath, JSON.stringify({
        settings: this.settings,
        menu: this.menuOptions
      } as IConfig, null, 2), 'utf-8');
    }
  }

}
