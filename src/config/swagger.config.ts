import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  SwaggerCustomOptions,
  SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';

export const SWAGGER_PATH = 'api';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('sm-server API')
    .setDescription('HTTP API for the sm-server service')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const documentOptions: SwaggerDocumentOptions = {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
  };

  const documentFactory = () =>
    SwaggerModule.createDocument(app, config, documentOptions);

  const customOptions: SwaggerCustomOptions = {
    customSiteTitle: 'sm-server API docs',
    jsonDocumentUrl: `${SWAGGER_PATH}/json`,
    yamlDocumentUrl: `${SWAGGER_PATH}/yaml`,
    swaggerOptions: { persistAuthorization: true },
  };

  SwaggerModule.setup(SWAGGER_PATH, app, documentFactory, customOptions);
}
