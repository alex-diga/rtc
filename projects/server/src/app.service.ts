import { HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    throw new HttpException('错误的请求', 500);
    return 'Hello World!';
  }
}
