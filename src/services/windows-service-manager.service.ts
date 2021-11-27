import { IWindowsServiceManagerService } from './interfaces/i-windows-service-manager.service';
import { inject, injectable } from 'inversify';
import { TYPES } from '../types';
import { IConfigService } from './interfaces/i-config.service';
import { flatMap, keyBy, mapValues, uniqBy } from 'lodash';
import { IErrorHandlerService } from './interfaces/i-error-handler.service';
import { IMenuOptionConfig } from '../models/i-menu-option-config';
import { Enumerator } from '../enumerator';
import { exec } from 'child_process';
import { IWindowsService } from '../models/i-windows-service';
import { BehaviorSubject } from 'rxjs';
import { WindowsServiceState } from '../models/windows-service-state';
import chalk from 'chalk';

@injectable()
export class WindowsServiceManagerService implements IWindowsServiceManagerService {

  private readonly _services$ = new BehaviorSubject<{ [name: string]: IWindowsService | undefined } | undefined>(undefined);
  private readonly _pollingInterval = 2000;
  private _pollingHandle?: NodeJS.Timer;

  public constructor(
    @inject(TYPES.IConfigService) private readonly config: IConfigService,
    @inject(TYPES.IErrorHandlerService) private readonly errorHandlerService: IErrorHandlerService
  ) {
    // noinspection JSDeprecatedSymbols
    config.menuOptions$.subscribe(async menu => {
      try {
        this._services = mapValues(keyBy(this.getNames(menu), x => x), () => undefined);
        if (this._pollingHandle) { clearInterval(this._pollingHandle); }
        this._pollingHandle = setInterval(async () => this.update(), this._pollingInterval);
        await this.update();
      } catch (e) {
        await this.errorHandlerService.handleError(e as Error);
      }
    });
  }

  private _services: { [name: string]: IWindowsService | undefined } = {};

  public get services() { return this._services$.value || {}; }

  public get services$() { return this._services$.asObservable(); }

  public async start(name: string) {
    if ((await this.getService(name)).state === WindowsServiceState.Running) { return; }
    await this.serviceControl(name, 'start');
  }

  public async restart(name: string, timeout = 2000) {
    await this.stop(name, timeout);
    await this.start(name);
  }

  public async stop(name: string, timeout = 2000) {
    if ((await this.getService(name)).state === WindowsServiceState.Stopped) { return; }
    await this.serviceControl(name, 'stop');
    // If the service doesn't stop itself gracefully, task-kill it
    setTimeout(async () => {
      try {
        const service = await this.getService(name);
        if (service.state === WindowsServiceState.Stopped) { return; }
        await new Promise<void>((resolve, reject) => {
          exec(`taskkill /PID ${service.pid} /f`, function(error, stdout, stderr) {
            if (error || stderr) { reject(error || stderr); } else { resolve(); }
          });
        });
      } catch (e) {
        await this.errorHandlerService.handleError(e as Error);
      }
    }, timeout);
  }

  public async kill(name: string) {
    const service = await this.getService(name);
    await new Promise<void>((resolve, reject) => {
      exec(`taskkill /PID ${service.pid} /f`, function(error, stdout, stderr) {
        if (error || stderr) { reject(error || stderr); } else { resolve(); }
      });
    });
  }

  public getGroup(groupName: string): IWindowsService[] {
    return this.config.serviceGroups[groupName].map(x => {
      if (!this.services[x]) { console.warn(`Service not found: ${groupName}`); }
      return this.services[x];
    }).filter(x => x) as IWindowsService[];
  }

  private async update(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const names = Object.keys(this._services);
    let changed = false;
    await new Promise<void>((resolve, reject) => {
      exec('sc queryex state=all', function(error, stdout, stderr) {
        if (error || stderr) {
          reject(error || stderr);
        } else {
          const lines = new Enumerator(stdout.split('\n'));
          while (lines.hasNext()) {
            const service = self.parseNext(lines);
            if (names.includes(service?.name)) {
              if (self._services[service.name]?.state !== service.state) {
                changed = true;
                if (self._services[service.name]?.state) {
                  console.log(`${chalk.cyan(service.name)} state changed to ${chalk.yellow(WindowsServiceState[service.state || 0]).replace('Pending', ' Pending').toLowerCase()}`);
                }
              }
              self._services[service.name] = service;
            }
          }
          resolve();
          if (changed) { self._services$.next(self._services); }
        }
      });
    });
  }

  private async getService(name: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    return new Promise<IWindowsService>((resolve, reject) => {
      exec(`sc queryex "${name}"`, function(error, stdout, stderr) {
        if (error || stderr) {
          reject(error || stderr);
        } else {
          const lines = new Enumerator(stdout.split('\n'));
          const service = self.parseNext(lines);
          resolve(service);
        }
      });
    });
  }

  private async serviceControl(name: string, state: string) {
    return new Promise<IWindowsService>((resolve, reject) => {
      exec(`sc ${state} "${name}"`, function(error, stdout, stderr) {
        if (error || stderr) { reject(error || stderr); }
      });
    });
  }

  private getLineValue(line: string) {
    const i = line.indexOf(':');
    return i === -1 ? undefined : line.substr(i + 1).trim();
  }

  private splitLineValue(line: string) {
    const i = line.indexOf(' ');
    return i === -1 ? [undefined, undefined] : [line.substr(0, i).trim(), line.substr(i + 1).trim()];
  }

  private parseNext(lines: Enumerator<string>) {
    let service = {} as IWindowsService;
    while (lines.hasNext()) {
      const line = lines.next();
      if (line.indexOf('SERVICE_NAME') === 0) {
        service = { name: this.getLineValue(line) || '' };
      } else if (line.indexOf('DISPLAY_NAME') === 0) {
        service.displayName = this.getLineValue(line);
      } else if (line.indexOf('        STATE') === 0) {
        const states = this.splitLineValue(this.getLineValue(line) || '');
        service.state = parseInt(states[0] || '', 10);
        service.stateDescription = states[1];
      } else if (line.indexOf('        PID') === 0) {
        service.pid = parseInt(this.getLineValue(line) || '', 10);
        break;
      }
    }
    return service;
  }

  private getNames(menu: IMenuOptionConfig[]): string[] {
    return uniqBy(flatMap(menu.map(x => this.getNamesForMenuItem(x))), x => x.toLowerCase()).sort();
  }

  private getNamesForMenuItem(menuItem: IMenuOptionConfig): string[] {
    return (menuItem.serviceName ? [menuItem.serviceName] : []).concat(menuItem.children ? flatMap(menuItem.children.map(x => this.getNamesForMenuItem(x))) : []);
  }

}
