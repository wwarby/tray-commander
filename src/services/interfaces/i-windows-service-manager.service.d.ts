import { IWindowsService } from '../../models/i-windows-service';
import { Observable } from 'rxjs';

export interface IWindowsServiceManagerService {

  readonly services: { [p: string]: IWindowsService | undefined };
  readonly services$: Observable<{ [p: string]: IWindowsService | undefined } | undefined>;

  start(name: string): Promise<void>;

  restart(name: string): Promise<void>;

  stop(name: string): Promise<void>;

  kill(name: string): Promise<void>;

  getGroup(groupName: string): IWindowsService[];

}
