import { IMenuOptionConfig } from '../../models/i-menu-option-config';

export interface IIconService {
  getIcon(options: IMenuOptionConfig | string): Promise<Electron.NativeImage | string>;

  clearCache(): void;

  init(): Promise<void>;
}
