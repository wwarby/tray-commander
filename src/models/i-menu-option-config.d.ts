export interface IMenuOptionConfig {
  label: string;
  serviceName?: string;
  serviceControl?: 'start' | 'restart' | 'stop';
  serviceGroup?: string;
  cmd?: string;
  args?: string[];
  startIn?: string;
  icon?: string;
  children?: IMenuOptionConfig[],
  hidden?: boolean;
  env?: { [key: string]: string }
}
