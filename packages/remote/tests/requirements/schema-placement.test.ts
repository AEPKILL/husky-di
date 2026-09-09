/**
 * @overview Verifies schema placement.
 * @author AEPKILL
 * @created 2026-09-10 00:00:00
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
	callerTypesPath,
	conformanceTypesPath,
	descriptorTypesPath,
	protocolGrammarPath,
	protocolRecordTypesPath,
	reconnectionTypesPath,
	repositoryRoot,
	rpcTypeGuardPath,
	runtimePolicyTypesPath,
	specificationPath,
} from "./evidence/test.utils";

describe("Remote RPC requirement evidence", () => {
	it("RPC-PKG-004 colocates private schemas with derived configuration types and uses native primitive guards", () => {
		const specificationSource = readFileSync(specificationPath, "utf8");
		const grammarSource = readFileSync(protocolGrammarPath, "utf8");
		const recordTypesSource = readFileSync(protocolRecordTypesPath, "utf8");
		const rpcTypeGuardSource = readFileSync(rpcTypeGuardPath, "utf8");
		const schemaTypeSources = [
			{
				source: readFileSync(conformanceTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcConformanceOptions",
						projection: "input",
						schemaName: "rpcConformanceOptionsSchema",
					},
					{
						typeName: "RpcConformanceOptionsSnapshot",
						projection: "output",
						schemaName: "rpcConformanceOptionsSchema",
					},
				],
			},
			{
				source: readFileSync(callerTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcConnectorOptions",
						projection: "input",
						schemaName: "rpcConnectorOptionsSchema",
					},
					{
						typeName: "RpcConnectorConnectOptionsSnapshot",
						projection: "output",
						schemaName: "rpcConnectorConnectOptionsSchema",
					},
					{
						typeName: "RpcAcceptorOptions",
						projection: "input",
						schemaName: "rpcAcceptorOptionsSchema",
					},
				],
			},
			{
				source: readFileSync(descriptorTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RemoteServiceDescriptorOptions",
						projection: "input",
						schemaName: "remoteServiceDescriptorOptionsSchema",
					},
					{
						typeName: "RemoteServiceDescriptorOptionsSnapshot",
						projection: "output",
						schemaName: "remoteServiceDescriptorOptionsSchema",
					},
				],
			},
			{
				source: readFileSync(runtimePolicyTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcAcceptorRuntimePolicyOptions",
						projection: "input",
						schemaName: "rpcAcceptorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcConnectorRuntimePolicyOptions",
						projection: "input",
						schemaName: "rpcConnectorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcAcceptorRuntimePolicyOptionsSnapshot",
						projection: "output",
						schemaName: "rpcAcceptorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcConnectorRuntimePolicyOptionsSnapshot",
						projection: "output",
						schemaName: "rpcConnectorRuntimePolicyOptionsSchema",
					},
					{
						typeName: "RpcProtocolRuntimePolicy",
						projection: "output",
						schemaName: "rpcProtocolRuntimePolicySchema",
					},
				],
			},
			{
				source: readFileSync(reconnectionTypesPath, "utf8"),
				derivations: [
					{
						typeName: "RpcConnectorAdapterFactory",
						projection: "output",
						schemaName: "rpcConnectorAdapterFactorySchema",
					},
					{
						typeName: "RpcConnectorReconnectionPolicyOptions",
						projection: "input",
						schemaName: "rpcConnectorReconnectionPolicySchema",
					},
					{
						typeName: "RpcConnectorReconnectionPolicy",
						projection: "output",
						schemaName: "rpcConnectorReconnectionPolicySchema",
					},
					{
						typeName: "CreateRpcConnectorReconnectionOptions",
						projection: "input",
						schemaName: "rpcConnectorReconnectionOptionsSchema",
					},
				],
			},
		] as const;
		const compactRecordTypesSource = recordTypesSource.replaceAll(/\s+/gu, "");
		const recordSchemaNames = [
			"rpcJsonRecordSchema",
			"rpcFreshRequestSchema",
			"rpcFreshAcceptSchema",
			"rpcResumeRequestSchema",
			"rpcBootstrapRequestSchema",
			"rpcResumeAcceptSchema",
			"rpcResumeRejectSchema",
			"rpcResumeOutcomeSchema",
			"rpcCallMessageSchema",
			"rpcCancelMessageSchema",
			"rpcResultMessageSchema",
			"rpcWireErrorCodeSchema",
			"rpcErrorMessageSchema",
			"rpcSemanticMessageSchema",
			"rpcMessageEnvelopeSchema",
			"rpcAckRecordSchema",
			"rpcControlRecordSchema",
			"rpcActiveRecordSchema",
		] as const;
		const runtimeSchemaOwnerPaths = [
			"packages/remote/src/modules/peer/schemas/rpc-protocol-call.schema.ts",
			"packages/remote/src/modules/protocol/utils/rpc-base64-url-32-schema.util.ts",
			"packages/remote/src/modules/protocol/utils/rpc-wire-grammar.util.ts",
			"packages/remote/src/modules/protocol/schemas/rpc-wire-identifier.schema.ts",
		] as const;
		const schemaConsumerPaths = [
			"packages/remote/src/conformance/rpc-conformance.util.ts",
			"packages/remote/src/modules/peer/factories/remote-service-descriptor.factory.ts",
			"packages/remote/src/modules/owner/factories/rpc-acceptor.factory.ts",
			"packages/remote/src/modules/reconnection/factories/rpc-connector-reconnection.factory.ts",
			"packages/remote/src/modules/owner/factories/rpc-connector.factory.ts",
			"packages/remote/src/modules/owner/factories/rpc-owner-assembly.factory.ts",
			"packages/remote/src/modules/owner/utils/parse-rpc-startup.util.ts",
		] as const;
		const nativeGuardOwnerPaths = [
			"packages/remote/src/conformance/rpc-protocol-conformance.util.ts",
			"packages/remote/src/modules/protocol/impls/rpc-endpoint.impl.ts",
			"packages/remote/src/shared/impls/rpc-retained-bytes-ledger.impl.ts",
			"packages/remote/src/modules/peer/utils/rpc-exposure.util.ts",
		] as const;
		const callableGuardConsumerPaths = [
			"packages/remote/src/conformance/rpc-protocol-case-operation.util.ts",
			"packages/remote/src/modules/owner/factories/rpc-owner-assembly.factory.ts",
			"packages/remote/src/modules/owner/utils/parse-rpc-startup.util.ts",
			"packages/remote/src/modules/owner/utils/manage-rpc-session.util.ts",
			"packages/remote/src/modules/peer/schemas/rpc-protocol-call.schema.ts",
			"packages/remote/src/modules/peer/utils/rpc-exposure.util.ts",
		] as const;
		const nonNullObjectGuardConsumerPaths = [
			"packages/remote/src/conformance/rpc-protocol-conformance.util.ts",
			"packages/remote/src/modules/owner/factories/rpc-owner-assembly.factory.ts",
			"packages/remote/src/modules/owner/utils/parse-rpc-startup.util.ts",
			"packages/remote/src/modules/owner/utils/manage-rpc-session.util.ts",
			"packages/remote/src/modules/peer/schemas/rpc-protocol-call.schema.ts",
		] as const;
		const undefinedGuardConsumerPaths = [
			"packages/remote/src/modules/owner/utils/parse-rpc-startup.util.ts",
		] as const;

		expect(specificationSource).not.toMatch(/zod/iu);
		expect(grammarSource).toContain('from "zod"');
		expect(grammarSource).toContain("z.custom<number>(isPositiveSafeInteger)");
		expect(grammarSource).toContain("isNonNegativeSafeInteger");
		expect(rpcTypeGuardSource).toContain('return typeof value === "function";');
		expect(rpcTypeGuardSource).toContain(
			'return typeof value === "object" && value !== null;',
		);
		expect(rpcTypeGuardSource).toContain("return value === undefined;");
		for (const guardName of [
			"isArray",
			"isCallable",
			"isFiniteNumber",
			"isNonNegativeSafeInteger",
			"isNonNullObject",
			"isObjectOrFunction",
			"isPositiveSafeInteger",
			"isUndefined",
			"isUint8Array",
		] as const) {
			expect(rpcTypeGuardSource).toContain(`export function ${guardName}`);
		}
		for (const schemaName of recordSchemaNames) {
			expect(compactRecordTypesSource).toContain(
				`RpcSchemaOutput<typeof${schemaName}>`,
			);
		}
		const colocatedSchemaNames = new Set<string>();
		for (const { derivations, source } of schemaTypeSources) {
			expect(source).toContain('from "zod"');
			for (const { projection, schemaName, typeName } of derivations) {
				expect(source).toContain(`const ${schemaName}`);
				colocatedSchemaNames.add(schemaName);
				const declarationStart = new RegExp(
					`export type ${typeName}(?=[\\s<])`,
					"u",
				).exec(source)?.index;
				expect(declarationStart).toBeDefined();
				if (declarationStart === undefined) {
					continue;
				}
				expect(declarationStart).toBeGreaterThanOrEqual(0);
				const nextExport = source.indexOf("\nexport ", declarationStart + 1);
				const declarationSource = source.slice(
					declarationStart,
					nextExport < 0 ? undefined : nextExport,
				);
				expect(declarationSource.replaceAll(/\s+/gu, "")).toContain(
					`${projection}<typeof${schemaName}>`,
				);
			}
		}
		for (const ownerPath of runtimeSchemaOwnerPaths) {
			const ownerSource = readFileSync(
				resolve(repositoryRoot, ownerPath),
				"utf8",
			);
			expect(ownerSource).toContain('from "zod"');
		}
		for (const consumerPath of schemaConsumerPaths) {
			const consumerSource = readFileSync(
				resolve(repositoryRoot, consumerPath),
				"utf8",
			);
			expect(consumerSource).not.toMatch(/\bconst\s+\w+Schema\s*=/u);
			expect(consumerSource).not.toContain("readRpcClosedOptionsRecord");
			expect(consumerSource).not.toContain("validateRpcPositiveSafeInteger");
		}
		for (const ownerPath of nativeGuardOwnerPaths) {
			const ownerSource = readFileSync(
				resolve(repositoryRoot, ownerPath),
				"utf8",
			);
			expect(ownerSource).toContain("@/shared/utils/type-guard.util");
			expect(ownerSource).not.toContain('from "zod"');
		}
		for (const consumerPath of callableGuardConsumerPaths) {
			const consumerSource = readFileSync(
				resolve(repositoryRoot, consumerPath),
				"utf8",
			);
			expect(consumerSource).toContain("isCallable");
			expect(consumerSource).not.toContain("z.function()");
		}
		for (const consumerPath of nonNullObjectGuardConsumerPaths) {
			expect(
				readFileSync(resolve(repositoryRoot, consumerPath), "utf8"),
			).toContain("isNonNullObject");
		}
		for (const consumerPath of undefinedGuardConsumerPaths) {
			expect(
				readFileSync(resolve(repositoryRoot, consumerPath), "utf8"),
			).toContain("isUndefined");
		}
		expect(
			existsSync(
				resolve(repositoryRoot, "packages/remote/src/utils/rpc-schema.util.ts"),
			),
		).toBe(false);
		expect(
			existsSync(
				resolve(
					repositoryRoot,
					"packages/remote/src/utils/rpc-runtime-policy.util.ts",
				),
			),
		).toBe(false);
		for (const publicEntry of [
			"index",
			"protocol",
			"transport",
			"conformance",
		]) {
			const publicSource = readFileSync(
				resolve(repositoryRoot, `packages/remote/src/${publicEntry}.ts`),
				"utf8",
			);
			expect(publicSource).not.toContain("type-guard");
			expect(publicSource).not.toContain("rpc-wire-grammar");
			expect(publicSource).not.toContain('from "zod"');
			for (const schemaName of colocatedSchemaNames) {
				expect(publicSource).not.toContain(schemaName);
			}
		}
	});
});
