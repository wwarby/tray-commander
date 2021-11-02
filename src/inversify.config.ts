import { Container } from 'inversify';
import { TYPES } from './types';
import { ConfigService } from './services/config.service';
import { MenuManagerService } from './services/menu-manager.service';
import { WindowsServiceManagerService } from './services/windows-service-manager.service';
import { IConfigService } from './services/interfaces/i-config.service';
import { IMenuManagerService } from './services/interfaces/i-menu-manager.service';
import { IWindowsServiceManagerService } from './services/interfaces/i-windows-service-manager.service';
import { IIconService } from './services/interfaces/i-icon.service';
import { IconService } from './services/icon.service';
import { IErrorHandlerService } from './services/interfaces/i-error-handler.service';
import { ErrorHandlerService } from './services/error-handler.service';

const container = new Container();
container.bind<IConfigService>(TYPES.IConfigService).to(ConfigService).inSingletonScope();
container.bind<IErrorHandlerService>(TYPES.IErrorHandlerService).to(ErrorHandlerService).inSingletonScope();
container.bind<IIconService>(TYPES.IIconService).to(IconService).inSingletonScope();
container.bind<IMenuManagerService>(TYPES.IMenuManagerService).to(MenuManagerService).inSingletonScope();
container.bind<IWindowsServiceManagerService>(TYPES.IWindowsServiceManagerService).to(WindowsServiceManagerService).inSingletonScope();

export { container };
