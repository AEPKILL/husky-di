import { describe, test, expect } from "@jest/globals";
import { createContainer, createServiceIdentifier, ValueProvider } from "..";

describe("container test", () => {
  test("container resolve", () => {
    const container = createContainer("Resolve");
    expect(() => {
      container.resolve("unknown");
    }).toThrow(
      'attempted to resolve unregistered dependency service identifier: "unknown"'
    );
  });

  test(`provider can't duplicate use`, () => {
    const container = createContainer("OptionalResolve");
    const provider = new ValueProvider({
      useValue: 2333,
    });

    const aRegistration = container.register("a", provider);

    expect(() => {
      container.register("b", provider);
    }).toThrow("provider was already registered.");

    aRegistration.dispose();

    expect(() => {
      container.register("b", provider);
      container.register("b", provider.clone());
    }).not.toThrow();
  });

  test("container resolve optional", () => {
    const container = createContainer("OptionalResolve");
    expect(container.resolve("unknown", { optional: true })).toBe(void 0);
    expect(
      container.resolve("unknown", { optional: true, defaultValue: 0 })
    ).toBe(0);
  });

  test("container register multiple", () => {
    const container = createContainer("MultipleResolve", (container) => {
      container.register("value", new ValueProvider({ useValue: 0 }));
      container.register("value", new ValueProvider({ useValue: 0 }));
    });
    expect(container.resolve("value")).toBe(0);
    expect(container.resolve("value", { multiple: true })).toStrictEqual([
      0, 0,
    ]);
  });

  test("container other api test", () => {
    const IA = createServiceIdentifier<number>("IA");
    const provider = new ValueProvider({
      useValue: 2,
    });

    const container = createContainer("ContainerAPI");

    const aRegistration = container.register(IA, provider);

    expect(container.isRegistered(IA)).toBe(true);
    expect(container.getAllRegisteredServiceIdentifiers()).toStrictEqual([IA]);
    expect(container.getProvider(IA) == provider).toBe(true);
    expect(container.getAllProvider(IA).length).toBe(1);
    expect(container.getAllProvider(IA).every((it) => it == provider)).toBe(
      true
    );

    aRegistration.dispose();
    expect(container.isRegistered(IA)).toBe(false);
  });
});
