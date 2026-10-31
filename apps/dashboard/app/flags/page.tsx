import type { Metadata } from 'next';
import { FlagsPage } from './flags';

export const metadata: Metadata = { title: 'Feature flags · Pulse Dashboard' };

export default function Page() {
  return <FlagsPage />;
}
