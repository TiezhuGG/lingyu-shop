import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import sharp from 'sharp';
import { BackendConfigService } from '../foundation/config';

export interface InspectedImage { bytes: Buffer; width: number; height: number; developmentOnly: true }
/** Production scanning needs a separate implementation; this port never claims malware clearance. */
export abstract class ImageInspectionPort {
  abstract inspect(bytes: Buffer, mime: string): Promise<InspectedImage>;
}
@Injectable()
export class DevelopmentImageInspection extends ImageInspectionPort {
  constructor(private readonly config: BackendConfigService) { super(); }
  async inspect(bytes: Buffer, mime: string): Promise<InspectedImage> {
    if (process.env.NODE_ENV === 'production' || !['development', 'test'].includes(this.config.values.environment) || !this.config.values.assetDirectory) throw new ServiceUnavailableException();
    try {
      const options = { limitInputPixels: 16000000, failOn: 'warning' as const };
      const metadata = await sharp(bytes, options).metadata();
      if ((mime === 'image/png' ? metadata.format !== 'png' : mime !== 'image/jpeg' || metadata.format !== 'jpeg') ||
          !metadata.width || !metadata.height || metadata.width > 4096 || metadata.height > 4096 || (metadata.pages ?? 1) !== 1) throw new Error();
      // Re-encoding strips EXIF, orientation metadata and trailing payloads by default.
      const output = await sharp(bytes, options).rotate().png().toBuffer({ resolveWithObject: true });
      if (output.data.length > 2097152) throw new Error();
      return { bytes: output.data, width: output.info.width, height: output.info.height, developmentOnly: true };
    } catch { throw new BadRequestException(); }
  }
}
