/**
 * @overview Defines the shared husky-di-rpc/1 Base64Url32 carrier grammar.
 * @author AEPKILL
 * @created 2026-08-26 11:36:44
 */

import { z } from "zod";

const base64Url32Pattern = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;

export const rpcBase64Url32Schema = z.string().regex(base64Url32Pattern);
