import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GeocodingService {
  constructor(private readonly httpService: HttpService) {}

  async search(query: string): Promise<Array<{ lat: number; lon: number }>> {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(query)}`;
    const { data } = await firstValueFrom(
      this.httpService.get<Array<{ lat: string; lon: string }>>(url, {
        headers: {
          'User-Agent': 'DairyVyapar/1.0 (bill-manager)',
          Accept: 'application/json',
        },
      }),
    );
    return data.map((item) => ({
      lat: Number(item.lat),
      lon: Number(item.lon),
    }));
  }
}
