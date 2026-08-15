/**
 * @overview Immutable Remote Service Descriptors shared by both RPC peers.
 *
 * @author AEPKILL
 * @created 2026-08-15 00:00:00
 */

import { createRemoteServiceDescriptor } from "@husky-di/remote";

import {
	IClientEvents,
	ISession,
	remoteClientEventsOptions,
	remoteSessionOptions,
} from "../fixtures";

export const remoteSession = createRemoteServiceDescriptor(
	ISession,
	remoteSessionOptions,
);

export const remoteClientEvents = createRemoteServiceDescriptor(
	IClientEvents,
	remoteClientEventsOptions,
);
