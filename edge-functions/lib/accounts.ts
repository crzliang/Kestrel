import type { Account, AccountRecord, AccountRole } from '@kestrel/shared';
import { hashPassword, verifyPassword } from './password';
import { getKv, kvGetJson, kvPutJson } from './storage';
import {
  buildOtpAuthUrl,
  generateTotpSecret,
  verifyTotp,
} from './totp';

const INDEX_KEY = 'accounts_index';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const CHALLENGE_TTL_MS = 1000 * 60 * 5; // 5 minutes

export type SessionRecord = {
  token: string;
  accountId: string;
  expiresAt: number;
};

type ChallengeRecord = {
  token: string;
  accountId: string;
  expiresAt: number;
};

function accountKey(id: string): string {
  return `account_${id}`;
}

function sessionKey(token: string): string {
  return `session_${token}`;
}

function challengeKey(token: string): string {
  return `totp_challenge_${token}`;
}

function newId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function publicAccount(record: AccountRecord): Account {
  return {
    id: record.id,
    username: record.username,
    displayName: record.displayName,
    role: record.role,
    totpEnabled: Boolean(record.totpEnabled),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function listAccountIds(): Promise<string[]> {
  return (await kvGetJson<string[]>(INDEX_KEY)) ?? [];
}

async function saveAccountIds(ids: string[]): Promise<void> {
  await kvPutJson(INDEX_KEY, ids);
}

export async function getAccountRecord(
  id: string,
): Promise<AccountRecord | null> {
  return kvGetJson<AccountRecord>(accountKey(id));
}

export async function findAccountByUsername(
  username: string,
): Promise<AccountRecord | null> {
  const needle = username.trim().toLowerCase();
  const ids = await listAccountIds();
  for (const id of ids) {
    const rec = await getAccountRecord(id);
    if (rec && rec.username === needle) return rec;
  }
  return null;
}

export async function listAccounts(): Promise<Account[]> {
  const ids = await listAccountIds();
  const out: Account[] = [];
  for (const id of ids) {
    const rec = await getAccountRecord(id);
    if (rec) out.push(publicAccount(rec));
  }
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export async function ensureDefaultAdmin(): Promise<Account[]> {
  const existing = await listAccounts();
  if (existing.length > 0) return existing;

  const now = Date.now();
  const id = 'acct_admin';
  const record: AccountRecord = {
    id,
    username: 'admin',
    displayName: '管理员',
    role: 'admin',
    totpEnabled: false,
    passwordHash: await hashPassword('admin123'),
    createdAt: now,
    updatedAt: now,
  };
  await kvPutJson(accountKey(id), record);
  await saveAccountIds([id]);
  return [publicAccount(record)];
}

async function issueSession(
  record: AccountRecord,
): Promise<{ token: string; account: Account; expiresAt: number }> {
  const token =
    newId('tok').replace(/^tok_/, '') + Math.random().toString(36).slice(2);
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const session: SessionRecord = {
    token,
    accountId: record.id,
    expiresAt,
  };
  await kvPutJson(sessionKey(token), session);
  return { token, account: publicAccount(record), expiresAt };
}

export type LoginResult =
  | { token: string; account: Account; expiresAt: number }
  | { requiresTotp: true; challengeToken: string };

export async function login(input: {
  username?: string;
  password?: string;
  challengeToken?: string;
  totpCode?: string;
}): Promise<LoginResult> {
  await ensureDefaultAdmin();

  // Step 2: challenge + TOTP
  if (input.challengeToken) {
    const challenge = await kvGetJson<ChallengeRecord>(
      challengeKey(input.challengeToken),
    );
    if (!challenge || challenge.expiresAt < Date.now()) {
      throw Object.assign(new Error('challenge_expired'), { status: 401 });
    }
    const record = await getAccountRecord(challenge.accountId);
    if (!record?.totpEnabled || !record.totpSecret) {
      throw Object.assign(new Error('invalid_credentials'), { status: 401 });
    }
    if (!(await verifyTotp(record.totpSecret, input.totpCode || ''))) {
      throw Object.assign(new Error('invalid_totp'), { status: 401 });
    }
    await getKv().delete(challengeKey(input.challengeToken));
    return issueSession(record);
  }

  const username = input.username?.trim() || '';
  const password = input.password || '';
  const record = await findAccountByUsername(username);
  if (!record || !(await verifyPassword(password, record.passwordHash))) {
    throw Object.assign(new Error('invalid_credentials'), { status: 401 });
  }

  if (record.totpEnabled && record.totpSecret) {
    if (input.totpCode) {
      if (!(await verifyTotp(record.totpSecret, input.totpCode))) {
        throw Object.assign(new Error('invalid_totp'), { status: 401 });
      }
      return issueSession(record);
    }
    const challengeToken =
      newId('chal').replace(/^chal_/, '') + Math.random().toString(36).slice(2);
    const challenge: ChallengeRecord = {
      token: challengeToken,
      accountId: record.id,
      expiresAt: Date.now() + CHALLENGE_TTL_MS,
    };
    await kvPutJson(challengeKey(challengeToken), challenge);
    return { requiresTotp: true, challengeToken };
  }

  return issueSession(record);
}

export async function logout(token: string | null): Promise<void> {
  if (!token) return;
  await getKv().delete(sessionKey(token));
}

export async function resolveSession(
  token: string | null,
): Promise<Account | null> {
  if (!token) return null;
  const session = await kvGetJson<SessionRecord>(sessionKey(token));
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    await getKv().delete(sessionKey(token));
    return null;
  }
  const record = await getAccountRecord(session.accountId);
  if (!record) return null;
  return publicAccount(record);
}

export async function changePassword(
  accountId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const record = await getAccountRecord(accountId);
  if (!record) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }
  if (!(await verifyPassword(currentPassword, record.passwordHash))) {
    throw Object.assign(new Error('invalid_credentials'), { status: 401 });
  }
  await kvPutJson(accountKey(accountId), {
    ...record,
    passwordHash: await hashPassword(newPassword),
    updatedAt: Date.now(),
  });
}

export async function beginTotpSetup(
  accountId: string,
  issuer: string,
): Promise<{ secret: string; otpauthUrl: string }> {
  const record = await getAccountRecord(accountId);
  if (!record) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }
  if (record.totpEnabled) {
    throw Object.assign(new Error('totp_already_enabled'), { status: 400 });
  }
  const secret = generateTotpSecret();
  await kvPutJson(accountKey(accountId), {
    ...record,
    totpPendingSecret: secret,
    updatedAt: Date.now(),
  });
  return {
    secret,
    otpauthUrl: buildOtpAuthUrl({
      secret,
      accountName: record.username,
      issuer: issuer || 'Kestrel',
    }),
  };
}

export async function confirmTotpSetup(
  accountId: string,
  code: string,
): Promise<Account> {
  const record = await getAccountRecord(accountId);
  if (!record?.totpPendingSecret) {
    throw Object.assign(new Error('totp_setup_required'), { status: 400 });
  }
  if (!(await verifyTotp(record.totpPendingSecret, code))) {
    throw Object.assign(new Error('invalid_totp'), { status: 401 });
  }
  const next: AccountRecord = {
    ...record,
    totpEnabled: true,
    totpSecret: record.totpPendingSecret,
    totpPendingSecret: undefined,
    updatedAt: Date.now(),
  };
  await kvPutJson(accountKey(accountId), next);
  return publicAccount(next);
}

export async function disableTotp(
  accountId: string,
  password: string,
  code: string,
): Promise<Account> {
  const record = await getAccountRecord(accountId);
  if (!record) {
    throw Object.assign(new Error('not_found'), { status: 404 });
  }
  if (!record.totpEnabled || !record.totpSecret) {
    throw Object.assign(new Error('totp_not_enabled'), { status: 400 });
  }
  if (!(await verifyPassword(password, record.passwordHash))) {
    throw Object.assign(new Error('invalid_credentials'), { status: 401 });
  }
  if (!(await verifyTotp(record.totpSecret, code))) {
    throw Object.assign(new Error('invalid_totp'), { status: 401 });
  }
  const next: AccountRecord = {
    ...record,
    totpEnabled: false,
    totpSecret: undefined,
    totpPendingSecret: undefined,
    updatedAt: Date.now(),
  };
  await kvPutJson(accountKey(accountId), next);
  return publicAccount(next);
}

export function extractBearerToken(request: Request): string | null {
  const header = request.headers.get('authorization') || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

// Keep unused create helpers out of public surface; retained for smoke if needed
export async function createAccount(input: {
  username: string;
  displayName: string;
  password: string;
  role?: AccountRole;
}): Promise<Account> {
  const username = input.username.trim().toLowerCase();
  const clash = await findAccountByUsername(username);
  if (clash) {
    throw Object.assign(new Error('username_exists'), { status: 409 });
  }
  const now = Date.now();
  const id = newId('acct');
  const record: AccountRecord = {
    id,
    username,
    displayName: input.displayName.trim(),
    role: input.role ?? 'viewer',
    totpEnabled: false,
    passwordHash: await hashPassword(input.password),
    createdAt: now,
    updatedAt: now,
  };
  await kvPutJson(accountKey(id), record);
  const ids = await listAccountIds();
  if (!ids.includes(id)) {
    ids.push(id);
    await saveAccountIds(ids);
  }
  return publicAccount(record);
}
