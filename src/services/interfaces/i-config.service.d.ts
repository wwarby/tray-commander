import { IMenuOptionConfig } from '../../models/i-menu-option-config';
import { Observable } from 'rxjs';
import { ISettings } from '../../models/i-settings';

export interface IConfigService {
  readonly assetsPath: string;
  configPath: string;
  serviceGroups: { [groupName: string]: string[] };
  readonly menuOptions: IMenuOptionConfig[];
  readonly menuOptions$: Observable<IMenuOptionConfig[]>;
  readonly settings: ISettings;
  readonly settings$: Observable<ISettings>;
  dataPath: string;

  editMenuOptions(): Promise<void>;

  init(): Promise<void>;
}
