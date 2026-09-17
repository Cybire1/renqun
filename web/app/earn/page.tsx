import type { Metadata } from 'next';
import { Earn } from '@/components/Earn';

export const metadata: Metadata = { title: 'Earn' };

export default function EarnPage() {
  return <Earn />;
}
