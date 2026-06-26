// Shared types, zod schemas, and WeChat crypto utilities.
//
// Phase 1 exports only the AppId branded type and the WeChatError class.
// Subsequent phases add: zod schemas for WeChat messages, signature /
// AES helpers, rule-engine types.

/** Branded UUID string for a wechat_apps row. */
export type AppId = string & { readonly __brand: 'AppId' };

/** OpenID scoped to a particular wechat_apps row. */
export type OpenId = string & { readonly __brand: 'OpenId' };

/** UnionID (cross-app identity). Stored in v1, used in v2. */
export type UnionId = string & { readonly __brand: 'UnionId' };

/** AppId from raw string. Throws if the input does not look like a UUID. */
export function toAppId(raw: string): AppId {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
  ) {
    throw new Error(`Invalid AppId: ${raw}`);
  }
  return raw as AppId;
}

/** Standard error envelope returned by the API. */
export class WeChatError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'WeChatError';
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}
