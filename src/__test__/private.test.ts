import {
  createContainer,
  FactoryProvider,
  LifecycleEnum,
  ServiceIdentifierManager,
} from '..';
import { generateStringsIndent } from '../shared/helpers/string.helper';

describe('container private', () => {
  test('container private test', () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<number>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<number>('IB');

    const container1 = createContainer('Container1', container => {
      container.register(
        IA,
        new FactoryProvider({
          lifecycle: LifecycleEnum.resolutionScoped,
          isPrivate: true,
          useFactory() {
            return 0;
          },
        })
      );

      container.register(
        IB,
        new FactoryProvider({
          useFactory() {
            return container1.resolve(IA);
          },
        })
      );
    });

    expect(container1.resolve(IB)).toBe(0);
    expect(() => container1.resolve(IA)).toThrow(
      'IA[#Container1]\n' +
        generateStringsIndent([
          'resolve service identifier IA[#Container1]',
          'service identifier: "IA" is private',
        ])
    );
  });
});
