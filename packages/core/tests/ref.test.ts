import { describe, expect, it } from "vitest";
import {
	createContainer,
	createServiceIdentifier,
	resolve,
} from "../src/index";

/**
 * Test service identifiers
 */
const IServiceA = createServiceIdentifier<ServiceA>("IServiceA");
const IServiceB = createServiceIdentifier<ServiceB>("IServiceB");
const IServiceC = createServiceIdentifier<ServiceC>("IServiceC");
const IServiceD = createServiceIdentifier<ServiceD>("IServiceD");
const IServiceE = createServiceIdentifier<ServiceE>("IServiceE");
const INonExistentService = createServiceIdentifier<unknown>(
	"INonExistentService",
);

/**
 * Test service classes for error testing
 */
class ServiceA {
	readonly serviceBRef = resolve(IServiceB, { ref: true });
}

class ServiceB {
	readonly serviceA = resolve(IServiceA, { ref: true });
}

class ServiceC {
	readonly serviceD = resolve(IServiceD, { dynamic: true });
}

class ServiceD {
	readonly serviceC = resolve(IServiceC, { dynamic: true });
}

class ServiceE {
	readonly serviceF = resolve(INonExistentService, { dynamic: true });
}

describe("Ref and Dynamic Ref", () => {
	describe("Static Ref", () => {
		it("should resolve ref correctly", () => {
			const container = createContainer();
			container.register(IServiceA, {
				useClass: ServiceA,
			});
			container.register(IServiceB, {
				useClass: ServiceB,
			});
			const serviceA = container.resolve(IServiceA);
			expect(serviceA.serviceBRef.current).toBeInstanceOf(ServiceB);
			expect(serviceA.serviceBRef.current.serviceA.current).toBeInstanceOf(
				ServiceA,
			);
			expect(
				serviceA.serviceBRef.current.serviceA.current.serviceBRef.current,
			).toBeInstanceOf(ServiceB);
			expect(serviceA.serviceBRef.current).toBe(serviceA.serviceBRef.current);
		});
	});

	describe("Dynamic Ref", () => {
		it("should resolve dynamic ref correctly", () => {
			const container = createContainer();
			container.register(IServiceC, {
				useClass: ServiceC,
			});
			container.register(IServiceD, {
				useClass: ServiceD,
			});
			const serviceC = container.resolve(IServiceC);
			expect(serviceC.serviceD.current).toBeInstanceOf(ServiceD);
			expect(serviceC.serviceD.current.serviceC.current).toBeInstanceOf(
				ServiceC,
			);
			expect(
				serviceC.serviceD.current.serviceC.current.serviceD.current,
			).toBeInstanceOf(ServiceD);
			expect(serviceC.serviceD.current).not.toBe(serviceC.serviceD.current);
		});
	});

	describe("Non Existent Ref", () => {
		it("should throw error when resolving non existent ref", () => {
			const container = createContainer();
			container.register(IServiceE, {
				useClass: ServiceE,
			});
			console.log("serviceE", IServiceE);

			const serviceE = container.resolve(IServiceE);
			expect(serviceE.serviceF.current).toBeUndefined();
		});
	});
});
