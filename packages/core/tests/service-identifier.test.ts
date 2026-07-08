/**
 * @overview Service identifier utility behavior tests.
 * @author AEPKILL
 * @created 2026-07-08 18:40:00
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	createContainer,
	createServiceIdentifier,
	getServiceIdentifierMetadata,
	hasServiceIdentifierMetadata,
	type IContainer,
} from "../src/index";
import { clearContainer } from "./test.utils";

class ServiceWithMetadata {
	readonly name: string = "ServiceWithMetadata";
}

describe("Service Identifier Utilities", () => {
	let container: IContainer;

	beforeEach(() => {
		container = createContainer("ServiceIdentifierTestContainer");
	});

	afterEach(() => {
		clearContainer(container);
	});

	it("should register and resolve a string identifier with metadata", () => {
		// Arrange
		const metadata = {
			origin: "test",
			version: 1,
		};
		const serviceIdentifier = createServiceIdentifier<
			ServiceWithMetadata,
			typeof metadata
		>("IServiceWithMetadataForRegistration", {
			metadata,
		});

		container.register(serviceIdentifier, {
			useClass: ServiceWithMetadata,
		});

		// Act
		const instance = container.resolve(serviceIdentifier);

		// Assert
		expect(instance).toBeInstanceOf(ServiceWithMetadata);
		expect(
			getServiceIdentifierMetadata<typeof metadata>(serviceIdentifier),
		).toEqual(metadata);
	});

	it("should expose metadata by string identifier equality", () => {
		// Arrange
		const metadata = {
			domain: "billing",
			transport: "http",
		};

		createServiceIdentifier<ServiceWithMetadata, typeof metadata>(
			"IServiceWithMetadataForLookup",
			{
				metadata,
			},
		);

		// Act
		const resolvedMetadata = getServiceIdentifierMetadata<typeof metadata>(
			"IServiceWithMetadataForLookup",
		);

		// Assert
		expect(resolvedMetadata).toEqual(metadata);
		expect(hasServiceIdentifierMetadata("IServiceWithMetadataForLookup")).toBe(
			true,
		);
	});

	it("should expose metadata for symbol identifiers", () => {
		// Arrange
		const metadata = {
			tag: "remote",
		};
		const rawIdentifier = Symbol("IServiceWithSymbolMetadata");
		const serviceIdentifier = createServiceIdentifier<
			ServiceWithMetadata,
			typeof metadata
		>(rawIdentifier, {
			metadata,
		});

		// Act
		const resolvedMetadata =
			getServiceIdentifierMetadata<typeof metadata>(serviceIdentifier);

		// Assert
		expect(serviceIdentifier).toBe(rawIdentifier);
		expect(resolvedMetadata).toEqual(metadata);
	});

	it("should return undefined when no metadata was associated", () => {
		// Arrange
		const serviceIdentifier = createServiceIdentifier<ServiceWithMetadata>(
			"IServiceWithoutMetadata",
		);

		// Act
		const resolvedMetadata = getServiceIdentifierMetadata<{ tag: string }>(
			serviceIdentifier,
		);

		// Assert
		expect(resolvedMetadata).toBeUndefined();
		expect(hasServiceIdentifierMetadata(serviceIdentifier)).toBe(false);
	});

	it("should report metadata association when metadata is explicitly undefined", () => {
		// Arrange
		const serviceIdentifier = createServiceIdentifier<ServiceWithMetadata>(
			"IServiceWithUndefinedMetadata",
			{
				metadata: undefined,
			},
		);

		// Act
		const resolvedMetadata = getServiceIdentifierMetadata(serviceIdentifier);
		const hasMetadata = hasServiceIdentifierMetadata(serviceIdentifier);

		// Assert
		expect(resolvedMetadata).toBeUndefined();
		expect(hasMetadata).toBe(true);
	});
});
