// WeChat /cgi-bin/token fetcher.
//
// https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=APPID&secret=APPSECRET
// Returns { access_token, expires_in } or { errcode, errmsg }.

import axios from 'axios';

const WECHAT_API_BASE = process.env.WECHAT_API_BASE ?? 'https://api.weixin.qq.com';

export interface WeChatTokenResponse {
  accessToken: string;
  expiresInSec: number;
}

interface RawTokenSuccess {
  access_token: string;
  expires_in: number;
}
interface RawTokenError {
  errcode: number;
  errmsg: string;
}

export async function fetchAccessToken(
  appId: string,
  appSecret: string,
): Promise<WeChatTokenResponse> {
  const url = `${WECHAT_API_BASE}/cgi-bin/token`;
  const params = {
    grant_type: 'client_credential',
    appid: appId,
    secret: appSecret,
  };
  const res = await axios.get(url, { params, timeout: 10_000 });
  const data = res.data as RawTokenSuccess | RawTokenError;
  if ('errcode' in data) {
    throw new Error(`WeChat token error ${data.errcode}: ${data.errmsg}`);
  }
  return {
    accessToken: data.access_token,
    expiresInSec: data.expires_in,
  };
}
