import { IMenuOptionConfig } from './i-menu-option-config';
import { ISettings } from './i-settings';

export interface IConfig {
  settings: ISettings;
  menu: IMenuOptionConfig[];
}
