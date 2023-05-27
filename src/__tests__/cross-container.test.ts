import { describe, test, expect } from "@jest/globals";
import { ServiceIdentifierManager } from "@/classes/service-identifier-manager";
import { createContainer } from "..";
import { FactoryProvider } from "../providers/factory.provider";
import { LifecycleEnum } from "../enums/lifecycle.enum";
import { formatStringsWithIndent } from "../utils/format.utils";

describe("cross container", () => {
  test("cross container exception", () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<number>("IA");
    const IB = serviceIdentifierManager.createServiceIdentifier<number>("IB");

    const container1 = createContainer("Container1", (container) => {
      container.register(
        IA,
        new FactoryProvider({
          lifecycle: LifecycleEnum.resolution,
          useFactory() {
            throw new Error("oops!");
          },
        })
      );
    });

    const container2 = createContainer("Container2", (container) => {
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
      "IB[#Container2] -> IA[#Container1]\n" +
        formatStringsWithIndent([
          "resolve service identifier IB[#Container2]",
          "resolve service identifier IA[#Container1]",
          "factory function execute exception: oops!.",
        ])
    );
  });

  test("cross container resolutionScoped", () => {
    const serviceIdentifierManager = new ServiceIdentifierManager();
    const IA = serviceIdentifierManager.createServiceIdentifier<number>("IA");
    const IB = serviceIdentifierManager.createServiceIdentifier<number>("IB");
    const IC = serviceIdentifierManager.createServiceIdentifier<number>("IC");
    let count = 0;

    const container1 = createContainer("Container1", (container) => {
      container.register(
        IA,
        new FactoryProvider({
          lifecycle: LifecycleEnum.resolution,
          useFactory() {
            return count++;
          },
        })
      );
    });

    const container2 = createContainer("Container2", (container) => {
      container.register(
        IB,
        new FactoryProvider({
          lifecycle: LifecycleEnum.resolution,
          useFactory() {
            return count++;
          },
        })
      );
      container.register(
        IC,
        new FactoryProvider({
          useFactory() {
            return (
              container1.resolve(IA) +
              container.resolve(IB) +
              container.resolve(IB)
            );
          },
        })
      );
    });

    expect(container2.resolve(IC)).toBe(2);
  });
});
