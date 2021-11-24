import {
  createContainer,
  FactoryProvider,
  LifecycleEnum,
  ServiceIdentifierManager,
} from '..';
import { generateStringsIndent } from '../shared/helpers/string.helper';

describe('cross container', () => {
  const serviceIdentifierManager = new ServiceIdentifierManager();

  test('cross container exception', () => {
    const IA = serviceIdentifierManager.createServiceIdentifier<number>('IA');
    const IB = serviceIdentifierManager.createServiceIdentifier<number>('IB');

    const container1 = createContainer('Container1', container => {
      container.register(
        IA,
        new FactoryProvider({
          lifecycle: LifecycleEnum.resolutionScoped,
          useFactory() {
            throw new Error('oops!');
          },
        })
      );
    });

    const container2 = createContainer('Container2', container => {
      container.register(
        IB,
        new FactoryProvider({
          useFactory() {
            return container1.resolve(IA);
          },
        })
      );
    });

    expect(() => container2.resolve(IB)).toThrow(
      'IB[#Container2] -> IA[#Container1]\n' +
        generateStringsIndent([
          'resolve service identifier IB[#Container2]',
          'resolve service identifier IA[#Container1]',
          'factory function execute exception: oops!.',
        ])
    );
  });
});
