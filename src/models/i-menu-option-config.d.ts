export interface IMenuOptionConfig {
  label: string;
  serviceName?: string;
  cmd?: string;
  args?: string[];
  startIn?: string;
  icon?: string;
  children?: IMenuOptionConfig[],
  hidden?: boolean;
  env?: { [key: string]: string }
}
