import { WindowsServiceState } from './windows-service-state';

export interface IWindowsService {
  name: string;
  displayName?: string;
  state?: WindowsServiceState;
  stateDescription?: string;
  pid?: number;
}
