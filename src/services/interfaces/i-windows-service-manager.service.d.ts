import { IWindowsService } from '../../models/i-windows-service';
import { Observable } from 'rxjs';

export interface IWindowsServiceManagerService {

  readonly services: { [p: string]: IWindowsService | undefined };
  readonly services$: Observable<{ [p: string]: IWindowsService | undefined }>;

  start(name: string): Promise<void>;

  stop(name: string): Promise<void>;
}
