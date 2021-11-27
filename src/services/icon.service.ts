import { inject, injectable } from 'inversify';
import { IIconService } from './interfaces/i-icon.service';
import { IConfigService } from './interfaces/i-config.service';
import fs, { promises as fsAsync } from 'fs';
import { generateIcons } from 'windows-system-icon';
import { TYPES } from '../types';
import * as path from 'path';
import md5 from 'md5';
import * as fsExtra from 'fs-extra';
import { IMenuOptionConfig } from '../models/i-menu-option-config';
import { keyBy, mapValues } from 'lodash';
import chalk from 'chalk';

@injectable()
export class IconService implements IIconService {

  private readonly _extractedIconsPath: string;

  private _assetIcons: { [key: string]: string } = {};

  private readonly _extractedIcons: { [key: string]: string } = {};

  public constructor(
    @inject(TYPES.IConfigService) private readonly config: IConfigService
  ) {
    this._extractedIconsPath = path.resolve(config.dataPath, 'extracted-icons');
  }

  public async init() {
    const assetIconsPath = path.resolve(this.config.assetsPath, 'menu-icons');
    const assetIconFiles = (await fsAsync.readdir(assetIconsPath)).filter(x => path.extname(x).toLowerCase() === '.png')
      .map(x => ({ name: path.parse(x).name.replace(/@\d(?:\.\d)?x/i, '').toLowerCase(), path: path.resolve(assetIconsPath, x) }));
    this._assetIcons = mapValues(keyBy(assetIconFiles, 'name'), 'path') as { [key: string]: string };
  }

  public async getIcon(optionsOrKey: IMenuOptionConfig | string): Promise<Electron.NativeImage | string> {
    let key: string;
    if (typeof optionsOrKey === 'string') {
      key = optionsOrKey;
    } else {
      key = optionsOrKey.icon || '';
      // Replace macros
      if (key.toLowerCase() === '[cmd]') { key = optionsOrKey.cmd || ''; }
      // Get some common icon keys by inference from the command
      if (!key && /(?:powershell|pwsh)(?:\.exe|$)/.test(optionsOrKey.cmd || '')) { key = 'powershell'; }
    }

    // Attempt to use a built-in icon
    if (this._assetIcons[key]) { return this._assetIcons[key]; }

    // Attempt to use a previously extracted icon
    if (this._extractedIcons[key]) { return this._extractedIcons[key]; }

    // Attempt to extract an icon from the referenced file or program
    if (fs.existsSync(key)) {
      const extractPath = path.resolve(this._extractedIconsPath, `${md5(key)}@2x.png`);
      // If icon was previously extracted, use it
      if (fs.existsSync(extractPath)) {
        this._extractedIcons[key] = extractPath;
        return this._extractedIcons[key];
      }
      // Ensure directory exists
      if (!fs.existsSync(this._extractedIconsPath)) { fs.mkdirSync(this._extractedIconsPath, { recursive: true }); }
      console.log(`Extracting icon from ${chalk.yellow(key)}`);
      this._extractedIcons[key] = extractPath;
      await generateIcons([{ inputFilePath: key, outputFilePath: extractPath, outputFormat: 'Png' }], true);
      return this._extractedIcons[key];
    }

    // Give up and show no icon
    return '';
  }

  public clearCache() {
    fsExtra.emptyDirSync(this._extractedIconsPath);
  }

}
