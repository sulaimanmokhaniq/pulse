'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getJson, sendJson } from '@/lib/client';
import { audience, timeAgo } from '@/lib/time';
import type { Flag } from '@/lib/types';
import { DEMO_SHOP_URL, SiteHeader } from '../site-header';

const WAKING_AFTER_MS = 3_000;
const SLIDER_DEBOUNCE_MS = 400;
const PASSWORD_KEY = 'pulse-admin-password';
const KEY_PATTERN = '[a-z0-9][a-z0-9_.\\-]{0,63}';

type Status = 'loading' | 'waking' | 'ready' | 'error';

function readPassword(): string {
  try {
    return sessionStorage.getItem(PASSWORD_KEY) ?? '';
  } catch {
    return '';
  }
}

function savePassword(value: string) {
  try {
    if (value) sessionStorage.setItem(PASSWORD_KEY, value);
    else sessionStorage.removeItem(PASSWORD_KEY);
  } catch {
    // private mode: the password just isn't remembered
  }
}

export function FlagsPage() {
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const [adminEnabled, setAdminEnabled] = useState(false);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [password, setPassword] = useState('');

  useEffect(() => setPassword(readPassword()), []);

  useEffect(() => {
    let live = true;
    setStatus('loading');
    const timer = setTimeout(() => live && setStatus('waking'), WAKING_AFTER_MS);
    getJson<{ flags: Flag[]; adminEnabled: boolean }>('/api/flags')
      .then((res) => {
        if (!live) return;
        setFlags(res.flags);
        setAdminEnabled(res.adminEnabled);
        setStatus('ready');
      })
      .catch((err) => {
        if (!live) return;
        setError(err instanceof Error ? err.message : 'Something went wrong');
        setStatus('error');
      })
      .finally(() => clearTimeout(timer));
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [attempt]);

  const replace = useCallback((flag: Flag) => {
    setFlags((list) => {
      if (!list) return [flag];
      const i = list.findIndex((f) => f.key === flag.key);
      if (i === -1) return [...list, flag].sort((a, b) => a.key.localeCompare(b.key));
      const next = [...list];
      next[i] = flag;
      return next;
    });
  }, []);

  const remove = useCallback((key: string) => setFlags((list) => list?.filter((f) => f.key !== key) ?? null), []);

  return (
    <main className="page">
      <SiteHeader />

      <p className="lede">
        Flags decide what each user sees in the{' '}
        <a href={DEMO_SHOP_URL} target="_blank" rel="noreferrer">
          demo shop
        </a>
        . Switch one or move its rollout, and the app follows within about 15 seconds, without a new release. The
        same user always gets the same answer, and raising the rollout only adds users.
      </p>

      <span className="status" role="status" aria-live="polite">
        {status === 'waking' && 'Waking up the API. The free tier sleeps when idle, so this can take up to a minute…'}
      </span>

      {status === 'error' && (
        <div className="notice notice-error">
          <p>{error}</p>
          <button className="button" onClick={() => setAttempt((a) => a + 1)}>
            Try again
          </button>
        </div>
      )}

      {flags && flags.length === 0 && (
        <div className="notice">
          <p>No flags yet.</p>
        </div>
      )}

      {flags && flags.length > 0 && (
        <ul className="flag-list">
          {flags.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              onSaved={replace}
              onDeleted={remove}
              password={adminEnabled ? password : ''}
            />
          ))}
        </ul>
      )}

      {flags && (
        <p className="footnote">
          The SDK records a <code>$feature_flag_called</code> event the first time it reads a flag for a user, with
          the value they got.{' '}
          <Link href="/?event=%24feature_flag_called">See exposures in Trends</Link>.
        </p>
      )}

      {flags && adminEnabled && (
        <AdminPanel
          password={password}
          onPassword={(p) => {
            setPassword(p);
            savePassword(p);
          }}
          onCreated={replace}
          existing={flags.map((f) => f.key)}
        />
      )}
    </main>
  );
}

function FlagRow({
  flag,
  onSaved,
  onDeleted,
  password,
}: {
  flag: Flag;
  onSaved: (f: Flag) => void;
  onDeleted: (key: string) => void;
  password: string;
}) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [rollout, setRollout] = useState(flag.rolloutPercent);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Server state wins after every save or reload.
  useEffect(() => {
    setEnabled(flag.enabled);
    setRollout(flag.rolloutPercent);
  }, [flag.enabled, flag.rolloutPercent]);

  useEffect(() => () => clearTimeout(debounce.current), []);

  const save = async (changes: { enabled?: boolean; rolloutPercent?: number }) => {
    setSaving(true);
    setError('');
    try {
      const updated = await sendJson<Flag>('PATCH', `/api/flags/${flag.key}`, changes);
      if (updated) onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save');
      setEnabled(flag.enabled);
      setRollout(flag.rolloutPercent);
    } finally {
      setSaving(false);
    }
  };

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    void save({ enabled: next });
  };

  const slide = (value: number) => {
    setRollout(value);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => void save({ rolloutPercent: value }), SLIDER_DEBOUNCE_MS);
  };

  const del = async () => {
    if (!window.confirm(`Delete the flag "${flag.key}"? Apps will treat it as off.`)) return;
    try {
      await sendJson('DELETE', `/api/flags/${flag.key}`, undefined, { 'x-admin-password': password });
      onDeleted(flag.key);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  };

  const sliderId = `rollout-${flag.key}`;

  return (
    <li className="flag card">
      <div className="flag-head">
        <div className="flag-title">
          <code className="flag-key">{flag.key}</code>
          {flag.description && <p className="flag-desc">{flag.description}</p>}
        </div>
        <button
          role="switch"
          aria-checked={enabled}
          aria-label={`${flag.key} ${enabled ? 'on' : 'off'}`}
          className={enabled ? 'switch switch-on' : 'switch'}
          onClick={toggle}
        >
          <span className="switch-thumb" />
        </button>
      </div>

      <div className={enabled ? 'rollout' : 'rollout rollout-off'}>
        <label htmlFor={sliderId} className="rollout-label">
          Rollout
        </label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={100}
          step={5}
          value={rollout}
          onChange={(e) => slide(Number(e.target.value))}
          aria-valuetext={`${rollout}% of users`}
          style={{ '--fill': `${rollout}%` } as React.CSSProperties}
        />
        <span className="rollout-value">{rollout}%</span>
      </div>

      <div className="flag-foot">
        <span className={enabled && rollout > 0 ? 'audience audience-on' : 'audience'}>
          {audience(enabled, rollout)}
        </span>
        <span className="flag-meta" aria-live="polite">
          {error ? <span className="flag-error">{error}</span> : saving ? 'Saving…' : `Changed ${timeAgo(flag.updatedAt)}`}
        </span>
        {password && (
          <button className="link-button" onClick={del}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}

function AdminPanel({
  password,
  onPassword,
  onCreated,
  existing,
}: {
  password: string;
  onPassword: (p: string) => void;
  onCreated: (f: Flag) => void;
  existing: string[];
}) {
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (existing.includes(key)) {
      setMessage(`"${key}" already exists`);
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const flag = await sendJson<Flag>(
        'PUT',
        `/api/flags/${key}`,
        { description, enabled: false, rolloutPercent: 100 },
        { 'x-admin-password': password },
      );
      if (flag) onCreated(flag);
      setKey('');
      setDescription('');
      setMessage(`Created "${flag?.key}". It starts off; switch it on above.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not create the flag');
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="admin card">
      <summary>Admin: create and delete flags</summary>
      <label className="field">
        <span>Admin password</span>
        <input
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => onPassword(e.target.value)}
        />
      </label>
      <form className="create-form" onSubmit={create}>
        <label className="field">
          <span>Key</span>
          <input
            required
            pattern={KEY_PATTERN}
            title="Lowercase letters, digits, _ . - (up to 64)"
            placeholder="new_checkout"
            value={key}
            onChange={(e) => setKey(e.target.value.toLowerCase())}
          />
        </label>
        <label className="field field-grow">
          <span>Description</span>
          <input maxLength={500} placeholder="What it changes" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <button className="button button-primary" type="submit" disabled={busy || !password}>
          {busy ? 'Creating…' : 'Create flag'}
        </button>
      </form>
      {message && (
        <p className="admin-message" role="status">
          {message}
        </p>
      )}
    </details>
  );
}
